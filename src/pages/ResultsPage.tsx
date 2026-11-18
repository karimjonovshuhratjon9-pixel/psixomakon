import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  BarChart3,
  Search,
  ChevronRight,
  TrendingUp,
  TrendingDown,
  Users2,
} from "lucide-react";
import { ScoreBar } from "../components/charts";
import { supabase } from "../lib/supabase";
import { useQuery } from "../context/ToastProvider";
import {
  Badge,
  Card,
  EmptyState,
  ErrorBox,
  PageHeader,
  Spinner,
  StatCard,
} from "../components/ui";
import { formatDateTime } from "../lib/api";

interface ResultRow {
  id: string;
  student_id: string;
  test_id: string;
  status: string;
  percent: number | null;
  total_score: number | null;
  max_score: number | null;
  submitted_at: string | null;
  auto_submitted: boolean;
  student: { full_name: string } | { full_name: string }[] | null;
  test:
    | { title: string; kind: string; category: string }
    | { title: string; kind: string; category: string }[]
    | null;
}

const one = <T,>(v: T | T[] | null | undefined): T | null =>
  Array.isArray(v) ? (v[0] ?? null) : (v ?? null);

export function useResults() {
  return useQuery(async () => {
    const { data, error } = await supabase.rpc("get_staff_results");
    const rows = (data ?? []).map((r) => ({
      id: r.id,
      student_id: r.student_id,
      test_id: r.test_id,
      status: r.status,
      percent: r.percent,
      total_score: r.total_score,
      max_score: r.max_score,
      submitted_at: r.submitted_at,
      auto_submitted: r.auto_submitted,
      student: { full_name: r.student_full_name },
      test: {
        title: r.test_title,
        kind: r.test_kind,
        category: r.test_category,
      },
    })) as ResultRow[];
    return { data: rows, error };
  }, []);
}

export function ResultsPage() {
  const results = useResults();
  const [search, setSearch] = useState("");

  const rows = results.data ?? [];
  const filtered = rows.filter((r) => {
    const t = one(r.test);
    const s = one(r.student);
    const q = search.toLowerCase();
    return (
      !q ||
      (t?.title ?? "").toLowerCase().includes(q) ||
      (s?.full_name ?? "").toLowerCase().includes(q)
    );
  });

  const stats = useMemo(() => {
    if (!rows.length) return null;
    const sorted = [...rows].sort(
      (a, b) => (b.percent ?? 0) - (a.percent ?? 0),
    );
    const avg = rows.reduce((s, r) => s + (r.percent ?? 0), 0) / rows.length;
    return {
      count: rows.length,
      avg: Math.round(avg * 10) / 10,
      top: sorted[0],
      low: sorted[sorted.length - 1],
      students: new Set(rows.map((r) => r.student_id)).size,
    };
  }, [rows]);

  return (
    <div>
      <PageHeader
        title="Natijalar"
        subtitle="O‘quvchilarning topshirilgan testlari va umumiy statistika. Natijalar faqat siz va administratorga ko‘rinadi."
      />

      {results.loading ? (
        <Spinner />
      ) : results.error ? (
        <ErrorBox message={results.error} />
      ) : !stats ? (
        <Card>
          <EmptyState
            icon={<BarChart3 size={24} />}
            title="Hozircha natijalar yo‘q"
            description="O‘quvchi test topshirgach natija shu yerda paydo bo‘ladi."
          />
        </Card>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="Topshirilgan"
              value={stats.count}
              icon={<BarChart3 size={18} />}
              tone="forest"
            />
            <StatCard
              label="O‘rtacha natija"
              value={`${stats.avg}%`}
              icon={<TrendingUp size={18} />}
              tone="sage"
            />
            <StatCard
              label="Yuqori natija"
              value={`${stats.top?.percent ?? 0}%`}
              hint={one(stats.top?.test)?.title}
              icon={<TrendingUp size={18} />}
              tone="blue"
            />
            <StatCard
              label="Past natija"
              value={`${stats.low?.percent ?? 0}%`}
              hint={one(stats.low?.test)?.title}
              icon={<TrendingDown size={18} />}
              tone="amber"
            />
          </div>

          <Card className="mt-6 overflow-hidden">
            <div className="flex flex-col gap-3 border-b border-ink/5 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="flex items-center gap-2 font-semibold text-forest-950">
                  <Users2 size={16} className="text-forest-600" /> Urinishlar
                  ro‘yxati
                </h2>
                <p className="text-xs text-ink/45">{stats.students} o‘quvchi</p>
              </div>
              <div className="relative w-full sm:max-w-xs">
                <Search
                  size={16}
                  className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink/30"
                />
                <input
                  className="field !py-2 !pl-9"
                  placeholder="O‘quvchi yoki test"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
            </div>

            {filtered.length === 0 ? (
              <EmptyState title="Mos natija topilmadi" />
            ) : (
              <ul className="divide-y divide-ink/5">
                {filtered.map((r) => {
                  const t = one(r.test);
                  const s = one(r.student);
                  return (
                    <li key={r.id}>
                      <Link
                        to={`/app/results/${r.id}`}
                        className="flex items-center gap-4 px-5 py-3.5 transition hover:bg-forest-50/40"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold text-ink/85">
                            {s?.full_name ?? "—"}
                          </p>
                          <p className="truncate text-[12px] text-ink/45">
                            {t?.title ?? "—"}
                          </p>
                        </div>
                        <div className="hidden w-32 shrink-0 sm:block">
                          {t?.kind === "standard" ? (
                            <ScoreBar percent={r.percent ?? 0} />
                          ) : (
                            <div className="h-2 rounded-full bg-forest-100">
                              <div
                                className="h-2 rounded-full bg-forest-600"
                                style={{ width: `${r.percent ?? 0}%` }}
                              />
                            </div>
                          )}
                        </div>
                        <div className="shrink-0 text-right">
                          <p className="text-sm font-bold text-forest-900">
                            {r.percent ?? 0}%
                          </p>
                          <p className="text-[11px] text-ink/35">
                            {formatDateTime(r.submitted_at)}
                          </p>
                        </div>
                        {r.auto_submitted && <Badge tone="amber">auto</Badge>}
                        <ChevronRight
                          size={16}
                          className="shrink-0 text-ink/25"
                        />
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
