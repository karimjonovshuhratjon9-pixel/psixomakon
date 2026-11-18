import { useEffect, useState } from "react";
import { Eye, EyeOff, KeyRound, Save } from "lucide-react";
import { ErrorBox, InfoBox, Modal, Switch } from "../../components/ui";
import { randomPassword, slugLogin, validateLogin } from "../../lib/accounts";
import {
  createAccount,
  setStudentGroup,
  updateAccount,
} from "../../lib/createAccount";
import { uzError } from "../../lib/errors";
import { useToast } from "../../context/toastCtx";
import { isLoginTaken } from "../../lib/accounts";
import type { Group, Profile } from "../../types";

export interface StudentFormValue {
  fullName: string;
  login: string;
  email: string;
  phone: string;
  password: string;
  groupId: string;
  active: boolean;
}

const empty = (): StudentFormValue => ({
  fullName: "",
  login: "",
  email: "",
  phone: "",
  password: "",
  groupId: "",
  active: true,
});

/**
 * O'quvchi yaratish / tahrirlash formasi.
 *
 * EMAIL MAJBURIY EMAS — o'quvchi faqat login + parol bilan kiradi.
 * Email bo'sh bo'lsa server ichki (texnik) manzil yaratadi; u hech qachon
 * foydalanuvchiga ko'rsatilmaydi va xat yuborilmaydi.
 */
