import { Link } from "react-router-dom";
import {
  ClipboardList,
  Clock,
  Play,
  RotateCcw,
  CheckCircle2,
  CalendarClock,
  BookOpenCheck,
} from "lucide-react";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../context/AuthContext";
import { useQuery } from "../../context/ToastProvider";
import {
  Badge,
  Card,
  EmptyState,
  ErrorBox,
  PageHeader,
  Spinner,
} from "../../components/ui";
import { formatDateTime } from "../../lib/api";
import type { Assignment, Attempt } from "../../types";

interface Row extends Assignment {
  test:
    | {
        id: string;
        title: string;
        description: string;
        kind: string;
        category: string;
        time_limit_sec: number | null;
        is_active: boolean;
      }
    | {
        id: string;
        title: string;
        description: string;
        kind: string;
        category: string;
        time_limit_sec: number | null;
        is_active: boolean;
      }[]
    | null;
}

const one = <T,>(v: T | T[] | null | undefined): T | null =>
  Array.isArray(v) ? (v[0] ?? null) : (v ?? null);

export function MyTestsPage() {
  const { profile } = useAuth();

  const q = useQuery(async () => {
    if (!profile) return { data: null };
    const { data: assigns, error } = await supabase
      .from("assignments")
      .select(
        "*, test:tests(id,title,description,kind,category,time_limit_sec,is_active)",
      )
      .order("created_at", { ascending: false });
    if (error) return { data: null, error };

    const { data: attempts, error: aErr } = await supabase
      .from("attempts")
      // Natija ustunlari ataylab so'ralmaydi — o'quvchi o'z ballini ko'rmaydi
      .select(
        "id,assignment_id,test_id,student_id,status,round,started_at,deadline_at,submitted_at,auto_submitted,updated_at",
      )
      .eq("student_id", profile.id)
      .order("started_at", { ascending: false });
    if (aErr) return { data: null, error: aErr };

    return {
      data: {
        assigns: (assigns ?? []) as Row[],
        attempts: (attempts ?? []) as Attempt[],
      },
    };
  }, [profile?.id]);

  if (q.loading) return <Spinner />;
  if (q.error) return <ErrorBox message={q.error} />;

  const assigns = q.data?.assigns ?? [];
  const attempts = q.data?.attempts ?? [];

  const items = assigns.map((a) => {
    const attempt = attempts.find((at) => at.assignment_id === a.id);
    const t = one(a.test);
    const overdue = a.due_at
      ? new Date(a.due_at).getTime() < Date.now()
      : false;
    return { a, t, attempt, overdue };
  });

  const pending = items.filter(
    (i) => i.attempt?.status !== "submitted" && i.t?.is_active !== false,
  );
  const done = items.filter((i) => i.attempt?.status === "submitted");

  return (
    <div>
      <PageHeader
        title="Mening testlarim"
        subtitle="Sizga tayinlangan testlar. Testni bir marta topshirasiz — javoblar avtomatik saqlanadi."
      />

      <div className="mb-3 flex items-center gap-2">
        <BookOpenCheck size={16} className="text-forest-600" />
        <h2 className="text-sm font-bold uppercase tracking-wider text-ink/45">
          Faol topshiriqlar ({pending.length})
        </h2>
      </div>

      {pending.length === 0 ? (
        <Card>
          <EmptyState
            icon={<ClipboardList size={24} />}
            title="Faol testlar yo‘q"
            description="Psixologingiz test tayinlaganda shu yerda ko‘rinadi."
          />
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {pending.map(({ a, t, attempt, overdue }) => (
            <Card
              key={a.id}
              className="flex animate-fade-up flex-col p-5 transition hover:-translate-y-0.5 hover:shadow-lift"
            >
              <div className="flex items-center justify-between">
                <Badge tone={t?.kind === "psych" ? "forest" : "sky"}>
                  {t?.kind === "psych" ? "Psixologik" : "Bilim testi"}
                </Badge>
                {attempt && <Badge tone="amber">Jarayonda</Badge>}
              </div>
              <h3 className="mt-3 line-clamp-2 font-semibold leading-snug text-forest-950">
                {t?.title}
              </h3>
              <p className="mt-1 line-clamp-2 text-[12.5px] leading-relaxed text-ink/50">
                {t?.description || "Tavsifsiz"}
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-3 text-[11.5px] text-ink/45">
                {t?.time_limit_sec ? (
                  <span className="inline-flex items-center gap-1">
                    <Clock size={13} /> {Math.round(t.time_limit_sec / 60)}{" "}
                    daqiqa
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1">
                    <Clock size={13} /> Vaqt cheklanmagan
                  </span>
                )}
                {a.due_at && (
                  <span
                    className={
                      overdue
                        ? "inline-flex items-center gap-1 text-rose-600"
                        : "inline-flex items-center gap-1"
                    }
                  >
                    <CalendarClock size={13} /> {formatDateTime(a.due_at)}
                  </span>
                )}
              </div>
              <div className="mt-4 border-t border-ink/5 pt-3">
                {overdue && !attempt ? (
                  <p className="text-[12px] text-rose-600">
                    Muddat o‘tgan. Psixolog bilan bog‘laning.
                  </p>
                ) : (
                  <Link
                    to={`/app/take/${a.id}`}
                    className="btn-primary w-full !py-2.5"
                  >
                    {attempt ? (
                      <>
                        <RotateCcw size={15} /> Davom ettirish
                      </>
                    ) : (
                      <>
                        <Play size={15} /> Boshlash
                      </>
                    )}
                  </Link>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}

      <div className="mb-3 mt-8 flex items-center gap-2">
        <CheckCircle2 size={16} className="text-forest-600" />
        <h2 className="text-sm font-bold uppercase tracking-wider text-ink/45">
          Yakunlangan ({done.length})
        </h2>
      </div>
      {done.length === 0 ? (
        <p className="text-sm text-ink/40">
          Hozircha topshirilgan testlar yo‘q.
        </p>
      ) : (
        <Card className="divide-y divide-ink/5">
          {done.map(({ a, t, attempt }) => (
            <div
              key={a.id}
              className="flex items-center justify-between gap-3 px-5 py-3.5"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-ink/80">
                  {t?.title}
                </p>
                <p className="text-[11.5px] text-ink/40">
                  Topshirilgan: {formatDateTime(attempt?.submitted_at)}
                </p>
              </div>
              <Badge tone="sage">
                <CheckCircle2 size={12} /> Yakunlangan
              </Badge>
            </div>
          ))}
        </Card>
      )}

      <div className="mt-6 rounded-2xl bg-forest-50 px-4 py-3 text-[12px] leading-relaxed text-forest-900">
        Natijalar sizga ko‘rsatilmaydi. Natijani psixologingiz bilan suhbatda
        muhokama qilasiz.
      </div>
    </div>
  );
}
