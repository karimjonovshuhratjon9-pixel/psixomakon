import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Clock,
  CloudUpload,
  Loader2,
  Send,
  AlertTriangle,
  LifeBuoy,
} from "lucide-react";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../context/AuthContext";
import { useToast } from "../../context/toastCtx";
import { fetchFullTest, formatDuration } from "../../lib/api";
import { startAttempt } from "../../lib/attempts";
import { uzError } from "../../lib/errors";
import { Card, ErrorBox, Spinner, cn } from "../../components/ui";
import type { Answer, Attempt, FullTest } from "../../types";

type SaveState = "idle" | "saving" | "saved" | "error";

/**
 * O'quvchi uchun `attempts` dan olinadigan ustunlar (ixtiyoriy, boshqa
 * sahifalarda ishlatiladi). Natija ustunlari (percent / total_score /
 * dimension_result) ATAYLAB so'ralmaydi: bazada ham ular o'quvchi rolida
 * GRANT bilan yopilgan.
 */
export const STUDENT_ATTEMPT_COLUMNS =
  "id,assignment_id,test_id,student_id,status,round,started_at,deadline_at,submitted_at,auto_submitted,updated_at";

export function TakeTestPage() {
  const { assignmentId } = useParams();
  const { profile } = useAuth();
  const toast = useToast();

  const [full, setFull] = useState<FullTest | null>(null);
  const [attempt, setAttempt] = useState<Attempt | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [idx, setIdx] = useState(0);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [now, setNow] = useState(Date.now());
  const [submitting, setSubmitting] = useState(false);
  const [finished, setFinished] = useState(false);
  const autoSubmittedRef = useRef(false);

  // ---------- yuklash / davom ettirish ----------
  const boot = useCallback(async () => {
    if (!assignmentId || !profile) return;
    setLoading(true);
    setError(null);
    try {
      // 1) Urinishni server yaratadi/tekshiradi (start_attempt RPC).
      //    Xato bo'lsa ANIQ sabab qaytadi: "tayinlanmagan", "akkaunt bloklangan"...
      const started = await startAttempt(assignmentId);
      if (!started.ok) {
        throw new Error(started.message ?? "Testni boshlab bo'lmadi");
      }

      // 2) Test sarlavhasi va o'lchovlari (start_attempt bilan birga keladi)
      let test = started.test;
      if (!test) {
        const { data: assign } = await supabase
          .from("assignments")
          .select("test_id")
          .eq("id", assignmentId)
          .maybeSingle();
        if (!assign) throw new Error("Bu test sizga tayinlanmagan");
        test = (await fetchFullTest(assign.test_id)).test;
      }

      // 3) Savollar va variantlar
      const data = await fetchFullTest(test.id);
      setFull(data);

      const at = started.attempt ?? null;
      if (!at) throw new Error("Urinish ma'lumotlari qaytmadi. Qayta urinib ko'ring.");

      if (at.status === "submitted") {
        setFinished(true);
        setAttempt(at);
        return;
      }

      setAttempt(at);
      const { data: ans, error: ansErr } = await supabase
        .from("answers")
        .select("*")
        .eq("attempt_id", at.id);
      if (ansErr) throw ansErr;
      const map: Record<string, string> = {};
      ((ans ?? []) as Answer[]).forEach((a) => {
        if (a.option_id) map[a.question_id] = a.option_id;
      });
      setAnswers(map);
    } catch (e) {
      setError(uzError(e));
    } finally {
      setLoading(false);
    }
  }, [assignmentId, profile]);

  useEffect(() => {
    boot();
  }, [boot]);

  // ---------- taymer ----------
  useEffect(() => {
    if (!attempt || attempt.status !== "in_progress" || !attempt.deadline_at)
      return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [attempt]);

  const remaining = attempt?.deadline_at
    ? Math.max(
        0,
        Math.floor((new Date(attempt.deadline_at).getTime() - now) / 1000),
      )
    : null;

  // ---------- topshirish ----------
  const submit = useCallback(
    async (auto: boolean) => {
      if (!attempt || submitting || attempt.status !== "in_progress") return;
      setSubmitting(true);
      try {
        if (auto)
          await supabase
            .from("attempts")
            .update({ auto_submitted: true })
            .eq("id", attempt.id)
            .eq("student_id", attempt.student_id);
        const { error: e } = await supabase.rpc("score_attempt", {
          p_attempt_id: attempt.id,
        });
        if (e) throw e;
        setFinished(true);
        setAttempt({ ...attempt, status: "submitted" });
      } catch (e) {
        toast(uzError(e), "error");
      } finally {
        setSubmitting(false);
      }
    },
    [attempt, submitting, toast],
  );

  // vaqt tugaganda avtomatik topshirish
  useEffect(() => {
    if (
      remaining === 0 &&
      attempt?.status === "in_progress" &&
      !autoSubmittedRef.current &&
      !finished
    ) {
      autoSubmittedRef.current = true;
      submit(true);
    }
  }, [remaining, attempt, finished, submit]);

  // ---------- javob tanlash (avtomatik saqlash) ----------
  async function choose(questionId: string, optionId: string) {
    if (!attempt || attempt.status !== "in_progress") return;
    setAnswers((a) => ({ ...a, [questionId]: optionId }));
    setSaveState("saving");
    const { error } = await supabase.from("answers").upsert(
      {
        attempt_id: attempt.id,
        question_id: questionId,
        option_id: optionId,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "attempt_id,question_id" },
    );
    if (error) {
      setSaveState("error");
      toast("Javob saqlanmadi: " + uzError(error), "error");
      return;
    }
    setSaveState("saved");
  }

  // ---------- render ----------
  if (loading)
    return (
      <div className="py-20">
        <Spinner label="Test yuklanmoqda..." />
      </div>
    );

  if (error)
    return (
      <div className="mx-auto max-w-lg py-16">
        <ErrorBox message={error} />
        <Link to="/app/my-tests" className="btn-secondary mt-4">
          <ArrowLeft size={15} /> Testlarga qaytish
        </Link>
      </div>
    );

  if (finished || attempt?.status === "submitted")
    return (
      <div className="mx-auto max-w-lg py-14 text-center">
        <div className="mx-auto mb-5 grid h-16 w-16 place-items-center rounded-3xl bg-forest-100 text-forest-700">
          <CheckCircle2 size={30} />
        </div>
        <h1 className="font-display text-2xl text-forest-950">
          Test yakunlandi
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-ink/55">
          Javoblaringiz saqlandi. Natija psixologingizga yuborildi. Natijani
          psixologingiz bilan suhbatda muhokama qilasiz.
        </p>
        <Link to="/app/my-tests" className="btn-primary mt-6">
          Testlarimga qaytish
        </Link>
      </div>
    );

  if (!full || !attempt) return null;

  const { test, questions } = full;
  const q = questions[idx];
  const answeredCount = Object.keys(answers).length;
  const progress = Math.round((answeredCount / questions.length) * 100);
  const letter = (i: number) => String.fromCharCode(65 + i);
  const timeLow = remaining !== null && remaining <= 60;

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-wider text-ink/40">
            {test.category}
          </p>
          <h1 className="font-display text-xl leading-tight text-forest-950 sm:text-2xl">
            {test.title}
          </h1>
        </div>
        <div className="flex items-center gap-2">
          {remaining !== null && (
            <span
              className={cn(
                "inline-flex items-center gap-1.5 rounded-2xl px-3 py-2 text-sm font-bold tabular-nums ring-1",
                timeLow
                  ? "animate-pulse bg-rose-50 text-rose-700 ring-rose-200"
                  : "bg-white text-forest-900 ring-ink/10",
              )}
            >
              <Clock size={15} /> {formatDuration(remaining)}
            </span>
          )}
          <span className="inline-flex items-center gap-1.5 rounded-2xl bg-white px-3 py-2 text-[12px] font-semibold text-ink/50 ring-1 ring-ink/10">
            {saveState === "saving" ? (
              <>
                <Loader2 size={14} className="animate-spin" /> Saqlanmoqda
              </>
            ) : saveState === "saved" ? (
              <>
                <CloudUpload size={14} className="text-forest-600" /> Saqlandi
              </>
            ) : saveState === "error" ? (
              <>
                <AlertTriangle size={14} className="text-rose-500" /> Xato
              </>
            ) : (
              <>
                <CloudUpload size={14} /> Avtomatik saqlash
              </>
            )}
          </span>
        </div>
      </div>

      {timeLow && (
        <div className="mb-4 rounded-2xl bg-rose-50 px-4 py-2.5 text-[12.5px] font-medium text-rose-700 ring-1 ring-rose-100">
          Vaqt tugamoqda! Vaqt tugaganda test avtomatik topshiriladi.
        </div>
      )}

      <div className="mb-5">
        <div className="mb-1.5 flex items-center justify-between text-[11.5px] font-semibold text-ink/45">
          <span>
            {answeredCount} / {questions.length} savolga javob berildi
          </span>
          <span>{progress}%</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-forest-100/70">
          <div
            className="h-full rounded-full bg-forest-600 transition-all duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_260px]">
        <Card className="p-5 sm:p-7">
          <p className="text-[11px] font-bold uppercase tracking-wider text-ink/40">
            Savol {idx + 1} / {questions.length}
          </p>
          <h2 className="mt-2 text-lg font-semibold leading-snug text-forest-950">
            {q.text}
          </h2>

          <div className="mt-5 space-y-2.5">
            {q.options.map((o, oi) => {
              const selected = answers[q.id] === o.id;
              return (
                <button
                  key={o.id}
                  onClick={() => choose(q.id, o.id)}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-2xl border px-4 py-3 text-left text-[14px] transition",
                    selected
                      ? "border-forest-700 bg-forest-50 text-forest-950 shadow-soft"
                      : "border-ink/10 bg-white text-ink/70 hover:border-forest-300 hover:bg-forest-50/40",
                  )}
                >
                  <span
                    className={cn(
                      "grid h-8 w-8 shrink-0 place-items-center rounded-xl text-[12px] font-bold transition",
                      selected
                        ? "bg-forest-800 text-white"
                        : "bg-cream text-ink/45 ring-1 ring-ink/10",
                    )}
                  >
                    {letter(oi)}
                  </span>
                  <span className="flex-1">{o.text}</span>
                  {selected && (
                    <CheckCircle2
                      size={18}
                      className="shrink-0 text-forest-700"
                    />
                  )}
                </button>
              );
            })}
          </div>

          <div className="mt-6 flex items-center justify-between gap-3">
            <button
              className="btn-secondary"
              onClick={() => setIdx((i) => Math.max(0, i - 1))}
              disabled={idx === 0}
            >
              <ArrowLeft size={15} /> Oldingi
            </button>
            {idx < questions.length - 1 ? (
              <button
                className="btn-primary"
                onClick={() =>
                  setIdx((i) => Math.min(questions.length - 1, i + 1))
                }
              >
                Keyingi <ArrowRight size={15} />
              </button>
            ) : (
              <button
                className="btn-primary"
                onClick={() => {
                  const left = questions.length - answeredCount;
                  if (
                    left > 0 &&
                    !confirm(
                      `${left} ta savolga javob berilmagan. Baribir topshirasizmi?`,
                    )
                  )
                    return;
                  submit(false);
                }}
                disabled={submitting}
              >
                {submitting ? (
                  <Loader2 size={15} className="animate-spin" />
                ) : (
                  <Send size={15} />
                )}{" "}
                Testni topshirish
              </button>
            )}
          </div>
        </Card>

        <div className="space-y-4">
          <Card className="p-4">
            <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-ink/40">
              Savollar xaritasi
            </p>
            <div className="grid grid-cols-7 gap-1.5 lg:grid-cols-5">
              {questions.map((qq, i) => {
                const done = Boolean(answers[qq.id]);
                return (
                  <button
                    key={qq.id}
                    onClick={() => setIdx(i)}
                    className={cn(
                      "grid aspect-square place-items-center rounded-xl text-[12px] font-bold transition",
                      i === idx
                        ? "bg-forest-800 text-white ring-2 ring-forest-300"
                        : done
                          ? "bg-sage-200 text-forest-900"
                          : "bg-cream text-ink/40 ring-1 ring-ink/10 hover:bg-white",
                    )}
                  >
                    {i + 1}
                  </button>
                );
              })}
            </div>
            <div className="mt-3 space-y-1 text-[11px] text-ink/45">
              <p className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded bg-sage-200" /> Javob
                berilgan
              </p>
              <p className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded bg-cream ring-1 ring-ink/15" />{" "}
                Javobsiz
              </p>
            </div>
          </Card>

          <Card className="p-4 text-[11.5px] leading-relaxed text-ink/50">
            <p className="mb-1 flex items-center gap-1.5 font-semibold text-ink/65">
              <LifeBuoy size={14} /> Eslatma
            </p>
            Javoblar darhol saqlanadi. Sahifani yopsangiz ham vaqt davom etadi —
            qaytib kirganingizda test avtomatik davom etadi.
          </Card>

          <button
            className="btn-secondary w-full !text-[12.5px]"
            onClick={() => {
              const left = questions.length - answeredCount;
              if (
                left > 0 &&
                !confirm(
                  `${left} ta savolga javob berilmagan. Baribir topshirasizmi?`,
                )
              )
                return;
              submit(false);
            }}
            disabled={submitting}
          >
            <Send size={14} /> Yakunlash
          </button>
        </div>
      </div>
    </div>
  );
}