export function StudentForm({
  open,
  onClose,
  onSaved,
  editing,
  groups,
  currentGroupId,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: (info?: { login: string; password: string }) => void;
  editing: Profile | null;
  /** Guruh ro'yxati (yaratishda ham tanlash mumkin) */
  groups: Group[];
  /** Qaysi guruhda turgani (tahrirlashda ko'rsatiladi) */
  currentGroupId?: string;
}) {
  const toast = useToast();
  const [v, setV] = useState<StudentFormValue>(empty);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPwd, setShowPwd] = useState(false);
  const [loginTouched, setLoginTouched] = useState(false);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setShowPwd(false);
    setLoginTouched(false);
    if (editing) {
      setV({
        fullName: editing.full_name,
        login: editing.login ?? "",
        email: editing.email ?? "",
        phone: editing.phone ?? "",
        password: "",
        groupId: currentGroupId ?? "",
        active: !editing.is_blocked,
      });
    } else {
      setV({ ...empty(), password: randomPassword() });
    }
  }, [open, editing, currentGroupId]);

  const set = <K extends keyof StudentFormValue>(
    k: K,
    val: StudentFormValue[K],
  ) => setV((s) => ({ ...s, [k]: val }));

  function validate(): string | null {
    if (v.fullName.trim().length < 3)
      return "Ism va familiyani to‘liq kiriting";
    const lErr = validateLogin(v.login);
    if (lErr) return lErr;
    if (v.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.email.trim()))
      return "Email manzil noto‘g‘ri kiritilgan";
    if (!editing) {
      if (v.password.length < 6)
        return "Parol kamida 6 belgidan iborat bo‘lsin";
    } else if (v.password && v.password.length < 6) {
      return "Yangi parol kamida 6 belgidan iborat bo‘lsin";
    }
    return null;
  }

  async function submit() {
    setError(null);
    const vErr = validate();
    if (vErr) return setError(vErr);
    setBusy(true);
    try {
      const login = v.login.trim().toLowerCase();

      if (editing) {
        // Login o'zgargan bo'lsa — bandligini qayta tekshiramiz
        if (login !== (editing.login ?? "").toLowerCase()) {
          if (await isLoginTaken(login)) {
            throw new Error("Bu login allaqachon band");
          }
        }
        await updateAccount(editing.id, {
          fullName: v.fullName.trim(),
          login,
          phone: v.phone.trim() || null,
          email: v.email.trim().toLowerCase() || null,
          password: v.password || undefined,
          // Guruh tanlanmagan bo'lsa — null (guruhsiz), aks holda yangi guruh
          groupId: v.groupId ? v.groupId : null,
        });
        toast("O‘quvchi ma’lumotlari saqlandi");
        onSaved();
      } else {
        const created = await createAccount({
          fullName: v.fullName.trim(),
          login,
          email: v.email.trim().toLowerCase() || undefined,
          phone: v.phone.trim() || undefined,
          password: v.password,
          role: "student",
          active: v.active,
        });
        // Guruh tanlangan bo'lsa — yaratilgandan keyin qo'shamiz
        if (v.groupId) {
          try {
            await setStudentGroup(created.id, v.groupId);
          } catch (e) {
            toast(
              `Akkaunt yaratildi, lekin guruhga qo‘shilmadi: ${uzError(e)}`,
              "error",
            );
          }
        }
        toast("O‘quvchi akkaunti yaratildi");
        onSaved({ login, password: v.password });
      }
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
      title={editing ? "O‘quvchi ma’lumotlari" : "Yangi o‘quvchi"}
      description={
        editing
          ? "Ma’lumotlarni o‘zgartiring va saqlang."
          : "O‘quvchi tizimga faqat login va parol bilan kiradi."
      }
      footer={
        <>
          <button className="btn-ghost" onClick={onClose} disabled={busy}>
            Bekor qilish
          </button>
          <button className="btn-primary" onClick={submit} disabled={busy}>
            <Save size={15} /> {busy ? "Saqlanmoqda..." : "Saqlash"}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <label className="label">Ism va familiya *</label>
          <input
            className="field"
            value={v.fullName}
            onChange={(e) => {
              const val = e.target.value;
              setV((s) => ({
                ...s,
                fullName: val,
                login: !loginTouched && !editing ? slugLogin(val) : s.login,
              }));
            }}
            placeholder="Aziz Karimov"
            autoFocus
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label">Login *</label>
            <input
              className="field font-mono"
              value={v.login}
              onChange={(e) => {
                setLoginTouched(true);
                set("login", e.target.value.toLowerCase().replace(/\s+/g, ""));
              }}
              placeholder="aziz.karimov"
              autoComplete="off"
            />
            <p className="mt-1 text-[11px] text-ink/40">
              Tizimga kirish uchun asosiy identifikator. Unikal bo‘lishi shart.
            </p>
          </div>
          <div>
            <label className="label">Telefon</label>
            <input
              className="field"
              value={v.phone}
              onChange={(e) => set("phone", e.target.value)}
              placeholder="+998 90 000 00 00"
            />
          </div>
        </div>

        <div>
          <label className="label">Email (ixtiyoriy)</label>
          <input
            className="field"
            value={v.email}
            onChange={(e) => set("email", e.target.value)}
            placeholder="aziz@gmail.com"
            type="email"
          />
          <p className="mt-1 text-[11px] text-ink/40">
            Bo‘sh qoldirsangiz ham o‘quvchi login va parol bilan tizimga kiradi.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label">
              {editing ? "Yangi parol (ixtiyoriy)" : "Parol *"}
            </label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <input
                  className="field pr-10 font-mono"
                  type={showPwd ? "text" : "password"}
                  value={v.password}
                  onChange={(e) => set("password", e.target.value)}
                  placeholder={editing ? "O‘zgartirilmaydi" : "Avtomatik"}
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPwd((s) => !s)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-ink/35 hover:bg-ink/5"
                  aria-label={
                    showPwd ? "Parolni yashirish" : "Parolni ko‘rsatish"
                  }
                >
                  {showPwd ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
              <button
                type="button"
                className="btn-secondary shrink-0 !px-3"
                onClick={() => {
                  set("password", randomPassword());
                  setShowPwd(true);
                }}
                title="Yangi parol generatsiya qilish"
              >
                <KeyRound size={15} />
              </button>
            </div>
          </div>

          {groups.length > 0 && (
            <div>
              <label className="label">Guruh</label>
              <select
                className="field"
                value={v.groupId}
                onChange={(e) => set("groupId", e.target.value)}
              >
                <option value="">
                  {editing ? "Guruhsiz" : "Guruh tanlanmagan"}
                </option>
                {groups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {!editing && (
          <div className="rounded-2xl bg-forest-50 px-4 py-3 dark:bg-forest-800/15">
            <Switch
              checked={v.active}
              onChange={(x) => set("active", x)}
              label="Akkaunt darhol faol bo‘lsin"
            />
          </div>
        )}

        {error && <ErrorBox message={error} />}

        {editing && (
          <InfoBox tone="info">
            Parol faqat siz ko‘rsangiz. Saqlangandan keyin foydalanuvchi yangi
            parol bilan kirishi mumkin.
          </InfoBox>
        )}
      </div>
    </Modal>
  );
}
