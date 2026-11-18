import { useState } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  FileUp,
  Plus,
  PenLine,
  Trash2,
  Save,
  AlertTriangle,
  Layers,
  HelpCircle,
} from "lucide-react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/toastCtx";
import { useFullTest } from "../lib/api";
import { uzError } from "../lib/errors";
import { Card, ErrorBox, PageHeader, Spinner, cn, Badge } from "../components/ui";
import { CATEGORIES, type Dimension, type TestKind } from "../types";

interface DraftOption {
  text: string;
  score: number;
  dim_scores: Record<string, number>;
}
interface DraftQuestion {
  text: string;
  options: DraftOption[];
}

const emptyOptions = (): DraftOption[] => [
  { text: "", score: 0, dim_scores: {} },
  { text: "", score: 0, dim_scores: {} },
  { text: "", score: 0, dim_scores: {} },
  { text: "", score: 0, dim_scores: {} },
];

export function TestBuilderPage() {
  const { id } = useParams();
  const isEdit = Boolean(id);
  const navigate = useNavigate();
  const { profile } = useAuth();
  const toast = useToast();
  const { data: existing, loading } = useFullTest(id);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [kind, setKind] = useState<TestKind>("standard");
  const [minAge, setMinAge] = useState<number | "">("");
  const [maxAge, setMaxAge] = useState<number | "">("");
  const [timed, setTimed] = useState(true);
  const [minutes, setMinutes] = useState<number | "">(15);
  const [dimensions, setDimensions] = useState<Dimension[]>([
    { key: "dim1", label: "1-o‘lchov", description: "" },
    { key: "dim2", label: "2-o‘lchov", description: "" },
  ]);
  const [questions, setQuestions] = useState<DraftQuestion[]>([
    { text: "", options: emptyOptions() },
  ]);
  const [init, setInit] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Mavjud testni formaga yuklash
  if (isEdit && existing && !init) {
    setInit(true);
    setTitle(existing.test.title);
    setDescription(existing.test.description);
    setCategory(existing.test.category);
    setKind(existing.test.kind);
    setMinAge(existing.test.min_age ?? "");
    setMaxAge(existing.test.max_age ?? "");
    setTimed(Boolean(existing.test.time_limit_sec));
    setMinutes(
      existing.test.time_limit_sec
        ? Math.round(existing.test.time_limit_sec / 60)
        : 15,
    );
    setDimensions(
      existing.test.scoring.type === "dimensions"
        ? existing.test.scoring.dimensions
        : [],
    );
    setQuestions(
      existing.questions.length
        ? existing.questions.map((q) => ({
            text: q.text,
            options: q.options.map((o) => ({
              text: o.text,
              score: o.score,
              dim_scores: o.dim_scores ?? {},
            })),
          }))
        : [{ text: "", options: emptyOptions() }],
    );
  }

  if (isEdit && loading) return <Spinner label="Test yuklanmoqda..." />;

  function updateQuestion(i: number, patch: Partial<DraftQuestion>) {
    setQuestions((qs) =>
      qs.map((q, idx) => (idx === i ? { ...q, ...patch } : q)),
    );
  }
  function updateOption(qi: number, oi: number, patch: Partial<DraftOption>) {
    setQuestions((qs) =>
      qs.map((q, idx) =>
        idx === qi
          ? {
              ...q,
              options: q.options.map((o, j) =>
                j === oi ? { ...o, ...patch } : o,
              ),
            }
          : q,
      ),
    );
  }

  function addQuestion() {
    setQuestions((qs) => [...qs, { text: "", options: emptyOptions() }]);
  }

  function addDimension() {
    const n = dimensions.length + 1;
    setDimensions((d) => [
      ...d,
      { key: `dim${n}`, label: `${n}-o‘lchov`, description: "" },
    ]);
  }

  function validate(): string | null {
    if (!title.trim()) return "Test nomini kiriting";
    if (questions.length === 0) return "Kamida bitta savol qo‘shing";
    for (const [i, q] of questions.entries()) {
      if (!q.text.trim()) return `${i + 1}-savol matni bo‘sh`;
      if (q.options.filter((o) => o.text.trim()).length < 2)
        return `${i + 1}-savolda kamida 2 ta variant kerak`;
      if (kind === "standard") {
        const correct = q.options.filter(
          (o) => o.text.trim() && o.score > 0,
        ).length;
        if (correct === 0)
          return `${i + 1}-savolda to‘g‘ri javob belgilanmagan`;
      }
    }
    if (kind === "psych" && dimensions.length === 0)
      return "Kamida bitta o‘lchov (dimension) qo‘shing";
    return null;
  }

  async function save() {
    setError(null);
    const v = validate();
    if (v) return setError(v);
    if (!profile) return;
    setSaving(true);
    try {
      const scoring =
        kind === "psych"
          ? {
              type: "dimensions" as const,
              dimensions: dimensions.map((d) => ({ ...d })),
            }
          : { type: "correct" as const };
      const payload = {
        title: title.trim(),
        description: description.trim(),
        category,
        kind,
        min_age: minAge === "" ? null : Number(minAge),
        max_age: maxAge === "" ? null : Number(maxAge),
        time_limit_sec: timed && minutes ? Number(minutes) * 60 : null,
        scoring,
      };

      let testId = id;
      if (isEdit && id) {
        const { error: e1 } = await supabase
          .from("tests")
          .update(payload)
          .eq("id", id);
        if (e1) throw e1;
        // savollarni qayta yozamiz (MVP: oddiy va ishonchli yondashuv)
        const { data: oldQ } = await supabase
          .from("questions")
          .select("id")
          .eq("test_id", id);
        if (oldQ?.length) {
          const { error: e1b } = await supabase
            .from("questions")
            .delete()
            .in(
              "id",
              oldQ.map((q) => q.id),
            );
          if (e1b) throw e1b;
        }
      } else {
        const scope = profile.role === "admin" ? "library" : "personal";
        const { data, error: e2 } = await supabase
          .from("tests")
          .insert({
            ...payload,
            scope,
            owner_id: profile.role === "admin" ? null : profile.id,
          })
          .select("id")
          .single();
        if (e2) throw e2;
        testId = data.id as string;
      }

      for (const [qi, q] of questions.entries()) {
        const { data: qRow, error: eq } = await supabase
          .from("questions")
          .insert({ test_id: testId, position: qi + 1, text: q.text.trim() })
          .select("id")
          .single();
        if (eq) throw eq;
        const opts = q.options
          .filter((o) => o.text.trim())
          .map((o, oi) => ({
            question_id: qRow.id as string,
            position: oi + 1,
            text: o.text.trim(),
            score: kind === "standard" ? (o.score > 0 ? 1 : 0) : 0,
            dim_scores: kind === "psych" ? o.dim_scores : {},
          }));
        const { error: eo } = await supabase.from("options").insert(opts);
        if (eo) throw eo;
      }

      toast(isEdit ? "Test saqlandi" : "Test yaratildi");
      navigate(`/app/tests/${testId}`);
    } catch (e) {
      setError(uzError(e));
    } finally {
      setSaving(false);
    }
  }

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
        title={isEdit ? "Testni tahrirlash" : "Yangi test yaratish"}
        subtitle={
          isEdit
            ? "Ma’lumotlarni o‘zgartiring va saqlang."
            : "Ikki usul: qo‘lda yozish yoki fayldan import qilish (PDF, Word, Excel, PowerPoint, CSV, TXT, rasm)."
        }
        actions={
          <button className="btn-primary" onClick={save} disabled={saving}>
            <Save size={16} /> {saving ? "Saqlanmoqda..." : "Saqlash"}
          </button>
        }
      />

      {!isEdit && (
        <div className="mb-5 grid gap-3 sm:grid-cols-2">
          <Card className="flex items-center gap-3 border-2 border-forest-700/20 p-4">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-forest-800 text-white dark:text-forest-50">
              <PenLine size={18} />
            </span>
            <div className="min-w-0">
              <p className="text-[13.5px] font-semibold text-forest-950">
                Qo‘lda yaratish
              </p>
              <p className="text-[11.5px] text-ink/45">
                Savollarni o‘zingiz kiritasiz — bu sahifada
              </p>
            </div>
            <span className="ml-auto">
              <Badge tone="forest">Faol</Badge>
            </span>
          </Card>
          <Link
            to="/app/tests/import"
            className="card flex items-center gap-3 p-4 transition hover:-translate-y-0.5 hover:shadow-lift"
          >
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-sage-200 text-forest-900 dark:bg-sage-200/25 dark:text-forest-100">
              <FileUp size={18} />
            </span>
            <div className="min-w-0">
              <p className="text-[13.5px] font-semibold text-forest-950">
                Fayldan import qilish
              </p>
              <p className="text-[11.5px] text-ink/45">
                PDF, Word, Excel, PPT, CSV, TXT, rasm — savollar avtomatik ajratiladi
              </p>
            </div>
            <span className="ml-auto text-ink/30">
              <ArrowRight size={16} />
            </span>
          </Link>
        </div>
      )}

      {error && (
        <div className="mb-4">
          <ErrorBox message={error} />
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-[1fr_330px]">
        <div className="space-y-5">
          {/* Asosiy */}
          <Card className="p-5">
            <h2 className="mb-4 font-semibold text-forest-950">
              Asosiy ma’lumotlar
            </h2>
            <div className="space-y-4">
              <div>
                <label className="label">Test nomi *</label>
                <input
                  className="field"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Masalan: Temperament aniqlash testi"
                />
              </div>
              <div>
                <label className="label">Tavsif</label>
                <textarea
                  className="field min-h-[90px] resize-y"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Test maqsadi va ko‘rsatmalar"
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
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
                  <div className="flex gap-2">
                    {(["standard", "psych"] as TestKind[]).map((k) => (
                      <button
                        key={k}
                        type="button"
                        onClick={() => setKind(k)}
                        className={cn(
                          "flex-1 rounded-2xl border px-3 py-2 text-[12.5px] font-semibold transition",
                          kind === k
                            ? "border-forest-800 bg-forest-800 text-white"
                            : "border-ink/10 bg-white text-ink/60 hover:bg-forest-50",
                        )}
                      >
                        {k === "standard" ? "Standart (A/B/C/D)" : "Psixologik"}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="label">Yosh oralig‘i (dan)</label>
                  <input
                    type="number"
                    min={3}
                    max={100}
                    className="field"
                    value={minAge}
                    onChange={(e) =>
                      setMinAge(
                        e.target.value === "" ? "" : Number(e.target.value),
                      )
                    }
                  />
                </div>
                <div>
                  <label className="label">Yosh oralig‘i (gacha)</label>
                  <input
                    type="number"
                    min={3}
                    max={100}
                    className="field"
                    value={maxAge}
                    onChange={(e) =>
                      setMaxAge(
                        e.target.value === "" ? "" : Number(e.target.value),
                      )
                    }
                  />
                </div>
              </div>
            </div>
          </Card>

          {/* Scoring / dimensions */}
          <Card className="p-5">
            <div className="mb-1 flex items-center justify-between">
              <h2 className="font-semibold text-forest-950">
                Baholash qoidalari
              </h2>
              {kind === "psych" && (
                <button
                  className="btn-ghost !py-1.5 !text-[12px]"
                  onClick={addDimension}
                >
                  <Plus size={14} /> O‘lchov
                </button>
              )}
            </div>
            {kind === "standard" ? (
              <p className="text-[13px] leading-relaxed text-ink/55">
                Har bir savolda bitta to‘g‘ri javob belgilanadi. Ball avtomatik
                hisoblanadi: to‘g‘ri javoblar soni foizga aylantiriladi.
              </p>
            ) : (
              <div className="mt-3 space-y-3">
                <p className="text-[12.5px] leading-relaxed text-ink/55">
                  Har bir variantni o‘lchovlarga mos ball bilan bog‘lang. Test
                  yakunida har bir o‘lchov bo‘yicha ball yig‘iladi.
                </p>
                {dimensions.map((d, i) => (
                  <div
                    key={i}
                    className="grid gap-2 rounded-2xl bg-forest-50/60 p-3 sm:grid-cols-[1fr_1fr_auto]"
                  >
                    <input
                      className="field !py-2 !text-[13px]"
                      value={d.key}
                      onChange={(e) =>
                        setDimensions((ds) =>
                          ds.map((x, idx) =>
                            idx === i
                              ? {
                                  ...x,
                                  key: e.target.value.replace(/\s+/g, "_"),
                                }
                              : x,
                          ),
                        )
                      }
                      placeholder="kalit (masalan: sangvinik)"
                    />
                    <input
                      className="field !py-2 !text-[13px]"
                      value={d.label}
                      onChange={(e) =>
                        setDimensions((ds) =>
                          ds.map((x, idx) =>
                            idx === i ? { ...x, label: e.target.value } : x,
                          ),
                        )
                      }
                      placeholder="Ko‘rinadigan nomi"
                    />
                    <button
                      className="btn-ghost !px-2 text-rose-500"
                      onClick={() =>
                        setDimensions((ds) => ds.filter((_, idx) => idx !== i))
                      }
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* Savollar */}
          <Card className="p-5">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-semibold text-forest-950">
                Savollar ({questions.length})
              </h2>
              <button
                className="btn-secondary !py-2 !text-[12.5px]"
                onClick={addQuestion}
              >
                <Plus size={15} /> Savol qo‘shish
              </button>
            </div>

            <div className="space-y-5">
              {questions.map((q, qi) => (
                <div
                  key={qi}
                  className="rounded-3xl border border-ink/8 bg-cream/60 p-4"
                >
                  <div className="mb-3 flex items-start gap-2">
                    <span className="mt-1 grid h-7 w-7 shrink-0 place-items-center rounded-xl bg-forest-800 text-[11px] font-bold text-white">
                      {qi + 1}
                    </span>
                    <textarea
                      className="field min-h-[52px] resize-y !py-2.5"
                      value={q.text}
                      onChange={(e) =>
                        updateQuestion(qi, { text: e.target.value })
                      }
                      placeholder="Savol matni"
                    />
                    <button
                      className="btn-ghost !p-2 text-rose-500"
                      onClick={() =>
                        setQuestions((qs) => qs.filter((_, i) => i !== qi))
                      }
                      disabled={questions.length === 1}
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>

                  <div className="space-y-2">
                    {q.options.map((o, oi) => (
                      <div key={oi} className="flex items-center gap-2">
                        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-white text-[12px] font-bold text-ink/50 ring-1 ring-ink/10">
                          {letter(oi)}
                        </span>
                        <input
                          className="field min-w-[140px] flex-1 !py-2 !text-[13px]"
                          value={o.text}
                          onChange={(e) =>
                            updateOption(qi, oi, { text: e.target.value })
                          }
                          placeholder={`${letter(oi)} varianti`}
                        />
                        {kind === "standard" ? (
                          <button
                            type="button"
                            onClick={() =>
                              updateOption(qi, oi, {
                                score: o.score > 0 ? 0 : 1,
                              })
                            }
                            className={cn(
                              "flex shrink-0 items-center gap-1 rounded-xl px-2.5 py-2 text-[11.5px] font-semibold ring-1 transition",
                              o.score > 0
                                ? "bg-forest-800 text-white ring-forest-800"
                                : "bg-white text-ink/45 ring-ink/10 hover:bg-forest-50",
                            )}
                          >
                            <Check size={13} /> To‘g‘ri
                          </button>
                        ) : (
                          <div className="flex flex-wrap gap-1.5">
                            {dimensions.map((d) => (
                              <label
                                key={d.key}
                                className="flex items-center gap-1 rounded-xl bg-white px-2 py-1 text-[11px] ring-1 ring-ink/10"
                                title={`${d.label} uchun ball`}
                              >
                                <span className="max-w-[70px] truncate text-ink/50">
                                  {d.label}
                                </span>
                                <input
                                  type="number"
                                  min={0}
                                  className="w-11 rounded-md bg-forest-50 px-1 py-0.5 text-center font-semibold text-forest-900 outline-none"
                                  value={o.dim_scores[d.key] ?? 0}
                                  onChange={(e) =>
                                    updateOption(qi, oi, {
                                      dim_scores: {
                                        ...o.dim_scores,
                                        [d.key]: Number(e.target.value) || 0,
                                      },
                                    })
                                  }
                                />
                              </label>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          <Card className="p-5">
            <h3 className="flex items-center gap-2 font-semibold text-forest-950">
              <Layers size={16} className="text-forest-600" /> Vaqt chegarasi
            </h3>
            <div className="mt-3 space-y-3">
              <label className="flex items-center justify-between rounded-2xl bg-forest-50/60 px-3 py-2.5">
                <span className="text-[13px] text-ink/70">Vaqt bilan</span>
                <input
                  type="checkbox"
                  checked={timed}
                  onChange={(e) => setTimed(e.target.checked)}
                  className="h-4 w-4 accent-forest-800"
                />
              </label>
              {timed && (
                <div>
                  <label className="label">Daqiqa hisobida</label>
                  <input
                    type="number"
                    min={1}
                    className="field"
                    value={minutes}
                    onChange={(e) =>
                      setMinutes(
                        e.target.value === "" ? "" : Number(e.target.value),
                      )
                    }
                  />
                </div>
              )}
              <p className="text-[11.5px] leading-relaxed text-ink/45">
                Vaqt test boshlangan paytdan hisoblanadi. Sahifa yopilsa ham
                vaqt davom etadi.
              </p>
            </div>
          </Card>

          <Card className="p-5">
            <h3 className="flex items-center gap-2 font-semibold text-forest-950">
              <HelpCircle size={16} className="text-forest-600" /> Eslatmalar
            </h3>
            <ul className="mt-2 space-y-2 text-[12px] leading-relaxed text-ink/50">
              <li>• Standart testlarda faqat bitta to‘g‘ri javob belgilang.</li>
              <li>
                • Psixologik testlar uchun o‘lchovlar (dimensions) yarating.
              </li>
              <li>• Har bir variant ballarini o‘lchov kalitlariga bog‘lang.</li>
              <li className="flex gap-1.5 text-amber-700">
                <AlertTriangle size={13} className="mt-0.5 shrink-0" />
                Psixologik test natijasi klinik tashxis emas.
              </li>
            </ul>
          </Card>

          <button
            className="btn-primary w-full"
            onClick={save}
            disabled={saving}
          >
            <Save size={16} /> {saving ? "Saqlanmoqda..." : "Saqlash"}
          </button>
        </div>
      </div>
    </div>
  );
}
