import { useEffect, useState, type ReactNode } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import {
  BarChart3,
  ChevronDown,
  ClipboardList,
  GraduationCap,
  LayoutDashboard,
  Library,
  LogOut,
  Menu,
  Settings,
  ShieldCheck,
  Sparkles,
  Users,
  UsersRound,
  UserCog,
  X,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import type { Role } from "../types";
import { cn } from "./ui";
import { initials } from "../lib/api";
import { ThemeToggle } from "./ThemeToggle";

interface NavItem {
  to: string;
  label: string;
  icon: ReactNode;
  roles: Role[];
  /** Guruh sarlavhasi */
  group: "asosiy" | "boshqaruv" | "tahlil";
}

const NAV: NavItem[] = [
  {
    to: "/app",
    label: "Bosh sahifa",
    icon: <LayoutDashboard size={18} />,
    roles: ["admin", "psychologist"],
    group: "asosiy",
  },
  {
    to: "/app/my-tests",
    label: "Mening testlarim",
    icon: <ClipboardList size={18} />,
    roles: ["student"],
    group: "asosiy",
  },
  {
    to: "/app/students",
    label: "O‘quvchilar",
    icon: <Users size={18} />,
    roles: ["admin", "psychologist"],
    group: "boshqaruv",
  },
  {
    to: "/app/groups",
    label: "Guruhlar",
    icon: <UsersRound size={18} />,
    roles: ["psychologist"],
    group: "boshqaruv",
  },
  {
    to: "/app/psychologists",
    label: "Psixologlar",
    icon: <UserCog size={18} />,
    roles: ["admin"],
    group: "boshqaruv",
  },
  {
    to: "/app/tests",
    label: "Testlar",
    icon: <ClipboardList size={18} />,
    roles: ["admin", "psychologist"],
    group: "tahlil",
  },
  {
    to: "/app/library",
    label: "Kutubxona",
    icon: <Library size={18} />,
    roles: ["admin", "psychologist"],
    group: "tahlil",
  },
  {
    to: "/app/assignments",
    label: "Tayinlashlar",
    icon: <Sparkles size={18} />,
    roles: ["admin", "psychologist"],
    group: "tahlil",
  },
  {
    to: "/app/results",
    label: "Natijalar",
    icon: <BarChart3 size={18} />,
    roles: ["admin", "psychologist"],
    group: "tahlil",
  },
];

const GROUP_LABEL: Record<NavItem["group"], string> = {
  asosiy: "Asosiy",
  boshqaruv: "Boshqaruv",
  tahlil: "Testlar va tahlil",
};

const ROLE_LABEL: Record<Role, string> = {
  admin: "Administrator",
  psychologist: "Psixolog",
  student: "O‘quvchi",
};

const roleIcon = (r: Role) =>
  r === "admin" ? (
    <ShieldCheck size={13} />
  ) : r === "psychologist" ? (
    <UserCog size={13} />
  ) : (
    <GraduationCap size={13} />
  );

function Items({ role, onNavigate }: { role: Role; onNavigate?: () => void }) {
  const items = NAV.filter((n) => n.roles.includes(role));
  const groups = ["asosiy", "boshqaruv", "tahlil"] as const;

  return (
    <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-2">
      {groups.map((g) => {
        const list = items.filter((i) => i.group === g);
        if (!list.length) return null;
        return (
          <div key={g}>
            <p className="mb-1.5 px-3 text-[10px] font-bold uppercase tracking-[0.14em] text-ink/35">
              {GROUP_LABEL[g]}
            </p>
            <div className="space-y-0.5">
              {list.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.to === "/app"}
                  onClick={onNavigate}
                  className={({ isActive }) =>
                    cn(
                      "group flex items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] font-semibold transition",
                      isActive
                        ? "bg-forest-800 text-white shadow-soft dark:text-forest-50"
                        : "text-ink/60 hover:bg-ink/5 hover:text-forest-950",
                    )
                  }
                >
                  {({ isActive }) => (
                    <>
                      <span
                        className={cn(
                          isActive
                            ? "text-white dark:text-forest-50"
                            : "text-ink/40 group-hover:text-forest-700",
                        )}
                      >
                        {item.icon}
                      </span>
                      {item.label}
                    </>
                  )}
                </NavLink>
              ))}
            </div>
          </div>
        );
      })}
    </nav>
  );
}

