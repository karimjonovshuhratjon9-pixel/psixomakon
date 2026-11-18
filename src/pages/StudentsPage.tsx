import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowDown,
  ArrowUp,
  ChevronLeft,
  ChevronRight,
  Copy,
  KeyRound,
  Lock,
  Mail,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  Trash2,
  Unlock,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/toastCtx";
import { useQuery } from "../context/ToastProvider";
import { randomPassword, validateLogin } from "../lib/accounts";
import { deleteAccount, resetPassword, setBlocked } from "../lib/createAccount";
import { uzError } from "../lib/errors";
import {
  Badge,
  Card,
  ConfirmDialog,
  Dropdown,
  EmptyState,
  ErrorBox,
  InfoBox,
  MenuItem,
  Modal,
  PageHeader,
  Segmented,
  TableSkeleton,
  cn,
} from "../components/ui";
import { formatDate, initials } from "../lib/api";
import type { Group, Profile } from "../types";
import { StudentForm } from "./students/StudentForm";

interface StudentRow extends Profile {
  group_members?: {
    group_id: string;
    groups: { name: string } | { name: string }[] | null;
  }[];
}

function groupOf(s: StudentRow): { id: string; name: string } | null {
  const m = s.group_members?.[0];
  if (!m) return null;
  const g = m.groups;
  const name = Array.isArray(g) ? g[0]?.name : g?.name;
  return name ? { id: m.group_id, name } : null;
}

type StatusFilter = "all" | "active" | "blocked";
type SortKey = "full_name" | "login" | "created_at" | "status";

const PAGE_SIZE = 10;

