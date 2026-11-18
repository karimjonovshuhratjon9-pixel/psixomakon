import { useMemo } from "react";
import { Link, Navigate } from "react-router-dom";
import {
  Users,
  UserCog,
  ClipboardList,
  BarChart3,
  ArrowUpRight,
  Sparkles,
  BookOpenCheck,
  Plus,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { supabase } from "../lib/supabase";
import { useQuery } from "../context/ToastProvider";
import {
  Badge,
  Card,
  EmptyState,
  PageHeader,
  Spinner,
  StatCard,
} from "../components/ui";
import { formatDateTime } from "../lib/api";

interface RecentAttempt {
  id: string;
  status: string;
  percent: number | null;
  submitted_at: string | null;
  started_at: string;
  student: { full_name: string } | { full_name: string }[] | null;
  test: { title: string } | { title: string }[] | null;
}

function pick<T>(v: T | T[] | null): T | null {
  if (!v) return null;
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

export function DashboardPage() {
  const { profile } = useAuth();
  const isAdmin = profile?.role === "admin";
  const isPsych = profile?.role === "psychologist";

  if (profile?.role === "student")
    return <Navigate to="/app/my-tests" replace />;

  const stats = useQuery(async () => {
    if (!profile) return { data: null };
    if (profile.role === "admin") {
      const [psy, stud, tests, attempts] = await Promise.all([
        supabase
          .from("profiles")
          .select("id", { count: "exact", head: true })
          .eq("role", "psychologist"),
        supabase
          .from("profiles")
          .select("id", { count: "exact", head: true })
          .eq("role", "student"),
        supabase.from("tests").select("id", { count: "exact", head: true }),
        supabase
          .from("attempts")
          .select("id", { count: "exact", head: true })
          .eq("status", "submitted"),
      ]);
      const err = psy.error || stud.error || tests.error || attempts.error;
      if (err) return { data: null, error: err };
      return {
        data: {
          psychologists: psy.count ?? 0,
          students: stud.count ?? 0,
          tests: tests.count ?? 0,
          attempts: attempts.count ?? 0,
          assignments: 0,
          myTests: 0,
        },
      };
    }
    const [stud, tests, assignments, attempts] = await Promise.all([
      supabase
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .eq("role", "student")
        .eq("created_by", profile.id),
      supabase
        .from("tests")
        .select("id", { count: "exact", head: true })
        .eq("owner_id", profile.id),
      supabase
        .from("assignments")
        .select("id", { count: "exact", head: true })
        .eq("assigned_by", profile.id),
      supabase
        .from("attempts")
        .select("id", { count: "exact", head: true })
        .eq("status", "submitted"),
    ]);
    const err =
      stud.error || tests.error || assignments.error || attempts.error;
    if (err) return { data: null, error: err };
    return {
      data: {
        psychologists: 0,
        students: stud.count ?? 0,
        tests: 0,
        attempts: attempts.count ?? 0,
        assignments: assignments.count ?? 0,
        myTests: tests.count ?? 0,
      },
    };
  }, [profile?.id, profile?.role]);

  const recent = useQuery(async () => {
    if (!profile) return { data: null };
    const { data, error } = await supabase
      .from("attempts")
      .select(
        "id,status,percent,submitted_at,started_at,student:profiles!attempts_student_id_fkey(full_name),test:tests(title)",
      )
      .order("updated_at", { ascending: false })
      .limit(6);
    return { data: data as RecentAttempt[] | null, error };
  }, [profile?.id]);

  const hour = new Date().getHours();
  const greeting =
    hour < 12 ? "Xayrli tong" : hour < 18 ? "Xayrli kun" : "Xayrli kech";

  const quick = useMemo(() => {
    if (isAdmin)
      return [
        {
          to: "/app/psychologists",
          label: "Psixolog qo‘shish",
          icon: <UserCog size={16} />,
        },
        {
          to: "/app/tests/new",
          label: "Kutubxonaga test qo‘shish",
          icon: <Plus size={16} />,
        },
        {
          to: "/app/results",
          label: "Natijalar",
          icon: <BarChart3 size={16} />,
        },
      ];
    if (isPsych)
      return [
        {
          to: "/app/students",
          label: "O‘quvchi qo‘shish",
          icon: <Users size={16} />,
        },
        {
          to: "/app/tests/new",
          label: "Test yaratish",
          icon: <Plus size={16} />,
        },
        {
          to: "/app/assignments",
          label: "Test tayinlash",
          icon: <Sparkles size={16} />,
        },
      ];
    return [
      {
        to: "/app/my-tests",
        label: "Testlarni ko‘rish",
        icon: <BookOpenCheck size={16} />,
      },
    ];
  }, [isAdmin, isPsych]);

  return (
    <div>
      <PageHeader
        title={`${greeting}, ${(profile?.full_name || "").split(" ")[0] || "foydalanuvchi"}!`}
        subtitle={
          isAdmin
            ? "Platforma holati va umumiy statistika bir joyda."
            : isPsych
              ? "O‘quvchilaringiz, testlar va tayinlashlar bo‘yicha umumiy manzara."
              : "Sizga tayinlangan testlar va vazifalar."
        }
        actions={
          isPsych || isAdmin ? (
            <Link to="/app/tests/new" className="btn-primary">
              <Plus size={16} /> Yangi test
            </Link>
          ) : null
        }
      />

      {stats.loading ? (
        <Spinner />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {isAdmin && (
              <StatCard
                label="Psixologlar"
                value={stats.data?.psychologists ?? 0}
                icon={<UserCog size={18} />}
                tone="forest"
                hint="Faol akkauntlar"
              />
            )}
            <StatCard
              label="O‘quvchilar"
              value={stats.data?.students ?? 0}
              icon={<Users size={18} />}
              tone="sage"
              hint={isAdmin ? "Barcha o‘quvchilar" : "Sizning o‘quvchilaringiz"}
            />
            <StatCard
              label={isAdmin ? "Testlar" : "Tayinlashlar"}
              value={
                isAdmin
                  ? (stats.data?.tests ?? 0)
                  : (stats.data?.assignments ?? 0)
              }
              icon={<ClipboardList size={18} />}
              tone="amber"
              hint={isAdmin ? "Kutubxona + shaxsiy" : "Siz tayinlagan testlar"}
            />
            <StatCard
              label="Topshirilgan testlar"
              value={stats.data?.attempts ?? 0}
              icon={<BarChart3 size={18} />}
              tone="blue"
              hint="Yakunlangan urinishlar"
            />
          </div>

          <div className="mt-6 grid gap-6 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <div className="flex items-center justify-between border-b border-ink/5 px-5 py-4">
                <div>
                  <h2 className="font-semibold text-forest-950">
                    So‘nggi natijalar
                  </h2>
                  <p className="text-xs text-ink/45">Oxirgi faoliyat</p>
                </div>
                {(isAdmin || isPsych) && (
                  <Link
                    to="/app/results"
                    className="flex items-center gap-1 text-[13px] font-semibold text-forest-700 hover:underline"
                  >
                    Barchasi <ArrowUpRight size={14} />
                  </Link>
                )}
              </div>
              {recent.loading ? (
                <Spinner />
              ) : !recent.data || recent.data.length === 0 ? (
                <EmptyState
                  title="Hozircha natijalar yo‘q"
                  description="Test topshirilgach natijalar shu yerda ko‘rinadi."
                />
              ) : (
                <ul className="divide-y divide-ink/5">
                  {recent.data.map((a) => {
                    const st = pick(a.student);
                    const ts = pick(a.test);
                    return (
                      <li
                        key={a.id}
                        className="flex items-center justify-between gap-3 px-5 py-3.5"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-ink/80">
                            {st?.full_name || "—"}
                          </p>
                          <p className="truncate text-xs text-ink/45">
                            {ts?.title || "—"}
                          </p>
                        </div>
                        <div className="flex shrink-0 items-center gap-2.5">
                          {a.status === "submitted" ? (
                            <Badge tone="sage">{a.percent ?? 0}%</Badge>
                          ) : (
                            <Badge tone="amber">Jarayonda</Badge>
                          )}
                          <span className="hidden text-[11px] text-ink/35 sm:block">
                            {formatDateTime(a.submitted_at ?? a.started_at)}
                          </span>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Card>

            <div className="space-y-4">
              <Card className="relative overflow-hidden bg-solid-dark-2 p-6 text-white">
                <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/10 blur-2xl" />
                <Sparkles size={20} className="text-sage-200" />
                <h3 className="mt-3 font-display text-xl leading-snug">
                  Tezkor harakatlar
                </h3>
                <p className="mt-1 text-[12.5px] text-white/55">
                  Eng ko‘p ishlatiladigan bo‘limlar
                </p>
                <div className="mt-4 space-y-2">
                  {quick.map((q) => (
                    <Link
                      key={q.to + q.label}
                      to={q.to}
                      className="flex items-center gap-2.5 rounded-2xl bg-white/10 px-3.5 py-2.5 text-[13px] font-semibold ring-1 ring-white/10 transition hover:bg-white/15"
                    >
                      {q.icon} {q.label}
                    </Link>
                  ))}
                </div>
              </Card>

              <Card className="p-5">
                <p className="text-[11px] font-bold uppercase tracking-wider text-ink/40">
                  Eslatma
                </p>
                <p className="mt-2 text-[13px] leading-relaxed text-ink/60">
                  Psixologik test natijalari klinik tashxis emas. Ular faqat
                  mutaxassis tomonidan tahlil qilinishi lozim.
                </p>
              </Card>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
