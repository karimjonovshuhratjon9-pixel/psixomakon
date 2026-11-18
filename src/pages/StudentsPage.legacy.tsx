import { useState } from "react";
import {
  Users,
  Plus,
  Lock,
  Unlock,
  Search,
  KeyRound,
  Copy,
  Send,
  UserCheck,
} from "lucide-react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/toastCtx";
import { useQuery } from "../context/ToastProvider";
import { randomPassword, slugLogin } from "../lib/accounts";
import { createAccount } from "../lib/createAccount";
import { uzError } from "../lib/errors";
import {
  Badge,
  Card,
  EmptyState,
  ErrorBox,
  Modal,
  PageHeader,
  Spinner,
} from "../components/ui";
import { formatDate, initials } from "../lib/api";
import type { Group, Profile } from "../types";

interface StudentRow extends Profile {
  group_members?: {
    group_id: string;
    groups: { name: string } | { name: string }[] | null;
  }[];
}

function groupName(m: StudentRow["group_members"]): string {
  const g = m?.[0]?.groups;
  if (!g) return "—";
  return Array.isArray(g) ? (g[0]?.name ?? "—") : g.name;
}

export function StudentsPage() {
  const { profile } = useAuth();
  const toast = useToast();
  const isAdmin = profile?.role === "admin";
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [reset, setReset] = useState<{
    name: string;
    login: string;
    password: string;
  } | null>(null);
  const [creds, setCreds] = useState<{
    login: string;
    password: string;
  } | null>(null);

  const q = useQuery(async () => {
    let query = supabase
      .from("profiles")
      .select("*, group_members(group_id, groups(name))")
      .eq("role", "student")
      .order("created_at", { ascending: false });
    const { data, error } = await query;
    return { data: data as StudentRow[] | null, error };
  }, [profile?.id]);

  const groupsQ = useQuery(async () => {
    const { data, error } = await supabase
      .from("groups")
      .select("*")
      .order("name");
    return { data: data as Group[] | null, error };
  }, [profile?.id]);

  const list = (q.data ?? []).filter(
    (s) =>
      !search ||
      s.full_name.toLowerCase().includes(search.toLowerCase()) ||
      (s.login ?? "").toLowerCase().includes(search.toLowerCase()),
  );

  async function toggleBlock(s: StudentRow) {
    const { error } = await supabase
      .from("profiles")
      .update({ is_blocked: !s.is_blocked })
      .eq("id", s.id);
    if (error) return toast(uzError(error), "error");
    toast(s.is_blocked ? "Akkaunt faollashtirildi" : "Akkaunt bloklandi");
    q.reload();
  }

  async function resetPassword(s: StudentRow) {
    const pwd = randomPassword();
    navigator.clipboard.writeText(pwd).catch(() => {});
    setReset({
      name: s.full_name,
      login: s.login || "—",
      password: pwd,
    });
  }

  async function addToGroup(studentId: string, groupId: string) {
    if (!groupId) return;
    const { error } = await supabase
      .from("group_members")
      .insert({ group_id: groupId, student_id: studentId });
    if (error) return toast(uzError(error), "error");
    toast("Guruhga qo‘shildi");
    q.reload();
  }

  return (
    <div>
      <PageHeader
        title="O‘quvchilar"
        subtitle={
          isAdmin
            ? "Platformadagi barcha o‘quvchilar."
            : "Siz yaratgan o‘quvchilar va ularning guruhlari."
        }
        actions={
          <button className="btn-primary" onClick={() => setOpen(true)}>
            <Plus size={16} /> Yangi o‘quvchi
          </button>
        }
      />

      <Card className="overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-ink/5 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative w-full sm:max-w-xs">
            <Search
              size={16}
              className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink/30"
            />
            <input
              className="field !py-2 !pl-9"
              placeholder="Ism yoki login bo‘yicha qidirish"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <p className="text-xs text-ink/45">Jami: {q.data?.length ?? 0}</p>
        </div>

        {q.loading ? (
          <Spinner />
        ) : q.error ? (
          <div className="p-5">
            <ErrorBox message={q.error} />
          </div>
        ) : list.length === 0 ? (
          <EmptyState
            icon={<Users size={24} />}
            title="O‘quvchilar yo‘q"
            description="O‘quvchi uchun login va parol yaratib, test tayinlashingiz mumkin."
            action={
              <button className="btn-primary" onClick={() => setOpen(true)}>
                <Plus size={16} /> Yangi o‘quvchi
              </button>
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px]">
              <thead className="bg-forest-50/50">
                <tr>
                  <th className="table-head">O‘quvchi</th>
                  <th className="table-head">Login</th>
                  {!isAdmin && <th className="table-head">Guruh</th>}
                  <th className="table-head">Holat</th>
                  <th className="table-head">Qo‘shilgan</th>
                  <th className="table-head text-right">Amallar</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink/5">
                {list.map((s) => (
                  <tr key={s.id} className="transition hover:bg-forest-50/30">
                    <td className="table-cell">
                      <div className="flex items-center gap-3">
                        <span className="grid h-9 w-9 place-items-center rounded-xl bg-sage-100 text-[12px] font-bold text-forest-800">
                          {initials(s.full_name)}
                        </span>
                        <div>
                          <p className="font-semibold text-ink/85">
                            {s.full_name}
                          </p>
                          <p className="text-[11.5px] text-ink/40">
                            {s.phone || "—"}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="table-cell font-mono text-[13px]">
                      {s.login || "—"}
                    </td>
                    {!isAdmin && (
                      <td className="table-cell">
                        {(groupsQ.data ?? []).length > 0 ? (
                          <select
                            className="field !w-auto !py-1.5 !text-[12px]"
                            value={s.group_members?.[0]?.group_id ?? ""}
                            onChange={(e) => addToGroup(s.id, e.target.value)}
                          >
                            <option value="">
                              {groupName(s.group_members)}
                            </option>
                            {(groupsQ.data ?? []).map((g) => (
                              <option key={g.id} value={g.id}>
                                {g.name}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <span className="text-xs text-ink/40">
                            {groupName(s.group_members)}
                          </span>
                        )}
                      </td>
                    )}
                    <td className="table-cell">
                      {s.is_blocked ? (
                        <Badge tone="rose">Bloklangan</Badge>
                      ) : (
                        <Badge tone="sage">Faol</Badge>
                      )}
                    </td>
                    <td className="table-cell text-ink/50">
                      {formatDate(s.created_at)}
                    </td>
                    <td className="table-cell">
                      <div className="flex justify-end gap-1.5">
                        <button
                          className="btn-secondary !px-3 !py-1.5"
                          onClick={() => resetPassword(s)}
                          title="Parol tiklash"
                        >
                          <KeyRound size={14} />
                        </button>
                        <button
                          className={
                            s.is_blocked
                              ? "btn-secondary !px-3 !py-1.5"
                              : "btn-danger !px-3 !py-1.5"
                          }
                          onClick={() => toggleBlock(s)}
                        >
                          {s.is_blocked ? (
                            <Unlock size={14} />
                          ) : (
                            <Lock size={14} />
                          )}
                          {s.is_blocked ? "Faollashtirish" : "Bloklash"}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <CreateStudentModal
        open={open}
        onClose={() => setOpen(false)}
        groups={groupsQ.data ?? []}
        onCreated={(c) => {
          setOpen(false);
          setCreds(c);
          q.reload();
        }}
      />

      <Modal
        open={!!creds}
        onClose={() => setCreds(null)}
        title="O‘quvchi akkaunti yaratildi"
        description="Kirish ma’lumotlarini o‘quvchiga bering."
      >
        {creds && (
          <div className="space-y-4">
            <div className="rounded-2xl bg-forest-50 p-4">
              <p className="text-[11px] font-bold uppercase tracking-wider text-forest-700">
                Login
              </p>
              <p className="mt-1 font-mono text-sm text-forest-950">
                {creds.login}
              </p>
              <p className="mt-3 text-[11px] font-bold uppercase tracking-wider text-forest-700">
                Parol
              </p>
              <p className="mt-1 font-mono text-sm text-forest-950">
                {creds.password}
              </p>
            </div>
            <button
              className="btn-primary w-full"
              onClick={() => {
                navigator.clipboard.writeText(
                  `Login: ${creds.login}\nParol: ${creds.password}`,
                );
                toast("Nusxa olindi");
              }}
            >
              <Copy size={15} /> Nusxalash
            </button>
          </div>
        )}
      </Modal>

      <Modal
        open={!!reset}
        onClose={() => setReset(null)}
        title="Yangi parol"
        description="Diqqat: bu parol BAZADA SAQLANMADI."
      >
        {reset && (
          <div className="space-y-4">
            <div className="rounded-2xl bg-forest-50 p-4">
              <p className="text-[11px] font-bold uppercase tracking-wider text-forest-700">
                O‘quvchi
              </p>
              <p className="mt-1 text-sm font-semibold text-forest-950">
                {reset.name}
              </p>
              <p className="mt-3 text-[11px] font-bold uppercase tracking-wider text-forest-700">
                Login
              </p>
              <p className="mt-1 font-mono text-sm text-forest-950">
                {reset.login}
              </p>
              <p className="mt-3 text-[11px] font-bold uppercase tracking-wider text-forest-700">
                Yangi parol
              </p>
              <p className="mt-1 font-mono text-sm text-forest-950">
                {reset.password}
              </p>
            </div>
            <div className="rounded-2xl bg-rose-50 px-4 py-3 text-[12px] leading-relaxed text-rose-700 ring-1 ring-rose-100">
              <b>Bu parol amalda ishlamaydi.</b> Brauzerdan o‘quvchi parolini
              o‘zgartirib bo‘lmaydi (bu uchun admin huquqi kerak). Yangi parol
              berish uchun Supabase Dashboard → Authentication → Users →
              foydalanuvchini tanlang → <b>Reset / Update password</b>.
            </div>
            <button
              className="btn-secondary w-full"
              onClick={() => setReset(null)}
            >
              Yopish
            </button>
          </div>
        )}
      </Modal>
    </div>
  );
}

function CreateStudentModal({
  open,
  onClose,
  groups,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  groups: Group[];
  onCreated: (c: { login: string; password: string }) => void;
}) {
  const { profile } = useAuth();
  const toast = useToast();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [login, setLogin] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [groupId, setGroupId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setError(null);
    const finalEmail = email.trim().toLowerCase();
    const finalLogin = login.trim().toLowerCase();
    if (!fullName.trim()) return setError("Ism va familiyani kiriting");
    if (!finalEmail) return setError("Emailni kiriting");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(finalEmail))
      return setError("Email manzil noto‘g‘ri kiritilgan");
    if (finalLogin && !/^[a-z0-9][a-z0-9._-]{2,29}$/.test(finalLogin))
      return setError(
        "Login 3-30 belgi bo‘lsin: faqat lotin harflari, raqamlar va . _ -",
      );
    const pwd = password || randomPassword();
    if (pwd.length < 6) return setError("Parol kamida 6 belgi");
    setBusy(true);
    try {
      if (!profile)
        throw new Error("Profil topilmadi. Qaytadan tizimga kiring.");
      const created = await createAccount({
        fullName: fullName.trim(),
        email: finalEmail,
        login: finalLogin || undefined,
        password: pwd,
        phone: phone.trim(),
        role: "student",
        active: true,
      });
      if (groupId) {
        const { error: gmErr } = await supabase
          .from("group_members")
          .insert({ group_id: groupId, student_id: created.id });
        if (gmErr) {
          toast(
            `Akkaunt yaratildi, lekin guruhga qo‘shilmadi: ${uzError(gmErr)}`,
            "error",
          );
        }
      }
      setFullName("");
      setEmail("");
      setLogin("");
      setPhone("");
      setPassword("");
      setGroupId("");
      onCreated({ login: created.identifier, password: pwd });
      toast("O‘quvchi akkaunti yaratildi");
    } catch (e) {
      setError(uzError(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Yangi o‘quvchi"
      description="Login va parol serverda xavfsiz yaratiladi (admin sessiyasi saqlanadi)."
    >
      <div className="space-y-4">
        <div>
          <label className="label">Ism va familiya</label>
          <input
            className="field"
            value={fullName}
            onChange={(e) => {
              setFullName(e.target.value);
              if (!login) setLogin(slugLogin(e.target.value));
            }}
            placeholder="Aziz Karimov"
          />
        </div>
        <div>
          <label className="label">Email *</label>
          <input
            type="email"
            className="field"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="aziz@gmail.com"
          />
          <p className="mt-1 text-[11px] text-ink/40">
            Tizimga kirishda ishlatiladi. Haqiqiy email kiriting.
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label">Qulay login (ixtiyoriy)</label>
            <input
              className="field font-mono"
              value={login}
              onChange={(e) => setLogin(e.target.value)}
              placeholder={slugLogin(fullName) || "aziz.karimov"}
            />
          </div>
          <div>
            <label className="label">Telefon (ixtiyoriy)</label>
            <input
              className="field"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label">Parol</label>
            <div className="flex gap-2">
              <input
                className="field font-mono"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Avtomatik"
              />
              <button
                className="btn-secondary shrink-0 !px-3"
                type="button"
                onClick={() => setPassword(randomPassword())}
              >
                <KeyRound size={15} />
              </button>
            </div>
          </div>
          {groups.length > 0 && (
            <div>
              <label className="label">Guruh (ixtiyoriy)</label>
              <select
                className="field"
                value={groupId}
                onChange={(e) => setGroupId(e.target.value)}
              >
                <option value="">Guruhsiz</option>
                {groups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
        {error && <ErrorBox message={error} />}
        <div className="flex items-center justify-between gap-2 pt-1">
          <p className="flex items-center gap-1.5 text-[11.5px] text-ink/40">
            <UserCheck size={13} /> Akkaunt darhol faol bo‘ladi
          </p>
          <div className="flex gap-2">
            <button className="btn-ghost" onClick={onClose}>
              Bekor qilish
            </button>
            <button className="btn-primary" onClick={submit} disabled={busy}>
              <Send size={15} /> {busy ? "Yaratilmoqda..." : "Yaratish"}
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
