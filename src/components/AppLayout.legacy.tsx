import { useEffect, useState, type ReactNode } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import {
  LayoutDashboard,
  Users,
  UsersRound,
  ClipboardList,
  Library,
  BarChart3,
  LogOut,
  Menu,
  X,
  ShieldCheck,
  GraduationCap,
  Sparkles,
  UserCog,
  Settings,
  ChevronDown,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import type { Role } from "../types";
import { cn } from "./ui";
import { initials } from "../lib/api";

interface NavItem {
  to: string;
  label: string;
  icon: ReactNode;
  roles: Role[];
}

const NAV: NavItem[] = [
  {
    to: "/app",
    label: "Bosh sahifa",
    icon: <LayoutDashboard size={18} />,
    roles: ["admin", "psychologist", "student"],
  },
  {
    to: "/app/psychologists",
    label: "Psixologlar",
    icon: <UserCog size={18} />,
    roles: ["admin"],
  },
  {
    to: "/app/students",
    label: "O‘quvchilar",
    icon: <Users size={18} />,
    roles: ["admin", "psychologist"],
  },
  {
    to: "/app/groups",
    label: "Guruhlar",
    icon: <UsersRound size={18} />,
    roles: ["psychologist"],
  },
  {
    to: "/app/tests",
    label: "Mening testlarim",
    icon: <ClipboardList size={18} />,
    roles: ["admin", "psychologist"],
  },
  {
    to: "/app/library",
    label: "Test kutubxonasi",
    icon: <Library size={18} />,
    roles: ["admin", "psychologist"],
  },
  {
    to: "/app/assignments",
    label: "Tayinlashlar",
    icon: <Sparkles size={18} />,
    roles: ["admin", "psychologist"],
  },
  {
    to: "/app/results",
    label: "Natijalar",
    icon: <BarChart3 size={18} />,
    roles: ["admin", "psychologist"],
  },
  {
    to: "/app/my-tests",
    label: "Mening testlarim",
    icon: <ClipboardList size={18} />,
    roles: ["student"],
  },
  {
    to: "/app/settings",
    label: "Sozlamalar",
    icon: <Settings size={18} />,
    roles: ["admin", "psychologist", "student"],
  },
];

const ROLE_LABEL: Record<Role, string> = {
  admin: "Bosh administrator",
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

  const items = NAV.filter((n) => n.roles.includes(profile.role));

  const sidebar = (
    <div className="flex h-full flex-col px-4 pb-5 pt-6">
      <div className="flex items-center gap-2.5 px-2">
        <div className="grid h-10 w-10 place-items-center rounded-2xl bg-forest-800 text-white shadow-soft">
          <Sparkles size={19} />
        </div>
        <div>
          <p className="font-display text-[19px] leading-none tracking-wide text-forest-950">
            PSIXOMAKON
          </p>
          <p className="mt-1 text-[10.5px] font-semibold uppercase tracking-[0.16em] text-ink/40">
            psixologik platforma
          </p>
        </div>
      </div>

      <nav className="mt-8 flex-1 space-y-1 overflow-y-auto">
        {items.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === "/app"}
            className={({ isActive }) =>
              cn(
                "group flex items-center gap-3 rounded-2xl px-3.5 py-2.5 text-[13.5px] font-semibold transition",
                isActive
                  ? "bg-forest-800 text-white shadow-soft"
                  : "text-ink/60 hover:bg-forest-50 hover:text-forest-900",
              )
            }
          >
            {({ isActive }) => (
              <>
                <span
                  className={cn(
                    isActive
                      ? "text-white"
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
      </nav>

      <div className="mt-4 rounded-3xl bg-forest-50/80 p-4">
        <div className="flex items-center gap-2 text-forest-800">
          {roleIcon(profile.role)}
          <span className="text-[11px] font-bold uppercase tracking-wider">
            {ROLE_LABEL[profile.role]}
          </span>
        </div>
        <p className="mt-2 text-xs leading-relaxed text-ink/50">
          Ma’lumotlar Sizning rolingizga mos ravishda himoyalangan.
        </p>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-cream">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[272px] border-r border-ink/5 bg-white/70 backdrop-blur-xl lg:block">
        {sidebar}
      </aside>

      {/* Mobile sidebar */}
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="absolute inset-0 bg-forest-950/30 backdrop-blur-sm"
            onClick={() => setOpen(false)}
          />
          <aside className="relative h-full w-[282px] animate-fade-in bg-cream shadow-lift">
            <button
              className="absolute right-3 top-5 rounded-xl p-2 text-ink/50 hover:bg-ink/5"
              onClick={() => setOpen(false)}
              aria-label="Menyuni yopish"
            >
              <X size={18} />
            </button>
            {sidebar}
          </aside>
        </div>
      )}

      <div className="lg:pl-[272px]">
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between gap-3 border-b border-ink/5 bg-cream/85 px-4 backdrop-blur-xl sm:px-7">
          <div className="flex items-center gap-3">
            <button
              className="rounded-xl p-2 text-forest-900 hover:bg-forest-50 lg:hidden"
              onClick={() => setOpen(true)}
              aria-label="Menyu"
            >
              <Menu size={20} />
            </button>
            <div className="lg:hidden">
              <p className="font-display text-lg leading-none text-forest-950">
                PSIXOMAKON
              </p>
            </div>
            <p className="hidden text-sm text-ink/45 lg:block">
              Xush kelibsiz,{" "}
              <span className="font-semibold text-ink/70">
                {profile.full_name || "foydalanuvchi"}
              </span>
            </p>
          </div>

          <div className="relative">
            <button
              onClick={() => setMenu((m) => !m)}
              className="flex items-center gap-2.5 rounded-2xl py-1.5 pl-1.5 pr-2.5 transition hover:bg-white hover:shadow-soft"
            >
              <span className="grid h-9 w-9 place-items-center rounded-xl bg-sage-200 text-[12px] font-bold text-forest-900">
                {initials(profile.full_name || profile.login || "R")}
              </span>
              <span className="hidden text-left sm:block">
                <span className="block text-[13px] font-semibold leading-tight text-ink/80">
                  {profile.full_name || profile.login}
                </span>
                <span className="block text-[11px] text-ink/40">
                  {ROLE_LABEL[profile.role]}
                </span>
              </span>
              <ChevronDown size={15} className="text-ink/40" />
            </button>
            {menu && (
              <div className="absolute right-0 mt-2 w-56 animate-fade-up rounded-2xl border border-ink/5 bg-white p-1.5 shadow-lift">
                <div className="px-3 py-2">
                  <p className="truncate text-[13px] font-semibold text-ink/80">
                    {profile.full_name}
                  </p>
                  <p className="truncate text-[11px] text-ink/45">
                    {profile.login || "—"}
                  </p>
                </div>
                <button
                  onClick={() => navigate("/app/settings")}
                  className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-[13px] font-medium text-ink/70 hover:bg-forest-50"
                >
                  <Settings size={15} /> Sozlamalar
                </button>
                <button
                  onClick={signOut}
                  className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-[13px] font-medium text-rose-600 hover:bg-rose-50"
                >
                  <LogOut size={15} /> Chiqish
                </button>
              </div>
            )}
          </div>
        </header>

        <main className="mx-auto max-w-[1180px] px-4 py-7 sm:px-7 sm:py-9">
          {children}
        </main>
      </div>
    </div>
  );
}