export function AppLayout({ children }: { children: ReactNode }) {
  const { profile, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const [menu, setMenu] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    setOpen(false);
    setMenu(false);
  }, [location.pathname]);

  if (!profile) return <>{children}</>;

  const sidebar = (
    <>
      <div className="flex h-16 shrink-0 items-center gap-2.5 px-5">
        <div className="grid h-9 w-9 place-items-center rounded-xl bg-forest-800 text-white dark:text-forest-50">
          <Sparkles size={18} />
        </div>
        <div className="min-w-0">
          <p className="font-display text-[17px] leading-none tracking-wide text-forest-950">
            PSIXOMAKON
          </p>
          <p className="mt-1 text-[9.5px] font-bold uppercase tracking-[0.16em] text-ink/40">
            psixologik platforma
          </p>
        </div>
      </div>

      <Items role={profile.role} onNavigate={() => setOpen(false)} />

      <div className="shrink-0 space-y-2 px-3 pb-4">
        <div className="rounded-2xl bg-forest-50/80 p-3.5 dark:bg-forest-800/15">
          <div className="flex items-center gap-2 text-forest-800 dark:text-forest-200">
            {roleIcon(profile.role)}
            <span className="text-[10.5px] font-bold uppercase tracking-wider">
              {ROLE_LABEL[profile.role]}
            </span>
          </div>
          <p className="mt-1.5 text-[11px] leading-relaxed text-ink/50">
            {profile.role === "student"
              ? "Sizga tayinlangan testlar va natijalar holati."
              : "Ma’lumotlar rolingizga mos ravishda himoyalangan."}
          </p>
        </div>
        <NavLink
          to="/app/settings"
          className={({ isActive }) =>
            cn(
              "flex items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] font-semibold transition",
              isActive
                ? "bg-forest-800 text-white"
                : "text-ink/60 hover:bg-ink/5 hover:text-forest-950",
            )
          }
        >
          <Settings size={18} className="opacity-70" /> Sozlamalar
        </NavLink>
      </div>
    </>
  );

  return (
    <div className="min-h-screen bg-cream">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[264px] flex-col border-r border-ink/5 bg-surface/80 backdrop-blur-xl lg:flex">
        {sidebar}
      </aside>

      {/* Mobile sidebar */}
      {open && (
        <div className="fixed inset-0 z-50 flex lg:hidden">
          <div
            className="absolute inset-0 bg-forest-950/50 backdrop-blur-sm"
            onClick={() => setOpen(false)}
          />
          <aside className="relative flex h-full w-[280px] animate-fade-in flex-col bg-cream shadow-lift">
            <button
              className="btn-icon absolute right-3 top-3.5"
              onClick={() => setOpen(false)}
              aria-label="Menyuni yopish"
            >
              <X size={18} />
            </button>
            {sidebar}
          </aside>
        </div>
      )}

      <div className="lg:pl-[264px]">
        <header className="sticky top-0 z-20 flex h-14 items-center justify-between gap-3 border-b border-ink/5 bg-cream/85 px-4 backdrop-blur-xl sm:px-6">
          <div className="flex min-w-0 items-center gap-2">
            <button
              className="btn-icon lg:hidden"
              onClick={() => setOpen(true)}
              aria-label="Menyu"
            >
              <Menu size={20} />
            </button>
            <p className="truncate text-[13px] text-ink/45">
              <span className="hidden sm:inline">Xush kelibsiz, </span>
              <span className="font-semibold text-ink/75">
                {profile.full_name || profile.login || "foydalanuvchi"}
              </span>
            </p>
          </div>

          <div className="flex items-center gap-1">
            <ThemeToggle compact />

            <div className="relative">
              <button
                onClick={() => setMenu((m) => !m)}
                className="flex items-center gap-2 rounded-xl py-1 pl-1 pr-1.5 transition hover:bg-ink/5"
                aria-expanded={menu}
              >
                <span className="grid h-8 w-8 place-items-center rounded-lg bg-sage-200 text-[11.5px] font-bold text-forest-900 dark:bg-sage-200/30 dark:text-forest-100">
                  {initials(profile.full_name || profile.login || "R")}
                </span>
                <ChevronDown size={14} className="text-ink/40" />
              </button>
              {menu && (
                <>
                  <div
                    className="fixed inset-0 z-30"
                    onClick={() => setMenu(false)}
                    aria-hidden
                  />
                  <div className="absolute right-0 z-40 mt-2 w-60 animate-fade-up overflow-hidden rounded-2xl border border-ink/8 bg-surface p-1.5 shadow-lift">
                    <div className="px-3 py-2">
                      <p className="truncate text-[13px] font-semibold text-ink/85">
                        {profile.full_name}
                      </p>
                      <p className="truncate text-[11px] text-ink/45">
                        {profile.login
                          ? `@${profile.login}`
                          : profile.email || "—"}
                      </p>
                      <span className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-sage-100 px-2 py-0.5 text-[10.5px] font-bold text-forest-900 dark:bg-sage-200/30 dark:text-forest-100">
                        {roleIcon(profile.role)} {ROLE_LABEL[profile.role]}
                      </span>
                    </div>
                    <div className="my-1 h-px bg-ink/5" />
                    <button
                      onClick={() => navigate("/app/settings")}
                      className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-[13px] font-medium text-ink/70 hover:bg-forest-50 dark:hover:bg-forest-800/25"
                    >
                      <Settings size={15} /> Sozlamalar
                    </button>
                    <button
                      onClick={signOut}
                      className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-[13px] font-medium text-rose-600 hover:bg-rose-50 dark:text-rose-300 dark:hover:bg-rose-500/10"
                    >
                      <LogOut size={15} /> Chiqish
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </header>

        <main className="mx-auto max-w-[1240px] px-4 py-6 sm:px-6 sm:py-8">
          {children}
        </main>
      </div>
    </div>
  );
}
