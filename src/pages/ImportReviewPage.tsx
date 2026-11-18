import { useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  CheckCircle2,
  FileText,
  Plus,
  Save,
  Trash2,
} from "lucide-react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/toastCtx";
import { uzError } from "../lib/errors";
import {
  Badge,
  Card,
  ConfirmDialog,
  ErrorBox,
  InfoBox,
  PageHeader,
  Segmented,
  cn,
} from "../components/ui";
import { CATEGORIES, type ImportDraft, type TestKind } from "../types";

interface NavState {
  draft?: ImportDraft;
  fileName?: string;
  fileSize?: number;
}

const LETTER = (i: number) => String.fromCharCode(65 + i);

/**
 * Import natijasini tekshirish va tahrirlash.
 * Foydalanuvchi tasdiqlamaguncha bazaga HECH NARSA yozilmaydi.
 */
export function ImportReviewPage() {
  const nav = useNavigate();
  const location = useLocation();
  const { profile } = useAuth();
  const toast = useToast();
  const state = (location.state ?? {}) as NavState;

  const [draft, setDraft] = useState<ImportDraft | null>(state.draft ?? null);
  const [title, setTitle] = useState(state.draft?.title ?? "");
  const [description, setDescription] = useState(
    state.draft?.description ?? "",
  );
  const [category, setCategory] = useState(state.draft?.category ?? "Umumiy");
  const [kind, setKind] = useState<TestKind>(state.draft?.kind ?? "standard");
  const [timed, setTimed] = useState(false);
  const [minutes, setMinutes] = useState(15);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [delIdx, setDelIdx] = useState<number | null>(null);

  // TS uchun: quyidagi closure'lar ichida draft aniq `ImportDraft` bo'lishi kerak
  const d: ImportDraft | null = draft;

  const stats = useMemo(() => {
    const qs = draft?.questions ?? [];
    const withOpts = qs.filter((q) => q.options.length >= 2).length;
    const withCorrect = qs.filter((q) =>
      q.options.some((o) => o.correct),
    ).length;
    const noOpts = qs.filter((q) => q.options.length < 2).length;
    return { total: qs.length, withOpts, withCorrect, noOpts };
  }, [draft]);

  if (!draft) {
    return (
      <div>
        <PageHeader title="Import natijasi topilmadi" />
        <Card className="p-8 text-center">
          <p className="text-sm text-ink/55">
            Fayl yuklanmagan yoki sahifa yangilangan. Test yaratish sahifasidan
            qaytadan boshlang.
          </p>
          <button
            className="btn-primary mt-5"
            onClick={() => nav("/app/tests/new")}
          >
            <ArrowLeft size={15} /> Test yaratishga qaytish
          </button>
        </Card>
      </div>
    );
  }

  /* ------------------------------- tahrirlash --------------------------- */
  function patchQuestion(
    i: number,
    patch: Partial<ImportDraft["questions"][0]>,
  ) {
    setDraft((d) =>
      d
        ? {
            ...d,
            questions: d.questions.map((q, idx) =>
              idx === i ? { ...q, ...patch } : q,
            ),
          }
        : d,
    );
  }

  function patchOption(
    qi: number,
    oi: number,
    patch: { text?: string; correct?: boolean },
  ) {
    setDraft((d) =>
      d
        ? {
            ...d,
            questions: d.questions.map((q, idx) => {
              if (idx !== qi) return q;
              return {
                ...q,
                options: q.options.map((o, j) => {
                  if (j !== oi) {
                    // bitta to'g'ri javob qoidasi (standart test)
                    return patch.correct && kind === "standard"
                      ? { ...o, correct: false }
                      : o;
                  }
                  return { ...o, ...patch };
                }),
              };
            }),
          }
        : d,
    );
  }

  function addOption(qi: number) {
    setDraft((d) =>
      d
        ? {
            ...d,
            questions: d.questions.map((q, idx) =>
              idx === qi
                ? {
                    ...q,
                    options: [...q.options, { text: "", correct: false }],
                  }
                : q,
            ),
          }
        : d,
    );
  }

  function removeOption(qi: number, oi: number) {
    setDraft((d) =>
      d
        ? {
            ...d,
            questions: d.questions.map((q, idx) =>
              idx === qi
                ? { ...q, options: q.options.filter((_, j) => j !== oi) }
                : q,
            ),
          }
        : d,
    );
  }

  function addQuestion() {
    setDraft((d) =>
      d
        ? {
            ...d,
            questions: [
              ...d.questions,
              {
                text: "",
                options: [
                  { text: "", correct: false },
                  { text: "", correct: false },
                ],
                needs_review: true,
              },
            ],
          }
        : d,
    );
  }

  function removeQuestion(i: number) {
    setDraft((d) =>
      d ? { ...d, questions: d.questions.filter((_, idx) => idx !== i) } : d,
    );
    setDelIdx(null);
  }

  /* -------------------------------- saqlash ----------------------------- */
  function validate(): string | null {
    if (title.trim().length < 3) return "Test nomini kiriting";
    const usable = d!.questions.filter(
      (q) =>
        q.text.trim() && q.options.filter((o) => o.text.trim()).length >= 2,
    );
    if (usable.length === 0)
      return "Kamida bitta to‘liq savol kerak (matn + 2 variant)";
    for (const [i, q] of d!.questions.entries()) {
      const opts = q.options.filter((o) => o.text.trim());
      if (!q.text.trim() && opts.length === 0) continue; // bo'sh qator — o'tkazamiz
      if (opts.length < 2) return `${i + 1}-savolda kamida 2 ta variant kerak`;
      if (
        kind === "standard" &&
        !q.options.some((o) => o.correct && o.text.trim())
      )
        return `${i + 1}-savolda to‘g‘ri javob belgilanmagan`;
    }
    return null;
  }

  async function save() {
    setError(null);
    const v = validate();
    if (v) return setError(v);
    if (!profile) return;

    setSaving(true);
    try {
      const scope = profile.role === "admin" ? "library" : "personal";
      const { data: test, error: tErr } = await supabase
        .from("tests")
        .insert({
          title: title.trim(),
          description: description.trim(),
          category,
          kind,
          scope,
          owner_id: profile.role === "admin" ? null : profile.id,
          time_limit_sec: timed ? minutes * 60 : null,
          scoring: { type: "correct" },
        })
        .select("id")
        .single();
      if (tErr) throw tErr;

      const testId = test.id as string;
      const usable = d!.questions.filter(
        (q) =>
          q.text.trim() && q.options.filter((o) => o.text.trim()).length >= 2,
      );

      for (const [qi, q] of usable.entries()) {
        const { data: qRow, error: qErr } = await supabase
          .from("questions")
          .insert({ test_id: testId, position: qi + 1, text: q.text.trim() })
          .select("id")
          .single();
        if (qErr) throw qErr;

        const opts = q.options
          .filter((o) => o.text.trim())
          .map((o, oi) => ({
            question_id: qRow.id as string,
            position: oi + 1,
            text: o.text.trim(),
            score: kind === "standard" ? (o.correct ? 1 : 0) : 0,
            dim_scores: {},
          }));
        const { error: oErr } = await supabase.from("options").insert(opts);
        if (oErr) throw oErr;
      }

      // Import izi (ixtiyoriy — jadval bo'lmasa jim o'tkazamiz)
      try {
        await supabase.from("user_imports").insert({
          user_id: profile.id,
          file_name: state.fileName ?? "import",
          file_size: state.fileSize ?? null,
          mime_type: null,
          status: "applied",
          result: {
            questions: usable.length,
            confidence: d!.confidence,
            source: d!.source,
          },
        });
      } catch {
        /* ixtiyoriy */
      }

      toast(`Test saqlandi — ${usable.length} ta savol`);
      nav(`/app/tests/${testId}`);
    } catch (e) {
      setError(uzError(e));
    } finally {
      setSaving(false);
    }
  }

  const conf = draft.confidence;

  return (
    <div className="pb-24">
      <button
        onClick={() => nav("/app/tests/new")}
        className="mb-4 inline-flex items-center gap-1.5 text-[13px] font-semibold text-ink/50 hover:text-forest-800"
      >
        <ArrowLeft size={15} /> Orqaga
      </button>

      <PageHeader
        eyebrow="Import natijasi"
        title="Savollarni tekshiring"
        subtitle="Ajratilgan savollarni ko‘rib chiqing, kerak bo‘lganlarini tuzating. Faqat tasdiqlaganingizdan keyin test bazaga saqlanadi."
        actions={
          <button className="btn-primary" onClick={save} disabled={saving}>
            <Save size={16} />{" "}
            {saving ? "Saqlanmoqda..." : "Tasdiqlash va saqlash"}
          </button>
        }
      />

      {/* Xulosa */}
      <div className="mb-5 grid gap-3 sm:grid-cols-4">
        <Card className="px-4 py-3">
          <p className="text-[11.5px] font-semibold text-ink/50">Fayl</p>
          <p className="mt-0.5 truncate text-[13px] font-semibold text-forest-950">
            {state.fileName ?? "—"}
          </p>
        </Card>
        <Card className="px-4 py-3">
          <p className="text-[11.5px] font-semibold text-ink/50">Savollar</p>
          <p className="mt-0.5 font-display text-lg text-forest-950">
            {stats.total}
          </p>
        </Card>
        <Card className="px-4 py-3">
          <p className="text-[11.5px] font-semibold text-ink/50">
            To‘g‘ri javobli
          </p>
          <p className="mt-0.5 font-display text-lg text-forest-600">
            {stats.withCorrect}
          </p>
        </Card>
        <Card className="px-4 py-3">
          <p className="text-[11.5px] font-semibold text-ink/50">
            Ajratish sifati
          </p>
          <div className="mt-1.5 flex items-center gap-2">
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-ink/10">
              <div
                className={cn(
                  "h-full rounded-full",
                  conf >= 70
                    ? "bg-forest-600"
                    : conf >= 40
                      ? "bg-amber-500"
                      : "bg-rose-500",
                )}
                style={{ width: `${conf}%` }}
              />
            </div>
            <span className="text-[12px] font-bold text-ink/70">{conf}%</span>
          </div>
        </Card>
      </div>

      {/* Ogohlantirishlar */}
      {(draft.warnings.length > 0 || stats.noOpts > 0) && (
        <div className="mb-5 space-y-2">
          {draft.warnings.map((w, i) => (
            <InfoBox key={i} tone="warn">
              {w}
            </InfoBox>
          ))}
          {stats.noOpts > 0 && (
            <InfoBox tone="warn">
              <b>{stats.noOpts} ta savolda variantlar yo‘q.</b> Har biriga
              kamida 2 ta javob varianti qo‘shing, aks holda ular saqlanmaydi.
            </InfoBox>
          )}
        </div>
      )}

      {error && <ErrorBox message={error} className="mb-5" />}

      {/* Test ma'lumotlari */}
      <Card className="mb-5 p-5">
        <h2 className="mb-4 flex items-center gap-2 font-semibold text-forest-950">
          <FileText size={16} className="text-forest-600" /> Test ma’lumotlari
        </h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="label">Test nomi *</label>
            <input
              className="field"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Test nomi"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="label">Tavsif</label>
            <textarea
              className="field min-h-[70px] resize-y"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Qisqa tavsif"
            />
          </div>
          <div>
            <label className="label">Kategoriya</label>
            <select
              className="field"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              {CATEGORIES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Test turi</label>
            <Segmented
              value={kind}
              onChange={setKind}
              className="w-full"
              options={[
                { value: "standard", label: "Standart" },
                { value: "psych", label: "Psixologik" },
              ]}
            />
          </div>
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 text-[13px] text-ink/70">
              <input
                type="checkbox"
                className="h-4 w-4 accent-forest-700"
                checked={timed}
                onChange={(e) => setTimed(e.target.checked)}
              />
              Vaqt chegarasi
            </label>
            {timed && (
              <div className="flex items-center gap-1.5">
                <input
                  type="number"
                  min={1}
                  className="field !w-20 !py-1.5"
                  value={minutes}
                  onChange={(e) => setMinutes(Number(e.target.value) || 1)}
                />
                <span className="text-[12px] text-ink/50">daqiqa</span>
              </div>
            )}
          </div>
        </div>
      </Card>

      {/* Savollar */}
      <div className="space-y-3">
        {draft.questions.map((q, qi) => {
          const isProblem =
            q.options.filter((o) => o.text.trim()).length < 2 ||
            (kind === "standard" && !q.options.some((o) => o.correct));
          return (
            <Card key={qi} className="p-4">
              <div className="mb-3 flex items-start gap-2.5">
                <span
                  className={cn(
                    "mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg text-[11.5px] font-bold",
                    isProblem
                      ? "bg-amber-100 text-amber-700 dark:bg-amber-400/20 dark:text-amber-300"
                      : "bg-forest-800 text-white dark:text-forest-50",
                  )}
                >
                  {qi + 1}
                </span>
                <textarea
                  className="field min-h-[52px] flex-1 resize-y !py-2.5"
                  value={q.text}
                  onChange={(e) => patchQuestion(qi, { text: e.target.value })}
                  placeholder="Savol matni"
                />
                <button
                  className="btn-icon text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10"
                  onClick={() => setDelIdx(qi)}
                  title="Savolni o‘chirish"
                >
                  <Trash2 size={15} />
                </button>
              </div>

              <div className="space-y-2 pl-0 sm:pl-9">
                {q.options.map((o, oi) => (
                  <div key={oi} className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        patchOption(qi, oi, {
                          correct: kind === "standard" ? !o.correct : o.correct,
                        })
                      }
                      title={
                        kind === "standard" ? "To‘g‘ri javobni belgilash" : ""
                      }
                      className={cn(
                        "grid h-7 w-7 shrink-0 place-items-center rounded-lg text-[11px] font-bold ring-1 transition",
                        o.correct
                          ? "bg-forest-800 text-white ring-forest-800 dark:text-forest-50"
                          : "bg-surface text-ink/45 ring-ink/10 hover:bg-forest-50",
                      )}
                    >
                      {o.correct ? <Check size={13} /> : LETTER(oi)}
                    </button>
                    <input
                      className="field !py-2 !text-[13px]"
                      value={o.text}
                      onChange={(e) =>
                        patchOption(qi, oi, { text: e.target.value })
                      }
                      placeholder={`${LETTER(oi)}) variant`}
                    />
                    {q.options.length > 2 && (
                      <button
                        className="btn-icon shrink-0 text-ink/30 hover:text-rose-500"
                        onClick={() => removeOption(qi, oi)}
                        title="Variantni o‘chirish"
                      >
                        <Trash2 size={13} />
                      </button>
                    )}
                  </div>
                ))}
                <button
                  className="btn-ghost !py-1.5 !text-[12px]"
                  onClick={() => addOption(qi)}
                >
                  <Plus size={13} /> Variant qo‘shish
                </button>
              </div>

              {isProblem && (
                <p className="mt-2 flex items-center gap-1.5 pl-0 text-[11.5px] text-amber-700 sm:pl-9 dark:text-amber-300">
                  <AlertTriangle size={12} />
                  {q.options.filter((o) => o.text.trim()).length < 2
                    ? "Kamida 2 ta variant kerak"
                    : "To‘g‘ri javob belgilanmagan"}
                </p>
              )}
            </Card>
          );
        })}
      </div>

      <button className="btn-secondary mt-4 w-full" onClick={addQuestion}>
        <Plus size={15} /> Savol qo‘shish
      </button>

      {stats.withOpts > 0 && (
        <InfoBox tone="success" className="mt-5">
          <span className="inline-flex items-center gap-1.5">
            <CheckCircle2 size={14} />
            {stats.total} ta savoldan {stats.withOpts} tasi to‘liq. Saqlashda
            faqat to‘liq savollar testga kiradi.
          </span>
        </InfoBox>
      )}

      {/* Pastda yopishib turuvchi saqlash paneli */}
      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-ink/8 bg-cream/90 px-4 py-3 backdrop-blur-xl lg:pl-[264px]">
        <div className="mx-auto flex max-w-[1240px] items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge tone={stats.withCorrect ? "sage" : "amber"}>
              {stats.withCorrect} / {stats.total} to‘g‘ri javobli
            </Badge>
            {stats.noOpts > 0 && (
              <Badge tone="rose">{stats.noOpts} ta muammoli</Badge>
            )}
          </div>
          <button className="btn-primary" onClick={save} disabled={saving}>
            <Save size={16} />{" "}
            {saving ? "Saqlanmoqda..." : "Tasdiqlash va saqlash"}
          </button>
        </div>
      </div>

      <ConfirmDialog
        open={delIdx !== null}
        onClose={() => setDelIdx(null)}
        onConfirm={() => delIdx !== null && removeQuestion(delIdx)}
        title="Savolni o‘chirish"
        confirmLabel="O‘chirish"
        danger
        body={`${(delIdx ?? 0) + 1}-savol import ro‘yxatidan olib tashlanadi. Bu amalni bekor qilish uchun faylni qayta yuklang.`}
      />
    </div>
  );
}
