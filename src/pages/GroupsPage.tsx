import { useState } from "react";
import { UsersRound, Plus, Trash2, UserMinus } from "lucide-react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/toastCtx";
import { useQuery } from "../context/ToastProvider";
import { uzError } from "../lib/errors";
import {
  Card,
  EmptyState,
  ErrorBox,
  Modal,
  PageHeader,
  Spinner,
} from "../components/ui";
import type { Group, Profile } from "../types";

interface GroupRow extends Group {
  group_members: {
    student_id: string;
    profiles: { full_name: string } | { full_name: string }[] | null;
  }[];
}

export function GroupsPage() {
  const { profile } = useAuth();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const q = useQuery(async () => {
    const { data, error } = await supabase
      .from("groups")
      .select("*, group_members(student_id, profiles(full_name))")
      .order("created_at", { ascending: false });
    return { data: data as GroupRow[] | null, error };
  }, [profile?.id]);

  const studentsQ = useQuery(async () => {
    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("role", "student")
      .order("full_name");
    return { data: data as Profile[] | null, error };
  }, [profile?.id]);

  async function create() {
    if (!name.trim() || !profile) return;
    setBusy(true);
    setError(null);
    const { error } = await supabase
      .from("groups")
      .insert({ name: name.trim(), owner_id: profile.id });
    setBusy(false);
    if (error) return setError(uzError(error));
    setName("");
    setOpen(false);
    toast("Guruh yaratildi");
    q.reload();
  }

  async function removeGroup(g: GroupRow) {
    if (!confirm(`"${g.name}" guruhini o'chirasizmi?`)) return;
    const { error } = await supabase.from("groups").delete().eq("id", g.id);
    if (error) return toast(uzError(error), "error");
    toast("Guruh o‘chirildi");
    q.reload();
  }

  async function addMember(groupId: string, studentId: string) {
    if (!studentId) return;
    const { error } = await supabase
      .from("group_members")
      .insert({ group_id: groupId, student_id: studentId });
    if (error) return toast(uzError(error), "error");
    toast("O‘quvchi guruhga qo‘shildi");
    q.reload();
  }

  async function removeMember(groupId: string, studentId: string) {
    const { error } = await supabase
      .from("group_members")
      .delete()
      .eq("group_id", groupId)
      .eq("student_id", studentId);
    if (error) return toast(uzError(error), "error");
    q.reload();
  }

  return (
    <div>
      <PageHeader
        title="Guruhlar"
        subtitle="O‘quvchilarni guruhlarga birlashtiring va testlarni butun guruhga tayinlang."
        actions={
          <button className="btn-primary" onClick={() => setOpen(true)}>
            <Plus size={16} /> Yangi guruh
          </button>
        }
      />

      {q.loading ? (
        <Spinner />
      ) : q.error ? (
        <ErrorBox message={q.error} />
      ) : (q.data ?? []).length === 0 ? (
        <Card>
          <EmptyState
            icon={<UsersRound size={24} />}
            title="Guruhlar yo‘q"
            description="Masalan: «9-A sinf» yoki «Yangi qabul guruhi»."
            action={
              <button className="btn-primary" onClick={() => setOpen(true)}>
                <Plus size={16} /> Yangi guruh
              </button>
            }
          />
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {(q.data ?? []).map((g) => (
            <Card key={g.id} className="animate-fade-up p-5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-display text-lg text-forest-950">
                    {g.name}
                  </p>
                  <p className="mt-0.5 text-xs text-ink/45">
                    {g.group_members.length} o‘quvchi
                  </p>
                </div>
                <button
                  className="btn-ghost !p-2 text-rose-500"
                  onClick={() => removeGroup(g)}
                  title="O‘chirish"
                >
                  <Trash2 size={16} />
                </button>
              </div>
              <div className="mt-4 space-y-1.5">
                {g.group_members.length === 0 && (
                  <p className="text-xs text-ink/40">Hozircha a’zo yo‘q</p>
                )}
                {g.group_members.map((m) => {
                  const p = m.profiles;
                  const nm = Array.isArray(p) ? p[0]?.full_name : p?.full_name;
                  return (
                    <div
                      key={m.student_id}
                      className="flex items-center justify-between rounded-xl bg-forest-50/50 px-3 py-1.5"
                    >
                      <span className="truncate text-[13px] text-ink/70">
                        {nm ?? "—"}
                      </span>
                      <button
                        className="text-ink/30 hover:text-rose-500"
                        onClick={() => removeMember(g.id, m.student_id)}
                      >
                        <UserMinus size={14} />
                      </button>
                    </div>
                  );
                })}
              </div>
              <select
                className="field mt-3 !py-2 !text-[12.5px]"
                value=""
                onChange={(e) => addMember(g.id, e.target.value)}
              >
                <option value="">+ O‘quvchi qo‘shish</option>
                {(studentsQ.data ?? [])
                  .filter(
                    (s) => !g.group_members.some((m) => m.student_id === s.id),
                  )
                  .map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.full_name}
                    </option>
                  ))}
              </select>
            </Card>
          ))}
        </div>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title="Yangi guruh">
        <div className="space-y-4">
          <div>
            <label className="label">Guruh nomi</label>
            <input
              className="field"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="9-A sinf"
              autoFocus
            />
          </div>
          {error && <ErrorBox message={error} />}
          <div className="flex justify-end gap-2">
            <button className="btn-ghost" onClick={() => setOpen(false)}>
              Bekor qilish
            </button>
            <button
              className="btn-primary"
              onClick={create}
              disabled={busy || !name.trim()}
            >
              {busy ? "Yaratilmoqda..." : "Yaratish"}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
