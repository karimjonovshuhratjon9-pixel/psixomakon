import { useState } from "react";
import { Library, Search, Eye, Send } from "lucide-react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../context/AuthContext";
import { useQuery } from "../context/ToastProvider";
import {
  Badge,
  Card,
  EmptyState,
  ErrorBox,
  PageHeader,
  Spinner,
} from "../components/ui";
import { formatDate } from "../lib/api";
import type { Test } from "../types";
import { Link } from "react-router-dom";
import { AssignModal } from "./TestPreviewPage";

export function LibraryPage() {
  const { profile } = useAuth();
  const isAdmin = profile?.role === "admin";
  const [search, setSearch] = useState("");
  const [assignTestId, setAssignTestId] = useState<string | null>(null);

  const q = useQuery(async () => {
    const { data, error } = await supabase
      .from("tests")
      .select("*")
      .eq("scope", "library")
      .eq("is_active", true)
      .order("created_at", { ascending: false });
    return { data: data as Test[] | null, error };
  }, []);

  const list = (q.data ?? []).filter(
    (t) =>
      !search ||
      t.title.toLowerCase().includes(search.toLowerCase()) ||
      t.category.toLowerCase().includes(search.toLowerCase()),
  );
  const cats = Array.from(new Set(list.map((t) => t.category)));

  return (
    <div>
      <PageHeader
        title="Test kutubxonasi"
        subtitle={
          isAdmin
            ? "Umumiy kutubxona testlari. Yangi testlarni «Mening testlarim» bo‘limidan qo‘shing."
            : "Tayyor testlarni tanlab, o‘quvchingizga yoki guruhga tayinlang."
        }
        actions={
          isAdmin ? (
            <Link to="/app/tests/new" className="btn-primary">
              Kutubxonaga test qo‘shish
            </Link>
          ) : null
        }
      />

      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-xs">
          <Search
            size={16}
            className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink/30"
          />
          <input
            className="field !py-2 !pl-9"
            placeholder="Qidirish..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {cats.map((c) => (
            <Badge key={c} tone="sage">
              {c}
            </Badge>
          ))}
        </div>
      </div>

      {q.loading ? (
        <Spinner />
      ) : q.error ? (
        <ErrorBox message={q.error} />
      ) : list.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Library size={24} />}
            title="Kutubxona bo‘sh"
            description={
              isAdmin
                ? "supabase/seed.sql faylini ishga tushiring yoki birinchi kutubxona testini yarating."
                : "Administrator hali umumiy testlar qo‘shmagan."
            }
          />
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {list.map((t) => (
            <Card
              key={t.id}
              className="flex animate-fade-up flex-col p-5 transition hover:-translate-y-0.5 hover:shadow-lift"
            >
              <div className="flex flex-wrap items-center gap-1.5">
                <Badge tone={t.kind === "psych" ? "forest" : "sky"}>
                  {t.kind === "psych" ? "Psixologik" : "Standart"}
                </Badge>
                <Badge tone="slate">{t.category}</Badge>
              </div>
              <h3 className="mt-3 line-clamp-2 font-semibold leading-snug text-forest-950">
                {t.title}
              </h3>
              <p className="mt-1 line-clamp-2 min-h-[34px] text-[12.5px] leading-relaxed text-ink/50">
                {t.description || "Tavsifsiz"}
              </p>
              <div className="mt-3 flex items-center gap-2 text-[11px] text-ink/35">
                <span>
                  {t.min_age ?? "—"}–{t.max_age ?? "—"} yosh
                </span>
                <span>·</span>
                <span>
                  {t.time_limit_sec
                    ? `${Math.round(t.time_limit_sec / 60)} daq`
                    : "Vaqtsiz"}
                </span>
                <span>·</span>
                <span>{formatDate(t.created_at)}</span>
              </div>
              <div className="mt-4 flex gap-2 border-t border-ink/5 pt-3">
                <Link
                  to={`/app/tests/${t.id}`}
                  className="btn-secondary flex-1 !py-2 !text-[12.5px]"
                >
                  <Eye size={14} /> Ko‘rish
                </Link>
                <button
                  className="btn-primary flex-1 !py-2 !text-[12.5px]"
                  onClick={() => setAssignTestId(t.id)}
                >
                  <Send size={14} /> Tayinlash
                </button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {assignTestId && (
        <AssignModal
          open
          onClose={() => setAssignTestId(null)}
          testId={assignTestId}
        />
      )}
    </div>
  );
}
