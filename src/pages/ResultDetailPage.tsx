import { Link, useParams } from "react-router-dom";
import {
  ArrowLeft,
  CheckCircle2,
  XCircle,
  MinusCircle,
  Info,
  BarChart3,
  Download,
} from "lucide-react";
import { supabase } from "../lib/supabase";
import { useQuery } from "../context/ToastProvider";
import { fetchFullTest, formatDateTime } from "../lib/api";
import {
  Badge,
  Card,
  ErrorBox,
  PageHeader,
  Spinner,
  StatCard,
  cn,
} from "../components/ui";
import {
  DimensionBars,
  DimensionRadar,
  GroupBarChart,
  ScoreBar,
} from "../components/charts";
import type { Answer, Attempt } from "../types";

export function ResultDetailPage() {
  const { id } = useParams();

  const q = useQuery(async () => {
    if (!id) return { data: null };
    const { data: attempt, error } = await supabase
      .from("attempts")
      .select(
        "id,assignment_id,test_id,student_id,status,round,started_at,deadline_at,submitted_at,auto_submitted,updated_at,student:profiles!attempts_student_id_fkey(full_name,login),test:tests(*),assignment:assignments(group_id)",
      )
      .eq("id", id)
      .single();
    if (error) return { data: null, error };

    const { data: staffResults, error: resultsError } = await supabase.rpc(
      "get_staff_results",
      { p_test_id: (attempt as { test_id: string }).test_id },
    );
    if (resultsError) return { data: null, error: resultsError };
    const result = (staffResults ?? []).find((r) => r.id === id);
    if (!result) return { data: null, error: new Error("Natija topilmadi yoki ko'rish huquqi yo'q.") };

    const full = await fetchFullTest((attempt as { test_id: string }).test_id);
    const { data: answers } = await supabase
      .from("answers")
      .select("*")
      .eq("attempt_id", id);
    const groupAttempts = (staffResults ?? []).map((r) => ({
      id: r.id,
      percent: r.percent,
      student_id: r.student_id,
      student: { full_name: r.student_full_name },
    }));

    return {
      data: {
        attempt: {
          ...(attempt as unknown as Attempt),
          total_score: result.total_score,
          max_score: result.max_score,
          percent: result.percent,
          dimension_result: result.dimension_result,
        } as Attempt & {
          student: { full_name: string; login: string | null };
          test: typeof full.test;
        },
        full,
        answers: (answers ?? []) as Answer[],
        groupAttempts: groupAttempts ?? [],
      },
    };
  }, [id]);

  if (q.loading) return <Spinner />;
  if (q.error) return <ErrorBox message={q.error} />;
  if (!q.data) return null;

  const { attempt, full, answers, groupAttempts } = q.data;
  const { test, questions } = full;
  const answerMap = new Map(answers.map((a) => [a.question_id, a.option_id]));
  const letter = (i: number) => String.fromCharCode(65 + i);

  const dims =
    test.scoring.type === "dimensions" ? test.scoring.dimensions : [];
  const dimData = dims.map((d) => ({
    label: d.label,
    value: Number(attempt.dimension_result?.[d.key] ?? 0),
  }));
  const topDim = dims.length
    ? [...dims].sort(
        (a, b) =>
          (attempt.dimension_result?.[b.key] ?? 0) -
          (attempt.dimension_result?.[a.key] ?? 0),
      )[0]
    : null;

  const correctCount = questions.filter((qn) => {
    const chosen = answerMap.get(qn.id);
    const opt = qn.options.find((o) => o.id === chosen);
    return opt && opt.score > 0;
  }).length;
  const answeredCount = questions.filter((qn) => answerMap.get(qn.id)).length;

  const groupData = [...groupAttempts]
    .sort((a, b) => (b.percent ?? 0) - (a.percent ?? 0))
    .slice(0, 12)
    .map((g) => {
      const st = Array.isArray(g.student) ? g.student[0] : g.student;
      return {
        name: (st?.full_name ?? "—").split(" ")[0],
        percent: Math.round(g.percent ?? 0),
      };
    });
  const avg =
    groupAttempts.length > 0
      ? Math.round(
          (groupAttempts.reduce((s, g) => s + (g.percent ?? 0), 0) /
            groupAttempts.length) *
            10,
        ) / 10
      : 0;

  function exportCsv() {
    const rows = [
      ["Savol", "Javob", "To'g'ri javob", "Holat"],
      ...questions.map((qn) => {
        const chosen = answerMap.get(qn.id);
        const opt = qn.options.find((o) => o.id === chosen);
        const correct = qn.options.find((o) => o.score > 0);
        return [
          qn.text,
          opt?.text ?? "—",
          correct?.text ?? "—",
          !opt ? "Javobsiz" : opt.score > 0 ? "To'g'ri" : "Noto'g'ri",
        ];
      }),
    ];
    const csv = rows
      .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(";"))
      .join("\n");
    const blob = new Blob(["\uFEFF" + csv], {
      type: "text/csv;charset=utf-8;",
    });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `natija-${attempt.student.full_name}.csv`;
    a.click();
  }

  return (
    <div>
      <Link
        to="/app/results"
        className="mb-4 inline-flex items-center gap-1.5 text-[13px] font-semibold text-ink/50 hover:text-forest-800"
      >
        <ArrowLeft size={15} /> Natijalarga qaytish
      </Link>
      <PageHeader
        title={attempt.student.full_name}
        subtitle={test.title}
        actions={
          <button className="btn-secondary" onClick={exportCsv}>
            <Download size={15} /> CSV yuklab olish
          </button>
        }
      />

      <div className="mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {test.kind === "standard" ? (
          <>
            <StatCard
              label="Umumiy ball"
              value={`${attempt.total_score ?? 0} / ${attempt.max_score ?? questions.length}`}
              icon={<CheckCircle2 size={18} />}
              tone="forest"
            />
            <StatCard
              label="Foiz"
              value={`${attempt.percent ?? 0}%`}
              icon={<BarChart3 size={18} />}
              tone="sage"
            />
            <StatCard
              label="To‘g‘ri javoblar"
              value={correctCount}
              icon={<CheckCircle2 size={18} />}
              tone="blue"
            />
            <StatCard
              label="Javob berilgan"
              value={`${answeredCount} / ${questions.length}`}
              icon={<Info size={18} />}
              tone="amber"
            />
          </>
        ) : (
          <>
            <StatCard
              label="Umumiy ball"
              value={attempt.total_score ?? 0}
              icon={<BarChart3 size={18} />}
              tone="forest"
            />
            <StatCard
              label="Javob berilgan"
              value={`${answeredCount} / ${questions.length}`}
              icon={<CheckCircle2 size={18} />}
              tone="sage"
            />
            <StatCard
              label="Yetakchi yo‘nalish"
              value={
                topDim
                  ? (dims.find((d) => d.key === topDim.key)?.label ?? "—")
                  : "—"
              }
              icon={<Info size={18} />}
              tone="blue"
            />
            <StatCard
              label="Topshirilgan"
              value={formatDateTime(attempt.submitted_at)}
              icon={<CheckCircle2 size={18} />}
              tone="amber"
            />
          </>
        )}
      </div>

      {attempt.auto_submitted && (
        <div className="mb-5 rounded-2xl bg-amber-50 px-4 py-3 text-[12.5px] text-amber-800 ring-1 ring-amber-100">
          Test vaqt tugashi sababli avtomatik topshirilgan.
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-2">
        {test.kind === "psych" && dimData.length > 0 && (
          <Card className="p-5">
            <h2 className="mb-3 font-semibold text-forest-950">
              O‘lchovlar bo‘yicha profil
            </h2>
            <DimensionRadar data={dimData} />
            <div className="mt-4">
              <DimensionBars data={dimData} />
            </div>
            {topDim?.description && (
              <p className="mt-4 rounded-2xl bg-forest-50 px-4 py-3 text-[12.5px] leading-relaxed text-forest-900">
                <b>{topDim.label}:</b> {topDim.description}
              </p>
            )}
            <p className="mt-3 flex items-start gap-1.5 text-[11.5px] text-ink/45">
              <Info size={13} className="mt-0.5 shrink-0" />
              Ushbu natija klinik tashxis emas. U faqat mutaxassis bilan suhbat
              uchun asos bo‘ladi.
            </p>
          </Card>
        )}

        <Card className="p-5">
          <h2 className="mb-1 font-semibold text-forest-950">
            Guruh statistikasi
          </h2>
          <p className="mb-3 text-xs text-ink/45">
            Bu test bo‘yicha {groupAttempts.length} ta topshirilgan urinish ·
            o‘rtacha {avg}%
          </p>
          {groupData.length ? (
            <GroupBarChart data={groupData} />
          ) : (
            <p className="text-sm text-ink/45">Ma’lumot yo‘q</p>
          )}
          <div className="mt-3 flex items-center gap-4 text-[12px] text-ink/50">
            <span>
              O‘rtacha: <b className="text-forest-800">{avg}%</b>
            </span>
            <span>
              O‘quvchining natijasi:{" "}
              <b className="text-forest-800">{attempt.percent ?? 0}%</b>
            </span>
          </div>
          {test.kind === "standard" && (
            <div className="mt-4">
              <p className="mb-1 text-[11px] font-bold uppercase tracking-wider text-ink/40">
                Foiz
              </p>
              <ScoreBar percent={attempt.percent ?? 0} />
            </div>
          )}
        </Card>
      </div>

      <Card className="mt-5 overflow-hidden">
        <div className="border-b border-ink/5 px-5 py-4">
          <h2 className="font-semibold text-forest-950">
            Savollar va javoblar
          </h2>
        </div>
        <ul className="divide-y divide-ink/5">
          {questions.map((qn, i) => {
            const chosen = answerMap.get(qn.id);
            const chosenOpt = qn.options.find((o) => o.id === chosen);
            const correctOpt =
              test.kind === "standard"
                ? qn.options.find((o) => o.score > 0)
                : null;
            const isCorrect = chosenOpt && chosenOpt.score > 0;
            return (
              <li key={qn.id} className="px-5 py-4">
                <div className="flex items-start gap-3">
                  <span
                    className={cn(
                      "mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-xl text-[12px] font-bold",
                      !chosenOpt
                        ? "bg-ink/5 text-ink/40"
                        : test.kind === "psych" || isCorrect
                          ? "bg-forest-100 text-forest-800"
                          : "bg-rose-100 text-rose-700",
                    )}
                  >
                    {i + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium leading-snug text-ink/85">
                      {qn.text}
                    </p>
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-[12.5px]">
                      {!chosenOpt ? (
                        <Badge tone="amber">
                          <MinusCircle size={12} /> Javob berilmagan
                        </Badge>
                      ) : (
                        <>
                          <Badge
                            tone={
                              test.kind === "psych" || isCorrect
                                ? "sage"
                                : "rose"
                            }
                          >
                            {test.kind === "psych" || isCorrect ? (
                              <CheckCircle2 size={12} />
                            ) : (
                              <XCircle size={12} />
                            )}
                            {letter(
                              qn.options.findIndex(
                                (o) => o.id === chosenOpt.id,
                              ),
                            )}
                            . {chosenOpt.text}
                          </Badge>
                          {test.kind === "psych" &&
                            chosenOpt.dim_scores &&
                            Object.keys(chosenOpt.dim_scores).length > 0 && (
                              <span className="text-[11px] text-ink/40">
                                {Object.entries(chosenOpt.dim_scores)
                                  .filter(([, v]) => v)
                                  .map(
                                    ([k, v]) =>
                                      `${dims.find((d) => d.key === k)?.label ?? k}: +${v}`,
                                  )
                                  .join(" · ")}
                              </span>
                            )}
                        </>
                      )}
                      {correctOpt && !isCorrect && (
                        <span className="text-[11.5px] text-forest-700">
                          To‘g‘ri: <b>{correctOpt.text}</b>
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      </Card>
    </div>
  );
}
