import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  ArrowLeft,
  Pencil,
  Clock,
  Users,
  Sparkles,
  Send,
  CheckCircle2,
} from "lucide-react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/toastCtx";
import { useQuery } from "../context/ToastProvider";
import { useFullTest } from "../lib/api";
import { uzError } from "../lib/errors";
import {
  Badge,
  Card,
  ErrorBox,
  Modal,
  PageHeader,
  Spinner,
} from "../components/ui";
import type { Profile, Group } from "../types";

export function TestPreviewPage() {
  const { id } = useParams();
  const { profile } = useAuth();
  const toast = useToast();
  const { data, loading, error } = useFullTest(id);
  const [assignOpen, setAssignOpen] = useState(false);
  const canEdit =
    profile?.role === "admin" || data?.test.owner_id === profile?.id;

  if (loading) return <Spinner />;
  if (error) return <ErrorBox message={error} />;
  if (!data) return null;
  const { test, questions } = data;
  const letter = (i: number) => String.fromCharCode(65 + i);

  return (
    <div>
      <Link
        to="/app/tests"
        className="mb-4 inline-flex items-center gap-1.5 text-[13px] font-semibold text-ink/50 hover:text-forest-800"
      >
        <ArrowLeft size={15} /> Testlarga qaytish
      </Link>

      <PageHeader
        title={test.title}
        subtitle={test.description || "Tavsif kiritilmagan"}
        actions={
          <>
            <button
              className="btn-secondary"
              onClick={() => setAssignOpen(true)}
            >
              <Send size={15} /> Tayinlash
            </button>
            {canEdit && (
              <Link to={`/app/tests/${test.id}/edit`} className="btn-primary">
                <Pencil size={15} /> Tahrirlash
              </Link>
            )}
          </>
        }
      />

      <div className="mb-5 grid gap-3 sm:grid-cols-4">
        {[
          {
            l: "Tur",
            v: test.kind === "psych" ? "Psixologik" : "Standart",
            i: <Sparkles size={15} />,
          },
          { l: "Kategoriya", v: test.category, i: <Sparkles size={15} /> },
          {
            l: "Vaqt",
            v: test.time_limit_sec
              ? `${Math.round(test.time_limit_sec / 60)} daqiqa`
              : "Cheklovsiz",
            i: <Clock size={15} />,
          },
          {
            l: "Savollar",
            v: String(questions.length),
            i: <Users size={15} />,
          },
        ].map((s) => (
          <Card key={s.l} className="p-4">
            <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-ink/40">
              {s.i} {s.l}
            </p>
            <p className="mt-1.5 font-semibold text-forest-950">{s.v}</p>
          </Card>
        ))}
      </div>

      {test.scoring.type === "dimensions" && (
        <Card className="mb-5 p-5">
          <p className="text-[11px] font-bold uppercase tracking-wider text-ink/40">
            O‘lchovlar
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {test.scoring.dimensions.map((d) => (
              <Badge key={d.key} tone="sage">
                {d.label}
              </Badge>
            ))}
          </div>
        </Card>
      )}

      <div className="space-y-3">
        {questions.map((q, i) => (
          <Card key={q.id} className="p-5">
            <div className="flex gap-3">
              <span className="grid h-7 w-7 shrink-0 place-items-center rounded-xl bg-forest-50 text-[12px] font-bold text-forest-800">
                {i + 1}
              </span>
              <div className="flex-1">
                <p className="font-medium leading-snug text-ink/85">{q.text}</p>
                <div className="mt-2.5 grid gap-1.5 sm:grid-cols-2">
                  {q.options.map((o, oi) => (
                    <div
                      key={o.id}
                      className="flex items-center gap-2 rounded-xl bg-cream px-3 py-2 text-[13px] text-ink/65 ring-1 ring-ink/5"
                    >
                      <span className="text-[11px] font-bold text-ink/35">
                        {letter(oi)}
                      </span>
                      <span className="flex-1">{o.text}</span>
                      {test.kind === "standard" && o.score > 0 && (
                        <CheckCircle2 size={15} className="text-forest-600" />
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </Card>
        ))}
      </div>

      <div className="mt-5 rounded-2xl bg-forest-50 px-4 py-3 text-[12px] text-forest-800">
        Natijalar faqat testni tayinlagan psixolog va bosh administrator uchun
        ko‘rinadi.
      </div>

      <AssignModal
        open={assignOpen}
        onClose={() => setAssignOpen(false)}
        testId={test.id}
        onDone={() => toast("Test tayinlandi")}
      />
    </div>
  );
}

/** Test → o'quvchi yoki guruhga tayinlash (psixolog va admin uchun) */
export function AssignModal({
  open,
  onClose,
  testId,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  testId: string;
  onDone?: () => void;
}) {
  const { profile } = useAuth();
  const toast = useToast();
  const [mode, setMode] = useState<"student" | "group">("student");
  const [studentId, setStudentId] = useState("");
  const [groupId, setGroupId] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const studentsQ = useQuery(async () => {
    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("role", "student")
      .order("full_name");
    return { data: data as Profile[] | null, error };
  }, [open]);
  const groupsQ = useQuery(async () => {
    const { data, error } = await supabase
      .from("groups")
      .select("*")
      .order("name");
    return { data: data as Group[] | null, error };
  }, [open]);

  async function submit() {
    setError(null);
    if (mode === "student" && !studentId) return setError("O‘quvchini tanlang");
    if (mode === "group" && !groupId) return setError("Guruhni tanlang");
    if (!profile) return;
    setBusy(true);
    const { error } = await supabase.from("assignments").insert({
      test_id: testId,
      student_id: mode === "student" ? studentId : null,
      group_id: mode === "group" ? groupId : null,
      assigned_by: profile.id,
      due_at: dueAt ? new Date(dueAt).toISOString() : null,
    });
    setBusy(false);
    if (error) return setError(uzError(error));
    toast("Test tayinlandi");
    onDone?.();
    setStudentId("");
    setGroupId("");
    setDueAt("");
    onClose();
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Testni tayinlash"
      description="Alohida o‘quvchiga yoki butun guruhga."
    >
      <div className="space-y-4">
        <div className="flex gap-2">
          {(["student", "group"] as const).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`flex-1 rounded-2xl px-3 py-2 text-[13px] font-semibold ring-1 transition ${
                mode === m
                  ? "bg-forest-800 text-white ring-forest-800"
                  : "bg-white text-ink/60 ring-ink/10"
              }`}
            >
              {m === "student" ? "O‘quvchi" : "Guruh"}
            </button>
          ))}
        </div>

        {mode === "student" ? (
          <div>
            <label className="label">O‘quvchi</label>
            <select
              className="field"
              value={studentId}
              onChange={(e) => setStudentId(e.target.value)}
            >
              <option value="">Tanlang...</option>
              {(studentsQ.data ?? []).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.full_name} {s.login ? `(${s.login})` : ""}
                </option>
              ))}
            </select>
            {studentsQ.data?.length === 0 && (
              <p className="mt-1.5 text-[12px] text-amber-700">
                Hozircha o‘quvchilar yo‘q. Avval o‘quvchi yarating.
              </p>
            )}
          </div>
        ) : (
          <div>
            <label className="label">Guruh</label>
            <select
              className="field"
              value={groupId}
              onChange={(e) => setGroupId(e.target.value)}
            >
              <option value="">Tanlang...</option>
              {(groupsQ.data ?? []).map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
            {(groupsQ.data ?? []).length === 0 && (
              <p className="mt-1.5 text-[12px] text-amber-700">
                Guruhlar yo‘q. «Guruhlar» bo‘limida yaratib oling.
              </p>
            )}
          </div>
        )}

        <div>
          <label className="label">Muddat (ixtiyoriy)</label>
          <input
            type="datetime-local"
            className="field"
            value={dueAt}
            onChange={(e) => setDueAt(e.target.value)}
          />
        </div>

        {error && <ErrorBox message={error} />}
        <div className="flex justify-end gap-2">
          <button className="btn-ghost" onClick={onClose}>
            Bekor qilish
          </button>
          <button className="btn-primary" onClick={submit} disabled={busy}>
            <Send size={15} /> {busy ? "Tayinlanmoqda..." : "Tayinlash"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
