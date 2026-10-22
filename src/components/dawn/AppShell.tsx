import { useState, type ReactNode } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { Home, CheckSquare, Activity, Hammer, Megaphone, Inbox, Scale, Coins, Lightbulb, CreditCard, Users, Menu, ChevronsUpDown, Moon, Sun, Plus, Check, LogOut, CalendarClock, Mail, Images, FileText, Settings, Shield, Target } from "lucide-react";
import { useStore, useMyCompanies, useCompany, useBalance } from "@/lib/store";
import { isLowBalance, PLANS } from "@/lib/credits";
import { num } from "@/lib/format";
import { profiles } from "@/lib/seed";
import { BrandLogo } from "./primitives";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

const founderNav = [
  { group: "", items: [
    { to: "/hq", label: "HQ", icon: Home },
    { to: "/approvals", label: "Approvals", icon: CheckSquare, badge: true },
    { to: "/activity", label: "Activity", icon: Activity },
  ] },
  { group: "Pillars", items: [
    { to: "/build", label: "Build", icon: Hammer },
    { to: "/grow", label: "Grow", icon: Megaphone },
    { to: "/run", label: "Run", icon: Inbox },
    { to: "/legal", label: "Stay legal", icon: Scale },
    { to: "/raise", label: "Raise", icon: Coins },
  ] },
  { group: "Company", items: [
    { to: "/evidence", label: "Evidence", icon: Lightbulb },
    { to: "/routines", label: "Routines", icon: CalendarClock },
    { to: "/email", label: "Email", icon: Mail },
    { to: "/media", label: "Media", icon: Images },
    { to: "/ads", label: "Ads", icon: Target },
    { to: "/documents", label: "Documents", icon: FileText },
    { to: "/team", label: "Team", icon: Users },
    { to: "/ownership", label: "Ownership", icon: Shield },
    { to: "/settings", label: "Settings", icon: Settings },
    { to: "/billing", label: "Billing & credits", icon: CreditCard },
  ] },
] as const;

function Nav({ onNavigate }: { onNavigate?: () => void }) {
  const { db, companyId, user } = useStore();
  const path = useRouterState({ select: (s) => s.location.pathname });
  const pending = db.approvals.filter((a) => a.company_id === companyId && a.status === "pending").length;
  const item = (to: string, label: string, Icon: typeof Home, badge?: boolean) => (
    <Link key={to} to={to} onClick={onNavigate}
      className={cn("flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm transition-colors", path.startsWith(to) ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground" : "text-sidebar-foreground hover:bg-sidebar-accent/60")}>
      <Icon className="h-4 w-4" />
      <span className="flex-1">{label}</span>
      {badge && pending > 0 && <span className="rounded-full bg-primary px-1.5 text-[11px] font-semibold text-primary-foreground tabular">{pending}</span>}
    </Link>
  );
  return (
    <nav className="space-y-5 p-3">
      {user.role !== "founder" && (
        <div className="space-y-0.5">
          <p className="px-2.5 pb-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Mentor</p>
          {item("/cohort", "Cohort", Users)}
        </div>
      )}
      {founderNav.map((g) => (
        <div key={g.group} className="space-y-0.5">
          {g.group && <p className="px-2.5 pb-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{g.group}</p>}
          {g.items.map((i) => item(i.to, i.label, i.icon, "badge" in i ? i.badge : false))}
        </div>
      ))}
    </nav>
  );
}

function CompanySwitcher() {
  const { setCompanyId, companyId } = useStore();
  const mine = useMyCompanies();
  const current = useCompany();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm font-medium hover:bg-accent">
        <span className="flex h-6 w-6 items-center justify-center rounded-md bg-foreground text-[11px] font-semibold text-background">{current.name[0]}</span>
        <span className="max-w-[9rem] truncate">{current.name}</span>
        <ChevronsUpDown className="h-3.5 w-3.5 text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-60">
        <DropdownMenuLabel className="text-xs text-muted-foreground">Portfolio</DropdownMenuLabel>
        {mine.map((c) => (
          <DropdownMenuItem key={c.id} onClick={() => setCompanyId(c.id)}>
            <span className="flex h-5 w-5 items-center justify-center rounded bg-muted text-[10px] font-semibold">{c.name[0]}</span>
            <span className="flex-1">{c.name}</span>
            {c.id === companyId && <Check className="h-4 w-4" />}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild><Link to="/onboarding"><Plus className="h-4 w-4" />New company</Link></DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function UserMenu() {
  const { user, setUserId, theme, toggleTheme } = useStore();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-xs font-semibold" aria-label="Account">
        {user.full_name.split(" ").map((p) => p[0]).slice(0, 2).join("")}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel><p className="text-sm">{user.full_name}</p><p className="text-xs font-normal capitalize text-muted-foreground">{user.role}</p></DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="text-xs text-muted-foreground">Demo: view as</DropdownMenuLabel>
        {profiles.filter((p) => p.id !== "u4").map((p) => (
          <DropdownMenuItem key={p.id} onClick={() => setUserId(p.id)}>
            <span className="flex-1">{p.full_name}</span><span className="text-xs capitalize text-muted-foreground">{p.role}</span>
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={toggleTheme}>{theme === "light" ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}{theme === "light" ? "Dark mode" : "Light mode"}</DropdownMenuItem>
        <DropdownMenuItem asChild><Link to="/"><LogOut className="h-4 w-4" />Sign out</Link></DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const company = useCompany();
  const balance = useBalance();
  const low = isLowBalance(balance, company.plan);
  return (
    <div className="flex min-h-screen">
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r bg-sidebar lg:flex">
        <div className="flex h-14 items-center border-b px-5"><Link to="/hq"><BrandLogo /></Link></div>
        <div className="flex-1 overflow-y-auto"><Nav /></div>
        <div className="border-t p-3 text-xs text-muted-foreground">
          <div className="flex justify-between"><span>{PLANS[company.plan].name} plan</span><span className="tabular">{num(balance)} credits</span></div>
        </div>
      </aside>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="left" className="w-64 bg-sidebar p-0">
          <SheetTitle className="flex h-14 items-center border-b px-5"><BrandLogo /></SheetTitle>
          <Nav onNavigate={() => setOpen(false)} />
        </SheetContent>
      </Sheet>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex h-14 items-center gap-2 border-b bg-background/85 px-3 backdrop-blur sm:px-5">
          <button className="rounded-md p-1.5 hover:bg-accent lg:hidden" onClick={() => setOpen(true)} aria-label="Menu"><Menu className="h-5 w-5" /></button>
          <CompanySwitcher />
          <div className="flex-1" />
          <UserMenu />
        </header>
        {low && (
          <div className="border-b bg-warning-soft px-5 py-2 text-sm text-warning">
            You're below 20% of your monthly credits ({num(balance)} left). <Link to="/billing" className="font-medium underline">Top up</Link>
          </div>
        )}
        <main className="mx-auto w-full max-w-[1400px] flex-1 px-4 py-6 sm:px-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}
