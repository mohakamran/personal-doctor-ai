import { useEffect, useRef, useState } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  Activity, BarChart3, Bell, Calendar, ChevronDown, FileText, HeartPulse, LayoutDashboard, LogOut, Menu,
  MessageSquareHeart, Pill, Ruler, Settings, Stethoscope, User as UserIcon, ClipboardList, X,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { measurementsApi, settingsApi } from "@/services/endpoints";
import { cn } from "@/utils/cn";
import { fmtDateTime } from "@/utils/format";

type NavItem = { to: string; label: string; icon: typeof LayoutDashboard; children?: NavItem[] };

const NAV: NavItem[] = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/ai-doctor", label: "AI Doctor", icon: MessageSquareHeart },
  {
    to: "/health", label: "My Health", icon: HeartPulse, children: [
      { to: "/health/profile", label: "Health Profile", icon: UserIcon },
      { to: "/health/history", label: "Medical History", icon: ClipboardList },
      { to: "/health/symptoms", label: "Symptoms", icon: Activity },
      { to: "/health/measurements", label: "Measurements", icon: Ruler },
    ],
  },
  { to: "/records", label: "Medical Records", icon: FileText },
  { to: "/medications", label: "Medications", icon: Pill },
  { to: "/appointments", label: "Appointments", icon: Calendar },
  { to: "/analytics", label: "Health Analytics", icon: BarChart3 },
  { to: "/settings", label: "Settings", icon: Settings },
];

const TITLES: Record<string, string> = {
  "/": "Dashboard", "/ai-doctor": "AI Doctor", "/health/profile": "Health Profile",
  "/health/history": "Medical History", "/health/symptoms": "Symptoms", "/health/measurements": "Measurements",
  "/records": "Medical Records", "/medications": "Medications", "/appointments": "Appointments",
  "/analytics": "Health Analytics", "/settings": "Settings",
};

function linkCls({ isActive }: { isActive: boolean }) {
  return cn(
    "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
    isActive ? "bg-white/10 text-white" : "text-white/70 hover:bg-white/5 hover:text-white",
  );
}

function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <nav aria-label="Main" className="flex h-full flex-col bg-[#0f2a4a] px-3 py-4 dark:bg-[#0a1a2e]">
      <Link to="/" className="mb-6 flex items-center gap-2.5 px-2" onClick={onNavigate}>
        <div className="grid size-9 place-items-center rounded-xl bg-[#14b8a6]/15 text-[#2dd4bf]"><Stethoscope className="size-5" /></div>
        <div className="leading-tight">
          <p className="text-sm font-semibold text-white">Personal Doctor AI</p>
          <p className="text-[11px] text-white/55">Your AI Health Companion</p>
        </div>
      </Link>
      <ul className="flex-1 space-y-0.5 overflow-y-auto">
        {NAV.map((item) => (
          <li key={item.to}>
            {item.children ? (
              <>
                <p className="mt-3 flex items-center gap-3 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-white/45">
                  <item.icon className="size-4" /> {item.label}
                </p>
                <ul className="space-y-0.5">
                  {item.children.map((c) => (
                    <li key={c.to}>
                      <NavLink to={c.to} className={(s) => cn(linkCls(s), "pl-9")} onClick={onNavigate}>
                        <c.icon className="size-4" /> {c.label}
                      </NavLink>
                    </li>
                  ))}
                </ul>
                <div className="my-3 h-px bg-white/10" />
              </>
            ) : (
              <NavLink to={item.to} end={item.to === "/"} className={linkCls} onClick={onNavigate}>
                <item.icon className="size-4" /> {item.label}
              </NavLink>
            )}
          </li>
        ))}
      </ul>
      <p className="px-3 pt-3 text-[11px] leading-relaxed text-white/45">
        AI assistant — not a licensed physician. In an emergency call your local emergency number.
      </p>
    </nav>
  );
}

function usePopover() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDoc); document.removeEventListener("keydown", onKey); };
  }, [open]);
  return { open, setOpen, ref };
}

