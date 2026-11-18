import { useState } from "react";
import {
  Send,
  Trash2,
  RotateCcw,
  Users,
  User,
  CalendarClock,
} from "lucide-react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/toastCtx";
import { useQuery } from "../context/ToastProvider";
import { uzError } from "../lib/errors";
import {
  Badge,
  Card,
  EmptyState,
  ErrorBox,
  PageHeader,
  Spinner,
} from "../components/ui";
import { formatDateTime } from "../lib/api";

interface Row {
  id: string;
  test_id: string;
  student_id: string | null;
  group_id: string | null;
  due_at: string | null;
  allow_retake: boolean;
  created_at: string;
  test: { title: string } | { title: string }[] | null;
  student: { full_name: string } | { full_name: string }[] | null;
  group: { name: string } | { name: string }[] | null;
  attempts?: {
    id: string;
    status: string;
    percent: number | null;
    student_id: string;
  }[];
}

const one = <T,>(v: T | T[] | null | undefined): T | null =>
  Array.isArray(v) ? (v[0] ?? null) : (v ?? null);

export function AssignmentsPage() {
  const { profile } = useAuth();
  const toast = useToast();
  const [filter, setFilter] = useState("");

  const q = useQuery(async () => {
    const { data, error } = await supabase
      .from("assignments")
      .select(
        "*, test:tests(title), student:profiles!assignments_student_id_fkey(full_name), group:groups(name), attempts(id,status,percent,student_id)",
      )
      .order("created_at", { ascending: false });
    return { data: data as Row[] | null, error };
  }, [profile?.id]);

  async function remove(r: Row) {
    if (!confirm("Tayinlashni o‘chirasizmi? Tegishli natijalar ham o‘chadi."))
      return;
    const { error } = await supabase
      .from("assignments")
      .delete()
      .eq("id", r.id);
    if (error) return toast(uzError(error), "error");
    toast("O‘chirildi");
    q.reload();
  }

  async function allowRetake(r: Row, studentId: string) {
    // Barcha urinishlarni o'chiramiz → o'quvchi qaytadan boshlashi mumkin (vaqt noldan)
    const { error } = await supabase
      .from("attempts")
      .delete()
      .eq("assignment_id", r.id)
      .eq("student_id", studentId);
    if (error) return toast(uzError(error), "error");
    toast("Qayta urinishga ruxsat berildi");
    q.reload();
  }

  const list = (q.data ?? []).filter(
    (r) =>
      !filter ||
      one(r.test)?.title.toLowerCase().includes(filter.toLowerCase()),
  );

  return (
    <div>
      <PageHeader
        title="Tayinlashlar"
        subtitle="Testlar kimga va qaysi guruhga tayinlanganini boshqaring."
        actions={
          <div className="flex items-center gap-2 text-[12px] text-ink/45">
            <CalendarClock size={15} /> Jami: {q.data?.length ?? 0}
          </div>
        }
      />

      <div className="mb-4 sm:max-w-xs">
        <input
          className="field !py-2"
          placeholder="Test nomi bo‘yicha qidirish"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
      </div>

      {q.loading ? (
        <Spinner />
      ) : q.error ? (
        <ErrorBox message={q.error} />
      ) : list.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Send size={24} />}
            title="Tayinlashlar yo‘q"
            description="Kutubxonadan yoki o‘z testingizdan tanlab o‘quvchi/guruhga tayinlang."
          />
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px]">
              <thead className="bg-forest-50/50">
                <tr>
                  <th className="table-head">Test</th>
                  <th className="table-head">Kimga</th>
                  <th className="table-head">Muddat</th>
                  <th className="table-head">Holat</th>
                  <th className="table-head text-right">Amallar</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink/5">
                {list.map((r) => {
                  const t = one(r.test);
                  const g = one(r.group);
                  const s = one(r.student);
                  const attempts = r.attempts ?? [];
                  const submitted = attempts.filter(
                    (a) => a.status === "submitted",
                  ).length;
                  return (
                    <tr key={r.id} className="transition hover:bg-forest-50/30">
                      <td className="table-cell">
                        <p className="font-semibold text-ink/85">
                          {t?.title ?? "—"}
                        </p>
                        <p className="text-[11.5px] text-ink/40">
                          Yaratilgan: {formatDateTime(r.created_at)}
                        </p>
                      </td>
                      <td className="table-cell">
                        {g ? (
                          <span className="inline-flex items-center gap-1.5 text-[13px]">
                            <Users size={14} className="text-forest-600" />{" "}
                            {g.name}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 text-[13px]">
                            <User size={14} className="text-forest-600" />{" "}
                            {s?.full_name ?? "—"}
                          </span>
                        )}
                      </td>
                      <td className="table-cell text-ink/55">
                        {r.due_at ? formatDateTime(r.due_at) : "Cheklovsiz"}
                      </td>
                      <td className="table-cell">
                        {submitted > 0 ? (
                          <Badge tone="sage">{submitted} ta topshirilgan</Badge>
                        ) : (
                          <Badge tone="amber">Kutilmoqda</Badge>
                        )}
                      </td>
                      <td className="table-cell">
                        <div className="flex justify-end gap-1.5">
                          {attempts.length > 0 && (
                            <button
                              className="btn-secondary !px-3 !py-1.5"
                              title="Qayta urinishga ruxsat (urinishlar o‘chiriladi)"
                              onClick={() =>
                                allowRetake(r, attempts[0].student_id)
                              }
                            >
                              <RotateCcw size={14} /> Qayta
                            </button>
                          )}
                          <button
                            className="btn-danger !px-3 !py-1.5"
                            onClick={() => remove(r)}
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
