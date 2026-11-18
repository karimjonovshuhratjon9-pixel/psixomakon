import { useState } from "react";
import { Link } from "react-router-dom";
import {
  ClipboardList,
  Plus,
  Search,
  Eye,
  Pencil,
  Trash2,
  Library,
  Lock,
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
  Modal,
  PageHeader,
  Spinner,
} from "../components/ui";
import { formatDate } from "../lib/api";
import type { Test } from "../types";

export function TestCard({ t, onDelete }: { t: Test; onDelete?: () => void }) {
  return (
    <Card className="group flex animate-fade-up flex-col p-5 transition hover:-translate-y-0.5 hover:shadow-lift">
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge tone={t.kind === "psych" ? "forest" : "sky"}>
            {t.kind === "psych" ? "Psixologik" : "Standart"}
          </Badge>
          <Badge tone="slate">{t.category}</Badge>
          {t.scope === "library" && (
            <Badge tone="sage">
              <Library size={11} /> Kutubxona
            </Badge>
          )}
        </div>
        {t.time_limit_sec ? (
          <span className="shrink-0 text-[11px] font-semibold text-ink/40">
            {Math.round(t.time_limit_sec / 60)} daq
          </span>
        ) : (
          <span className="shrink-0 text-[11px] font-semibold text-ink/30">
            Vaqtsiz
          </span>
        )}
      </div>
      <h3 className="mt-3 line-clamp-2 font-semibold leading-snug text-forest-950">
        {t.title}
      </h3>
      <p className="mt-1 line-clamp-2 min-h-[34px] text-[12.5px] leading-relaxed text-ink/50">
        {t.description || "Tavsif kiritilmagan"}
      </p>
      <div className="mt-3 flex items-center gap-2 text-[11px] text-ink/35">
        <span>
          {t.min_age ?? "—"}–{t.max_age ?? "—"} yosh
        </span>
        <span>·</span>
        <span>{formatDate(t.created_at)}</span>
      </div>
      <div className="mt-4 flex items-center gap-2 border-t border-ink/5 pt-3">
        <Link
          to={`/app/tests/${t.id}`}
          className="btn-secondary flex-1 !py-2 !text-[12.5px]"
        >
          <Eye size={14} /> Ko‘rish
        </Link>
        <Link
          to={`/app/tests/${t.id}/edit`}
          className="btn-secondary !px-3 !py-2"
        >
          <Pencil size={14} />
        </Link>
        {onDelete && (
          <button
            className="btn-danger !px-3 !py-2"
            onClick={onDelete}
            title="O‘chirish"
          >
            <Trash2 size={14} />
          </button>
        )}
      </div>
    </Card>
  );
}

export function TestsPage() {
  const { profile } = useAuth();
  const toast = useToast();
  const [search, setSearch] = useState("");
  const [del, setDel] = useState<Test | null>(null);
  const isAdmin = profile?.role === "admin";

  const q = useQuery(async () => {
    if (!profile) return { data: null };
    let query = supabase
      .from("tests")
      .select("*")
      .order("created_at", { ascending: false });
    if (!isAdmin) query = query.eq("owner_id", profile.id);
    const { data, error } = await query;
    return { data: data as Test[] | null, error };
  }, [profile?.id, isAdmin]);

  const list = (q.data ?? []).filter(
    (t) =>
      !search ||
      t.title.toLowerCase().includes(search.toLowerCase()) ||
      t.category.toLowerCase().includes(search.toLowerCase()),
  );

  async function doDelete() {
    if (!del) return;
    const { error } = await supabase.from("tests").delete().eq("id", del.id);
    if (error) return toast(uzError(error), "error");
    toast("Test o‘chirildi");
    setDel(null);
    q.reload();
  }

  return (
    <div>
      <PageHeader
        title={isAdmin ? "Test boshqaruvi" : "Mening testlarim"}
        subtitle={
          isAdmin
            ? "Kutubxona testlarini yarating va tahrirlang. Shaxsiy testlar psixologlar tomonidan boshqariladi."
            : "Siz yaratgan shaxsiy testlar. Kutubxonadan tanlash uchun «Test kutubxonasi» bo‘limiga o‘ting."
        }
        actions={
          <Link to="/app/tests/new" className="btn-primary">
            <Plus size={16} /> Yangi test
          </Link>
        }
      />

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-xs">
          <Search
            size={16}
            className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink/30"
          />
          <input
            className="field !py-2 !pl-9"
            placeholder="Test nomi yoki kategoriya"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <p className="text-xs text-ink/45">Jami: {q.data?.length ?? 0}</p>
      </div>

      {q.loading ? (
        <Spinner />
      ) : q.error ? (
        <ErrorBox message={q.error} />
      ) : list.length === 0 ? (
        <Card>
          <EmptyState
            icon={<ClipboardList size={24} />}
            title="Testlar yo‘q"
            description={
              isAdmin
                ? "Kutubxonaga birinchi testni qo‘shing."
                : "Birinchi shaxsiy testingizni yarating."
            }
            action={
              <Link to="/app/tests/new" className="btn-primary">
                <Plus size={16} /> Yangi test
              </Link>
            }
          />
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {list.map((t) => (
            <TestCard key={t.id} t={t} onDelete={() => setDel(t)} />
          ))}
        </div>
      )}

      {!isAdmin && (
        <Card className="mt-6 flex flex-col items-start gap-3 bg-solid-dark-2 p-5 text-white sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <Lock size={18} className="mt-0.5 text-sage-200" />
            <div>
              <p className="text-sm font-semibold">
                Kutubxonadan test tanlaysizmi?
              </p>
              <p className="text-[12.5px] text-white/55">
                Tayyor testlarni ko‘ring va o‘quvchilarga tayinlang.
              </p>
            </div>
          </div>
          <Link to="/app/library" className="btn-secondary shrink-0">
            <Library size={15} /> Kutubxona
          </Link>
        </Card>
      )}

      <Modal
        open={!!del}
        onClose={() => setDel(null)}
        title="Testni o‘chirish"
        description={del?.title}
      >
        <p className="text-sm text-ink/60">
          Test o‘chirilganda unga bog‘langan savollar, tayinlashlar va natijalar
          ham o‘chadi. Bu amalni qaytarib bo‘lmaydi.
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <button className="btn-ghost" onClick={() => setDel(null)}>
            Bekor qilish
          </button>
          <button className="btn-danger" onClick={doDelete}>
            <Trash2 size={15} /> O‘chirish
          </button>
        </div>
      </Modal>
    </div>
  );
}