export function StudentsPage() {
  const { profile } = useAuth();
  const toast = useToast();
  const isAdmin = profile?.role === "admin";

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [groupFilter, setGroupFilter] = useState("");
  const [sort, setSort] = useState<SortKey>("created_at");
  const [asc, setAsc] = useState(false);
  const [page, setPage] = useState(1);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Profile | null>(null);

  const [selected, setSelected] = useState<Set<string>>(new Set());

  const [credentials, setCredentials] = useState<{
    name: string;
    login: string;
    password: string;
    email?: string | null;
  } | null>(null);

  const [resetTarget, setResetTarget] = useState<StudentRow | null>(null);
  const [newPwd, setNewPwd] = useState("");
  const [delTarget, setDelTarget] = useState<StudentRow | null>(null);
  const [detail, setDetail] = useState<StudentRow | null>(null);
  const [busy, setBusy] = useState(false);

  /* --------------------------- ma'lumot ---------------------------- */
  const q = useQuery(async () => {
    const { data, error } = await supabase
      .from("profiles")
      .select("*, group_members(group_id, groups(name))")
      .eq("role", "student")
      .order("created_at", { ascending: false });
    return { data: data as StudentRow[] | null, error };
  }, [profile?.id]);

  const groupsQ = useQuery(async () => {
    const { data, error } = await supabase
      .from("groups")
      .select("*")
      .order("name");
    return { data: data as Group[] | null, error };
  }, [profile?.id]);

  const all = q.data ?? [];

  /* --------------------------- filter/sort -------------------------- */
  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    let rows = all.filter((r) => {
      if (s) {
        const hay = `${r.full_name} ${r.login ?? ""} ${r.email ?? ""} ${
          r.phone ?? ""
        }`.toLowerCase();
        if (!hay.includes(s)) return false;
      }
      if (status === "active" && r.is_blocked) return false;
      if (status === "blocked" && !r.is_blocked) return false;
      if (groupFilter) {
        const g = groupOf(r);
        if (groupFilter === "__none__" ? Boolean(g) : g?.id !== groupFilter)
          return false;
      }
      return true;
    });

    rows = [...rows].sort((a, b) => {
      let cmp = 0;
      if (sort === "full_name") cmp = a.full_name.localeCompare(b.full_name);
      else if (sort === "login")
        cmp = (a.login ?? "").localeCompare(b.login ?? "");
      else if (sort === "status")
        cmp = Number(a.is_blocked) - Number(b.is_blocked);
      else cmp = a.created_at.localeCompare(b.created_at);
      return asc ? cmp : -cmp;
    });
    return rows;
  }, [all, search, status, groupFilter, sort, asc]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageRows = filtered.slice(
    (safePage - 1) * PAGE_SIZE,
    safePage * PAGE_SIZE,
  );

  const activeCount = all.filter((s) => !s.is_blocked).length;
  const blockedCount = all.length - activeCount;

  function toggleSort(k: SortKey) {
    if (sort === k) setAsc((a) => !a);
    else {
      setSort(k);
      setAsc(k === "full_name" || k === "login");
    }
  }

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  function toggleAllOnPage() {
    setSelected((prev) => {
      const n = new Set(prev);
      const ids = pageRows.map((r) => r.id);
      const allSelected = ids.every((id) => n.has(id));
      ids.forEach((id) => (allSelected ? n.delete(id) : n.add(id)));
      return n;
    });
  }

  /* ------------------------------ amallar --------------------------- */
  async function toggleBlock(s: StudentRow) {
    if (!isAdmin) {
      toast("Bloklash faqat administratorga ruxsat etilgan", "error");
      return;
    }
    try {
      await setBlocked(s.id, !s.is_blocked);
      toast(
        s.is_blocked
          ? "Akkaunt faollashtirildi"
          : "Akkaunt bloklandi — foydalanuvchi tizimdan chiqarildi",
      );
      q.reload();
    } catch (e) {
      toast(uzError(e), "error");
    }
  }

  async function bulkBlock(block: boolean) {
    const ids = [...selected].filter((id) => {
      const row = all.find((r) => r.id === id);
      return !row || row.is_blocked !== block;
    });
    if (!ids.length) return;
    setBusy(true);
    let ok = 0;
    for (const id of ids) {
      try {
        await setBlocked(id, block);
        ok++;
      } catch {
        /* keyingi */
      }
    }
    setBusy(false);
    setSelected(new Set());
    q.reload();
    toast(
      ok === ids.length
        ? `${ok} ta akkaunt ${block ? "bloklandi" : "faollashtirildi"}`
        : `${ok}/${ids.length} ta akkaunt yangilandi (ba'zilarida xato)`,
      ok === ids.length ? "success" : "error",
    );
  }

  async function saveReset() {
    if (!resetTarget) return;
    const err = validateLogin(resetTarget.login ?? "");
    void err; // login tekshiruvi alohida
    setBusy(true);
    try {
      await resetPassword(resetTarget.id, newPwd);
      setCredentials({
        name: resetTarget.full_name,
        login: resetTarget.login ?? "",
        password: newPwd,
        email: resetTarget.email,
      });
      setResetTarget(null);
      setNewPwd("");
      toast("Parol yangilandi");
    } catch (e) {
      toast(uzError(e), "error");
    } finally {
      setBusy(false);
    }
  }

  async function saveDeleted() {
    if (!delTarget) return;
    setBusy(true);
    try {
      await deleteAccount(delTarget.id);
      toast("O‘quvchi o‘chirildi (arxivlandi)");
      setDelTarget(null);
      q.reload();
    } catch (e) {
      toast(uzError(e), "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <PageHeader
        eyebrow={isAdmin ? "Administrator" : "Psixolog"}
        title="O‘quvchilar"
        subtitle={
          isAdmin
            ? "Barcha o‘quvchilar. Yaratish, tahrirlash, parolni yangilash va o‘chirish."
            : "Siz yaratgan va guruhlaringizdagi o‘quvchilar."
        }
        actions={
          <button
            className="btn-primary"
            onClick={() => {
              setEditing(null);
              setFormOpen(true);
            }}
          >
            <Plus size={16} /> Yangi o‘quvchi
          </button>
        }
      />

      {/* Akkaunt roli to'liq emas — o'quvchi qo'shishda 403 bo'ladi */}
      {profile && (profile.role === "student" || profile.is_blocked) && (
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-amber-50 px-4 py-3 text-[13px] text-amber-800 ring-1 ring-amber-200 dark:bg-amber-400/10 dark:text-amber-200 dark:ring-amber-400/25">
          <span>
            Sizning akkauntingiz <b>{profile.role}</b> rolida
            {profile.is_blocked ? " va bloklangan" : ""} — shu sababli o‘quvchi
            qo‘shishga ruxsat berilmaydi.
          </span>
          <Link to="/app/settings" className="btn-secondary !px-3 !py-1.5">
            Akkauntimni tuzatish
          </Link>
        </div>
      )}

      {/* Statistika */}
      <div className="mb-5 grid gap-3 sm:grid-cols-3">
        {[
          { l: "Jami", v: all.length, tone: "text-forest-950" },
          { l: "Faol", v: activeCount, tone: "text-forest-600" },
          { l: "Bloklangan", v: blockedCount, tone: "text-rose-500" },
        ].map((s) => (
          <Card
            key={s.l}
            className="flex items-center justify-between px-5 py-3.5"
          >
            <span className="text-[12.5px] font-semibold text-ink/50">
              {s.l}
            </span>
            <span className={cn("font-display text-xl", s.tone)}>{s.v}</span>
          </Card>
        ))}
      </div>

      <Card className="overflow-hidden">
        {/* Toolbar */}
        <div className="flex flex-col gap-3 border-b border-ink/5 px-4 py-4 sm:px-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative w-full sm:max-w-xs">
              <Search
                size={16}
                className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink/30"
              />
              <input
                className="field !py-2 !pl-9"
                placeholder="Ism, login, email yoki telefon"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
              />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Segmented
                value={status}
                onChange={(v) => {
                  setStatus(v);
                  setPage(1);
                }}
                options={[
                  { value: "all", label: `Barchasi (${all.length})` },
                  { value: "active", label: "Faol" },
                  { value: "blocked", label: "Bloklangan" },
                ]}
              />
              {groupsQ.data && groupsQ.data.length > 0 && (
                <select
                  className="field !w-auto !py-2 !text-[12.5px]"
                  value={groupFilter}
                  onChange={(e) => {
                    setGroupFilter(e.target.value);
                    setPage(1);
                  }}
                >
                  <option value="">Barcha guruhlar</option>
                  {groupsQ.data.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name}
                    </option>
                  ))}
                  <option value="__none__">Guruhsiz</option>
                </select>
              )}
            </div>
          </div>

          {selected.size > 0 && (
            <div className="flex flex-wrap items-center gap-2 rounded-2xl bg-forest-50 px-3 py-2 dark:bg-forest-800/15">
              <span className="text-[12.5px] font-semibold text-forest-900 dark:text-forest-200">
                {selected.size} ta tanlandi
              </span>
              <div className="ml-auto flex gap-2">
                <button
                  className="btn-secondary !py-1.5 !text-[12px]"
                  onClick={() => bulkBlock(false)}
                  disabled={busy}
                >
                  <Unlock size={13} /> Faollashtirish
                </button>
                {isAdmin && (
                  <button
                    className="btn-danger !py-1.5 !text-[12px]"
                    onClick={() => bulkBlock(true)}
                    disabled={busy}
                  >
                    <Lock size={13} /> Bloklash
                  </button>
                )}
                <button
                  className="btn-ghost !py-1.5 !text-[12px]"
                  onClick={() => setSelected(new Set())}
                >
                  <X size={13} /> Bekor
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Jadval */}
        {q.loading ? (
          <TableSkeleton rows={6} cols={5} />
        ) : q.error ? (
          <div className="p-5">
            <ErrorBox message={q.error} />
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={<Users size={24} />}
            title={all.length ? "Mos o‘quvchi topilmadi" : "O‘quvchilar yo‘q"}
            description={
              all.length
                ? "Qidiruv yoki filtrlarni o‘zgartirib ko‘ring."
                : "Birinchi o‘quvchi akkauntini yarating — login va parol bilan kirishadi."
            }
            action={
              all.length ? (
                <button
                  className="btn-secondary"
                  onClick={() => {
                    setSearch("");
                    setStatus("all");
                    setGroupFilter("");
                  }}
                >
                  Filtrlarni tozalash
                </button>
              ) : (
                <button
                  className="btn-primary"
                  onClick={() => {
                    setEditing(null);
                    setFormOpen(true);
                  }}
                >
                  <UserPlus size={15} /> Yangi o‘quvchi
                </button>
              )
            }
          />
        ) : (
          <>
            {/* Desktop jadval */}
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full min-w-[860px]">
                <thead className="bg-surface2/70">
                  <tr>
                    <th className="w-10 px-4 py-3">
                      <input
                        type="checkbox"
                        className="h-4 w-4 accent-forest-700"
                        checked={
                          pageRows.length > 0 &&
                          pageRows.every((r) => selected.has(r.id))
                        }
                        onChange={toggleAllOnPage}
                        aria-label="Sahifadagi barchasini tanlash"
                      />
                    </th>
                    <SortHead
                      label="O‘quvchi"
                      k="full_name"
                      cur={sort}
                      asc={asc}
                      onClick={toggleSort}
                    />
                    <SortHead
                      label="Login"
                      k="login"
                      cur={sort}
                      asc={asc}
                      onClick={toggleSort}
                    />
                    <th className="table-head">Guruh</th>
                    <SortHead
                      label="Holat"
                      k="status"
                      cur={sort}
                      asc={asc}
                      onClick={toggleSort}
                    />
                    <SortHead
                      label="Yaratilgan"
                      k="created_at"
                      cur={sort}
                      asc={asc}
                      onClick={toggleSort}
                    />
                    <th className="table-head text-right">Amallar</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink/5">
                  {pageRows.map((s) => {
                    const g = groupOf(s);
                    return (
                      <tr
                        key={s.id}
                        className={cn(
                          "transition hover:bg-forest-50/40 dark:hover:bg-forest-800/10",
                          selected.has(s.id) &&
                            "bg-forest-50/60 dark:bg-forest-800/15",
                        )}
                      >
                        <td className="px-4 py-3">
                          <input
                            type="checkbox"
                            className="h-4 w-4 accent-forest-700"
                            checked={selected.has(s.id)}
                            onChange={() => toggleSelect(s.id)}
                            aria-label={`${s.full_name} ni tanlash`}
                          />
                        </td>
                        <td className="table-cell">
                          <button
                            className="flex items-center gap-3 text-left"
                            onClick={() => setDetail(s)}
                          >
                            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-sage-100 text-[11.5px] font-bold text-forest-800 dark:bg-sage-200/30 dark:text-forest-100">
                              {initials(s.full_name)}
                            </span>
                            <span className="min-w-0">
                              <span className="block truncate font-semibold text-ink/85">
                                {s.full_name}
                              </span>
                              <span className="block truncate text-[11.5px] text-ink/40">
                                {s.email || s.phone || "—"}
                              </span>
                            </span>
                          </button>
                        </td>
                        <td className="table-cell font-mono text-[12.5px]">
                          {s.login || "—"}
                        </td>
                        <td className="table-cell text-[12.5px] text-ink/60">
                          {g?.name ?? "—"}
                        </td>
                        <td className="table-cell">
                          {s.is_blocked ? (
                            <Badge tone="rose" dot>
                              Bloklangan
                            </Badge>
                          ) : (
                            <Badge tone="sage" dot>
                              Faol
                            </Badge>
                          )}
                        </td>
                        <td className="table-cell text-[12.5px] text-ink/50">
                          {formatDate(s.created_at)}
                        </td>
                        <td className="table-cell">
                          <div className="flex justify-end gap-1">
                            <button
                              className="btn-icon"
                              title="Tahrirlash"
                              onClick={() => {
                                setEditing(s);
                                setFormOpen(true);
                              }}
                            >
                              <Pencil size={15} />
                            </button>
                            <RowMenu
                              s={s}
                              isAdmin={isAdmin}
                              onReset={() => {
                                setResetTarget(s);
                                setNewPwd(randomPassword());
                              }}
                              onBlock={() => toggleBlock(s)}
                              onDelete={() => setDelTarget(s)}
                              onDetail={() => setDetail(s)}
                            />
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobil kartalar */}
            <ul className="divide-y divide-ink/5 md:hidden">
              {pageRows.map((s) => {
                const g = groupOf(s);
                return (
                  <li key={s.id} className="px-4 py-3.5">
                    <div className="flex items-start gap-3">
                      <input
                        type="checkbox"
                        className="mt-1 h-4 w-4 shrink-0 accent-forest-700"
                        checked={selected.has(s.id)}
                        onChange={() => toggleSelect(s.id)}
                        aria-label={`${s.full_name} ni tanlash`}
                      />
                      <button
                        className="flex min-w-0 flex-1 items-start gap-3 text-left"
                        onClick={() => setDetail(s)}
                      >
                        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-sage-100 text-[12px] font-bold text-forest-800 dark:bg-sage-200/30 dark:text-forest-100">
                          {initials(s.full_name)}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-semibold text-ink/85">
                            {s.full_name}
                          </span>
                          <span className="block truncate font-mono text-[11.5px] text-ink/45">
                            {s.login || "—"}
                          </span>
                          <span className="mt-1.5 flex flex-wrap items-center gap-1.5">
                            {s.is_blocked ? (
                              <Badge tone="rose">Bloklangan</Badge>
                            ) : (
                              <Badge tone="sage">Faol</Badge>
                            )}
                            {g && <Badge tone="slate">{g.name}</Badge>}
                          </span>
                        </span>
                      </button>
                      <RowMenu
                        s={s}
                        isAdmin={isAdmin}
                        onReset={() => {
                          setResetTarget(s);
                          setNewPwd(randomPassword());
                        }}
                        onBlock={() => toggleBlock(s)}
                        onDelete={() => setDelTarget(s)}
                        onDetail={() => setDetail(s)}
                        onEdit={() => {
                          setEditing(s);
                          setFormOpen(true);
                        }}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-ink/5 px-5 py-3">
                <p className="text-[12px] text-ink/45">
                  {(safePage - 1) * PAGE_SIZE + 1}–
                  {Math.min(safePage * PAGE_SIZE, filtered.length)} /{" "}
                  {filtered.length}
                </p>
                <div className="flex items-center gap-1">
                  <button
                    className="btn-icon disabled:opacity-30"
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={safePage === 1}
                    aria-label="Oldingi sahifa"
                  >
                    <ChevronLeft size={16} />
                  </button>
                  {Array.from({ length: totalPages }).map((_, i) => {
                    const n = i + 1;
                    // ko'p sahifa bo'lsa faqat atrofdagilarni ko'rsatamiz
                    if (
                      totalPages > 7 &&
                      n !== 1 &&
                      n !== totalPages &&
                      Math.abs(n - safePage) > 1
                    ) {
                      if (n === 2 || n === totalPages - 1)
                        return (
                          <span key={n} className="px-1 text-ink/30">
                            …
                          </span>
                        );
                      return null;
                    }
                    return (
                      <button
                        key={n}
                        onClick={() => setPage(n)}
                        className={cn(
                          "h-8 min-w-8 rounded-lg px-2 text-[12.5px] font-semibold transition",
                          n === safePage
                            ? "bg-forest-800 text-white dark:text-forest-50"
                            : "text-ink/55 hover:bg-ink/5",
                        )}
                      >
                        {n}
                      </button>
                    );
                  })}
                  <button
                    className="btn-icon disabled:opacity-30"
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={safePage === totalPages}
                    aria-label="Keyingi sahifa"
                  >
                    <ChevronRight size={16} />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </Card>

      {/* ------------------------------ Modallar ------------------------------ */}
      <StudentForm
        open={formOpen}
        editing={editing}
        groups={groupsQ.data ?? []}
        onClose={() => setFormOpen(false)}
        onSaved={(info) => {
          setFormOpen(false);
          q.reload();
          if (info) {
            setCredentials({
              name: editing?.full_name ?? "",
              login: info.login,
              password: info.password,
            });
          }
        }}
        currentGroupId={editing ? groupOf(editing as StudentRow)?.id : undefined}
      />

      {/* Yaratilgan / yangilangan parol */}
      <Modal
        open={!!credentials}
        onClose={() => setCredentials(null)}
        title="Kirish ma’lumotlari"
        description="Bu ma’lumotlar faqat bir marta ko‘rsatiladi — nusxalab oling."
      >
        {credentials && (
          <div className="space-y-4">
            <div className="rounded-2xl bg-forest-50 p-4 dark:bg-forest-800/15">
              <Field label="Login" value={credentials.login} />
              <Field label="Parol" value={credentials.password} mono />
              {credentials.email && (
                <Field label="Email (qo‘shimcha)" value={credentials.email} />
              )}
            </div>
            <InfoBox tone="info">
              O‘quvchi <b>login</b> va <b>parol</b> bilan kiradi. Email talab
              qilinmaydi. Parolni yopgandan so‘ng qayta ko‘ra olmaysiz.
            </InfoBox>
            <button
              className="btn-primary w-full"
              onClick={() => {
                const text =
                  `Login: ${credentials.login}\nParol: ${credentials.password}` +
                  (credentials.email ? `\nEmail: ${credentials.email}` : "");
                navigator.clipboard.writeText(text).catch(() => {});
                toast("Nusxa olindi");
              }}
            >
              <Copy size={15} /> Nusxalash
            </button>
          </div>
        )}
      </Modal>

      {/* Parolni tiklash */}
      <Modal
        open={!!resetTarget}
        onClose={() => setResetTarget(null)}
        title="Parolni yangilash"
        description={
          resetTarget ? `${resetTarget.full_name} uchun yangi parol` : undefined
        }
        footer={
          <>
            <button
              className="btn-ghost"
              onClick={() => setResetTarget(null)}
              disabled={busy}
            >
              Bekor qilish
            </button>
            <button
              className="btn-primary"
              onClick={saveReset}
              disabled={busy || newPwd.length < 6}
            >
              <KeyRound size={15} />{" "}
              {busy ? "Saqlanmoqda..." : "Parolni yangilash"}
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="label">Yangi parol</label>
            <div className="flex gap-2">
              <input
                className="field font-mono"
                value={newPwd}
                onChange={(e) => setNewPwd(e.target.value)}
                autoFocus
              />
              <button
                className="btn-secondary shrink-0 !px-3"
                onClick={() => setNewPwd(randomPassword())}
                type="button"
              >
                <KeyRound size={15} />
              </button>
            </div>
            {newPwd.length > 0 && newPwd.length < 6 && (
              <p className="mt-1 text-[11.5px] text-rose-500">
                Kamida 6 belgi kerak
              </p>
            )}
          </div>
          <InfoBox tone="warn">
            Parol serverda <b>haqiqatan</b> o‘zgartiriladi (Supabase Admin API).
            Foydalanuvchi mavjud sessiyalari saqlanib qoladi. Yangi parol bir
            marta ko‘rsatiladi.
          </InfoBox>
        </div>
      </Modal>

      {/* O'chirish */}
      <ConfirmDialog
        open={!!delTarget}
        onClose={() => setDelTarget(null)}
        onConfirm={saveDeleted}
        busy={busy}
        danger
        title="O‘quvchini o‘chirish"
        confirmLabel="Butunlay o‘chirish"
        body={
          delTarget ? (
            <div className="space-y-3">
              <p>
                <b>{delTarget.full_name}</b> ({delTarget.login}) butunlay
                o‘chiriladi.
              </p>
              <div className="rounded-xl bg-rose-50 px-3 py-2.5 text-[12.5px] text-rose-700 ring-1 ring-rose-100 dark:bg-rose-500/10 dark:text-rose-200 dark:ring-rose-500/25">
                <b>Oqibatlar:</b>
                <ul className="mt-1 list-disc space-y-0.5 pl-4">
                  <li>barcha tayinlashlar va javoblar o‘chadi;</li>
                  <li>topshirilgan barcha natijalar yo‘qoladi;</li>
                  <li>kirish huquqi darhol bekor qilinadi.</li>
                </ul>
              </div>
              <p className="text-[12px] text-ink/50">
                Profil nusxasi audit uchun arxivlanadi. Agar natijalarni saqlab
                qolish kerak bo‘lsa — <b>bloklang</b>, o‘chirmang.
              </p>
            </div>
          ) : (
            ""
          )
        }
      />

      {/* Profil kartasi */}
      <Modal
        open={!!detail}
        onClose={() => setDetail(null)}
        title={detail?.full_name ?? ""}
        description={detail?.login ? `@${detail.login}` : undefined}
        footer={
          detail ? (
            <>
              <button className="btn-secondary" onClick={() => setDetail(null)}>
                Yopish
              </button>
              <button
                className="btn-primary"
                onClick={() => {
                  setEditing(detail);
                  setDetail(null);
                  setFormOpen(true);
                }}
              >
                <Pencil size={15} /> Tahrirlash
              </button>
            </>
          ) : undefined
        }
      >
        {detail && (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <span className="grid h-14 w-14 place-items-center rounded-2xl bg-sage-100 text-base font-bold text-forest-800 dark:bg-sage-200/30 dark:text-forest-100">
                {initials(detail.full_name)}
              </span>
              <div>
                <p className="font-semibold text-forest-950">
                  {detail.full_name}
                </p>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {detail.is_blocked ? (
                    <Badge tone="rose">Bloklangan</Badge>
                  ) : (
                    <Badge tone="sage">Faol</Badge>
                  )}
                  <Badge tone="slate">O‘quvchi</Badge>
                </div>
              </div>
            </div>

            <div className="divide-y divide-ink/5 rounded-2xl bg-surface2/70 px-4">
              <DetailRow label="Login" value={detail.login || "—"} mono />
              <DetailRow
                label="Email"
                value={detail.email || "Kiritilmagan"}
                icon={<Mail size={13} />}
              />
              <DetailRow label="Telefon" value={detail.phone || "—"} />
              <DetailRow
                label="Guruh"
                value={groupOf(detail)?.name || "Guruhsiz"}
              />
              <DetailRow
                label="Yaratilgan"
                value={formatDate(detail.created_at)}
              />
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                className="btn-secondary !text-[12.5px]"
                onClick={() => {
                  setResetTarget(detail);
                  setNewPwd(randomPassword());
                }}
              >
                <KeyRound size={14} /> Parolni yangilash
              </button>
              <button
                className={cn(
                  isAdmin ? "btn-danger" : "btn-secondary",
                  "!text-[12.5px]",
                )}
                onClick={() => toggleBlock(detail)}
              >
                {detail.is_blocked ? (
                  <>
                    <Unlock size={14} /> Faollashtirish
                  </>
                ) : (
                  <>
                    <Lock size={14} /> Bloklash
                  </>
                )}
              </button>
              {isAdmin && (
                <button
                  className="btn-danger !text-[12.5px]"
                  onClick={() => setDelTarget(detail)}
                >
                  <Trash2 size={14} /> O‘chirish
                </button>
              )}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

/* ------------------------------- yordamchilar ---------------------------- */

function SortHead({
  label,
  k,
  cur,
  asc,
  onClick,
}: {
  label: string;
  k: SortKey;
  cur: SortKey;
  asc: boolean;
  onClick: (k: SortKey) => void;
}) {
  return (
    <th className="table-head">
      <button
        className="inline-flex items-center gap-1 hover:text-ink/70"
        onClick={() => onClick(k)}
      >
        {label}
        {cur === k ? (
          asc ? (
            <ArrowUp size={12} />
          ) : (
            <ArrowDown size={12} />
          )
        ) : null}
      </button>
    </th>
  );
}

function RowMenu({
  s,
  isAdmin,
  onReset,
  onBlock,
  onDelete,
  onDetail,
  onEdit,
}: {
  s: StudentRow;
  isAdmin: boolean;
  onReset: () => void;
  onBlock: () => void;
  onDelete: () => void;
  onDetail: () => void;
  onEdit?: () => void;
}) {
  return (
    <Dropdown
      trigger={() => (
        <span className="btn-icon" title="Ko‘proq amallar">
          <MoreHorizontal size={16} />
        </span>
      )}
    >
      {(close) => (
        <>
          <MenuItem
            icon={<Users size={14} />}
            onClick={() => (onDetail(), close())}
          >
            Profilni ko‘rish
          </MenuItem>
          {onEdit && (
            <MenuItem
              icon={<Pencil size={14} />}
              onClick={() => (onEdit(), close())}
            >
              Tahrirlash
            </MenuItem>
          )}
          <MenuItem
            icon={<KeyRound size={14} />}
            onClick={() => (onReset(), close())}
          >
            Parolni yangilash
          </MenuItem>
          <MenuItem
            icon={s.is_blocked ? <Unlock size={14} /> : <Lock size={14} />}
            onClick={() => (onBlock(), close())}
          >
            {s.is_blocked ? "Faollashtirish" : "Bloklash"}
          </MenuItem>
          {isAdmin && (
            <>
              <div className="my-1 h-px bg-ink/5" />
              <MenuItem
                danger
                icon={<Trash2 size={14} />}
                onClick={() => (onDelete(), close())}
              >
                O‘chirish
              </MenuItem>
            </>
          )}
        </>
      )}
    </Dropdown>
  );
}

function Field({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="py-1">
      <p className="text-[10.5px] font-bold uppercase tracking-wider text-forest-700 dark:text-forest-300">
        {label}
      </p>
      <p
        className={cn(
          "mt-0.5 text-[13.5px] text-forest-950",
          mono && "font-mono",
        )}
      >
        {value}
      </p>
    </div>
  );
}

function DetailRow({
  label,
  value,
  mono,
  icon,
}: {
  label: string;
  value: string;
  mono?: boolean;
  icon?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-2.5">
      <span className="flex items-center gap-1.5 text-[12px] text-ink/45">
        {icon}
        {label}
      </span>
      <span
        className={cn(
          "truncate text-right text-[12.5px] font-medium text-ink/80",
          mono && "font-mono",
        )}
      >
        {value}
      </span>
    </div>
  );
}

// eslint-disable-next-line @typescript-eslint/no-unused-expressions
void validateLogin;