function Notifications() {
  const pop = usePopover();
  const { data: dash } = useQuery({ queryKey: ["dashboard"], queryFn: measurementsApi.dashboard });
  const { data: ai } = useQuery({ queryKey: ["ai-settings"], queryFn: settingsApi.ai });
  const items: { text: string; to: string }[] = [];
  if (ai && !ai.verified) items.push({ text: "Connect your OpenAI API key to enable the AI Doctor.", to: "/settings?tab=ai" });
  if (ai && ai.verified && !ai.ai_consent) items.push({ text: "Give consent in Privacy settings to start chatting.", to: "/settings?tab=privacy" });
  const soon = Date.now() + 7 * 86400_000;
  dash?.upcoming_appointments.filter((a) => new Date(a.scheduled_at).getTime() < soon)
    .forEach((a) => items.push({ text: `Upcoming: ${a.title} — ${fmtDateTime(a.scheduled_at)}`, to: "/appointments" }));
  const now = new Date();
  const hhmm = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  dash?.active_medications.filter((m) => m.reminder_enabled).forEach((m) => {
    const next = m.reminder_times.find((t) => t >= hhmm);
    if (next) items.push({ text: `Medication reminder: ${m.name} at ${next}`, to: "/medications" });
  });
  if (dash && dash.profile_completion < 50) items.push({ text: `Your health profile is ${dash.profile_completion}% complete.`, to: "/health/profile" });

  return (
    <div className="relative" ref={pop.ref}>
      <button aria-label={`Notifications (${items.length})`} aria-expanded={pop.open} onClick={() => pop.setOpen(!pop.open)}
        className="relative grid size-9 place-items-center rounded-lg text-ink-2 hover:bg-surface-2">
        <Bell className="size-[18px]" />
        {items.length > 0 && <span className="absolute right-1.5 top-1.5 size-2 rounded-full bg-teal" />}
      </button>
      {pop.open && (
        <div className="absolute right-0 z-50 mt-2 w-80 rounded-xl border border-line bg-surface p-2 shadow-xl">
          <p className="px-2 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted">Notifications</p>
          {items.length === 0 ? <p className="px-2 py-4 text-sm text-muted">You're all caught up.</p> : (
            <ul>{items.map((n, i) => (
              <li key={i}><Link to={n.to} onClick={() => pop.setOpen(false)} className="block rounded-lg px-2 py-2 text-sm text-ink-2 hover:bg-surface-2">{n.text}</Link></li>
            ))}</ul>
          )}
        </div>
      )}
    </div>
  );
}

function AccountMenu() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const pop = usePopover();
  const initials = (user?.display_name ?? "?").split(" ").map((s) => s[0]).slice(0, 2).join("").toUpperCase();
  return (
    <div className="relative" ref={pop.ref}>
      <button aria-label="Account menu" aria-expanded={pop.open} onClick={() => pop.setOpen(!pop.open)}
        className="flex items-center gap-2 rounded-lg py-1 pl-1 pr-2 hover:bg-surface-2">
        <span className="grid size-8 place-items-center rounded-full bg-navy text-xs font-semibold text-white dark:text-[#0b1320]">{initials}</span>
        <span className="hidden max-w-32 truncate text-sm font-medium text-ink sm:block">{user?.display_name}</span>
        <ChevronDown className="size-4 text-muted" />
      </button>
      {pop.open && (
        <div className="absolute right-0 z-50 mt-2 w-60 rounded-xl border border-line bg-surface p-1.5 shadow-xl">
          <div className="px-2.5 py-2">
            <p className="truncate text-sm font-medium text-ink">{user?.display_name}</p>
            <p className="truncate text-xs text-muted">{user?.email}</p>
          </div>
          <div className="my-1 h-px bg-line" />
          <Link to="/health/profile" onClick={() => pop.setOpen(false)} className="flex items-center gap-2 rounded-lg px-2.5 py-2 text-sm text-ink-2 hover:bg-surface-2"><UserIcon className="size-4" /> Health profile</Link>
          <Link to="/settings" onClick={() => pop.setOpen(false)} className="flex items-center gap-2 rounded-lg px-2.5 py-2 text-sm text-ink-2 hover:bg-surface-2"><Settings className="size-4" /> Settings</Link>
          <button onClick={async () => { await logout(); navigate("/login"); }} className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-sm text-danger hover:bg-danger-soft"><LogOut className="size-4" /> Sign out</button>
        </div>
      )}
    </div>
  );
}

export function AppLayout() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const { pathname } = useLocation();
  const title = TITLES[pathname] ?? (pathname.startsWith("/ai-doctor") ? "AI Doctor" : "Personal Doctor AI");
  useEffect(() => { document.title = `${title} · Personal Doctor AI`; }, [title]);

  return (
    <div className="flex h-full">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-surface focus:p-2">Skip to content</a>
      <aside className="hidden w-64 shrink-0 lg:block"><Sidebar /></aside>
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setMobileOpen(false)} />
          <div className="absolute inset-y-0 left-0 w-72">
            <button aria-label="Close menu" onClick={() => setMobileOpen(false)} className="absolute right-3 top-4 z-10 text-white/70"><X className="size-5" /></button>
            <Sidebar onNavigate={() => setMobileOpen(false)} />
          </div>
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center gap-3 border-b border-line bg-surface/90 px-4 backdrop-blur sm:px-6">
          <button aria-label="Open menu" className="grid size-9 place-items-center rounded-lg hover:bg-surface-2 lg:hidden" onClick={() => setMobileOpen(true)}>
            <Menu className="size-5" />
          </button>
          <p className="flex-1 truncate text-base font-semibold text-ink">{title}</p>
          <Notifications />
          <AccountMenu />
        </header>
        <main id="main" className="min-h-0 flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
