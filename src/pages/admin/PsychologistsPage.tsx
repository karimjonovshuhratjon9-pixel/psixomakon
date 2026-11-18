import { useState } from "react";
import {
  UserCog,
  Plus,
  Lock,
  Unlock,
  KeyRound,
  Search,
  Copy,
  ShieldAlert,
} from "lucide-react";
import { supabase, isSupabaseConfigured } from "../../lib/supabase";
import { useToast } from "../../context/toastCtx";
import { randomPassword, slugLogin } from "../../lib/accounts";
import { createAccount } from "../../lib/createAccount";
import { useQuery } from "../../context/ToastProvider";
import { uzError } from "../../lib/errors";
import {
  Badge,
  Card,
  EmptyState,
  ErrorBox,
  Modal,
  PageHeader,
  Spinner,
} from "../../components/ui";
import { formatDate, initials } from "../../lib/api";
import type { Profile } from "../../types";

export function PsychologistsPage() {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [creds, setCreds] = useState<{
    email: string;
    password: string;
  } | null>(null);

  const q = useQuery(async () => {
    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("role", "psychologist")
      .order("created_at", { ascending: false });
    return { data: data as Profile[] | null, error };
  }, []);

  const list = (q.data ?? []).filter(
    (p) =>
      !search ||
      p.full_name.toLowerCase().includes(search.toLowerCase()) ||
      (p.login ?? "").toLowerCase().includes(search.toLowerCase()),
  );

  async function toggleBlock(p: Profile) {
    const { error } = await supabase
      .from("profiles")
      .update({ is_blocked: !p.is_blocked })
      .eq("id", p.id);
    if (error) return toast(uzError(error), "error");
    toast(p.is_blocked ? "Akkaunt faollashtirildi" : "Akkaunt bloklandi");
    q.reload();
  }

  return (
    <div>
      <PageHeader
        title="Psixologlar"
        subtitle="Psixolog akkauntlarini yarating, bloklang yoki qayta tiklang."
        actions={
          <button className="btn-primary" onClick={() => setOpen(true)}>
            <Plus size={16} /> Yangi psixolog
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
            icon={<UserCog size={24} />}
            title="Psixologlar yo‘q"
            description="Birinchi psixolog akkauntini yarating."
            action={
              <button className="btn-primary" onClick={() => setOpen(true)}>
                <Plus size={16} /> Yangi psixolog
              </button>
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[700px]">
              <thead className="bg-forest-50/50">
                <tr>
                  <th className="table-head">Mutaxassis</th>
                  <th className="table-head">Login</th>
                  <th className="table-head">Holat</th>
                  <th className="table-head">Yaratilgan</th>
                  <th className="table-head text-right">Amallar</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink/5">
                {list.map((p) => (
                  <tr key={p.id} className="transition hover:bg-forest-50/30">
                    <td className="table-cell">
                      <div className="flex items-center gap-3">
                        <span className="grid h-9 w-9 place-items-center rounded-xl bg-forest-100 text-[12px] font-bold text-forest-800">
                          {initials(p.full_name)}
                        </span>
                        <div>
                          <p className="font-semibold text-ink/85">
                            {p.full_name}
                          </p>
                          <p className="text-[11.5px] text-ink/40">
                            {p.phone || "—"}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="table-cell font-mono text-[13px]">
                      {p.login || "—"}
                    </td>
                    <td className="table-cell">
                      {p.is_blocked ? (
                        <Badge tone="rose">Bloklangan</Badge>
                      ) : (
                        <Badge tone="sage">Faol</Badge>
                      )}
                    </td>
                    <td className="table-cell text-ink/50">
                      {formatDate(p.created_at)}
                    </td>
                    <td className="table-cell">
                      <div className="flex justify-end">
                        <button
                          className={
                            p.is_blocked
                              ? "btn-secondary !px-3 !py-1.5"
                              : "btn-danger !px-3 !py-1.5"
                          }
                          onClick={() => toggleBlock(p)}
                        >
                          {p.is_blocked ? (
                            <Unlock size={14} />
                          ) : (
                            <Lock size={14} />
                          )}
                          {p.is_blocked ? "Faollashtirish" : "Bloklash"}
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

      <CreatePsychologistModal
        open={open}
        onClose={() => setOpen(false)}
        onCreated={(c) => {
          setOpen(false);
          setCreds(c);
          q.reload();
        }}
      />

      <Modal
        open={!!creds}
        onClose={() => setCreds(null)}
        title="Akkaunt yaratildi"
        description="Kirish ma’lumotlarini psixologga yuboring."
      >
        {creds && (
          <div className="space-y-4">
            <div className="rounded-2xl bg-forest-50 p-4">
              <p className="text-[11px] font-bold uppercase tracking-wider text-forest-700">
                Email (login)
              </p>
              <p className="mt-1 font-mono text-sm text-forest-950">
                {creds.email}
              </p>
              <p className="mt-3 text-[11px] font-bold uppercase tracking-wider text-forest-700">
                Parol
              </p>
              <p className="mt-1 font-mono text-sm text-forest-950">
                {creds.password}
              </p>
            </div>
            <div className="flex items-start gap-2 rounded-2xl bg-amber-50 px-4 py-3 text-[12px] text-amber-800 ring-1 ring-amber-100">
              <ShieldAlert size={16} className="mt-0.5 shrink-0" />
              Parol faqat shu oynada ko‘rsatiladi. Uni xavfsiz joyda saqlang —
              parolni hech kim ko‘ra olmaydi.
            </div>
            <button
              className="btn-primary w-full"
              onClick={() => {
                navigator.clipboard.writeText(
                  `Email: ${creds.email}\nParol: ${creds.password}`,
                );
                toast("Nusxa olindi");
              }}
            >
              <Copy size={15} /> Nusxalash
            </button>
          </div>
        )}
      </Modal>
      <KeyRound className="hidden" />
    </div>
  );
}

function CreatePsychologistModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (c: { email: string; password: string }) => void;
}) {
  const toast = useToast();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [login, setLogin] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setFullName("");
    setEmail("");
    setLogin("");
    setPhone("");
    setPassword("");
    setError(null);
  }

  async function submit() {
    setError(null);
    const finalEmail = email.trim().toLowerCase();
    const finalLogin = login.trim().toLowerCase();
    if (!fullName.trim()) return setError("Ism va familiyani kiriting");
    if (!finalEmail) return setError("Emailni kiriting");
    const pwd = password || randomPassword();
    if (pwd.length < 6)
      return setError("Parol kamida 6 belgidan iborat bo‘lishi kerak");

    setBusy(true);
    try {
      await createAccount({
        fullName: fullName.trim(),
        email: finalEmail,
        login: finalLogin || undefined,
        password: pwd,
        phone: phone.trim(),
        role: "psychologist",
        active: true,
      });

      reset();
      onCreated({ email: finalEmail, password: pwd });
      toast("Psixolog akkaunti yaratildi");
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
      title="Yangi psixolog"
      description="Akkaunt darhol faol bo‘ladi."
    >
      {!isSupabaseConfigured ? (
        <ErrorBox message="Supabase sozlanmagan" />
      ) : (
        <div className="space-y-4">
          <div>
            <label className="label">Ism va familiya</label>
            <input
              className="field"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Dilnoza Karimova"
            />
          </div>
          <div>
            <label className="label">Email *</label>
            <input
              type="email"
              className="field"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="dilnoza@gmail.com"
            />
            <p className="mt-1 text-[11px] text-ink/40">
              Haqiqiy email kiriting — tizimga kirishda ishlatiladi.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label">Qulay login (ixtiyoriy)</label>
              <input
                className="field font-mono"
                value={login}
                onChange={(e) => setLogin(e.target.value)}
                placeholder={slugLogin(fullName) || "d.karimova"}
              />
            </div>
            <div>
              <label className="label">Telefon</label>
              <input
                className="field"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+998 90 000 00 00"
              />
            </div>
          </div>
          <div>
            <label className="label">
              Parol (bo‘sh qoldirsangiz avtomatik)
            </label>
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
          {error && <ErrorBox message={error} />}
          <div className="flex justify-end gap-2 pt-1">
            <button className="btn-ghost" onClick={onClose}>
              Bekor qilish
            </button>
            <button className="btn-primary" onClick={submit} disabled={busy}>
              {busy ? "Yaratilmoqda..." : "Yaratish"}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
