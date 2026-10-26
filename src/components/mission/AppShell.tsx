import { useState, type ReactNode } from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { Check, ChevronsUpDown, LogOut, Menu, Moon, Plus, Sun } from "lucide-react";
import { useBalance, useCompany, useMyCompanies, useStore } from "@/lib/store";
import { isLowBalance, PLANS } from "@/lib/credits";
import { num } from "@/lib/format";
import { BrandLogo } from "./primitives";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

const mainNav = [
  { to: "/hq", label: "Home" },
  { to: "/flight-plan", label: "Flight plan" },
  { to: "/approvals", label: "GO / NO-GO", count: true },
  { to: "/telemetry", label: "Telemetry" },
  { to: "/activity", label: "Log" },
] as const;

const departments = [
  { to: "/build", label: "Build" },
  { to: "/grow", label: "Grow" },
  { to: "/run", label: "Run" },
  { to: "/legal", label: "Stay legal" },
  { to: "/raise", label: "Raise" },
] as const;

const accountNav = [
  { to: "/team", label: "Team" },
  { to: "/ownership", label: "Ownership" },
  { to: "/settings", label: "Settings" },
  { to: "/billing", label: "Billing & credits" },
] as const;

const groupLabel = "label-caps px-2.5 pb-1.5 text-[11px] tracking-[0.16em] text-muted-foreground";
const itemBase = "flex min-h-8 items-center justify-between gap-2 rounded-tile px-2.5";
const itemActive = "bg-soft text-ink shadow-tile";

function useActive() {
  const path = useRouterState({ select: (s) => s.location.pathname });
  return (to: string) => path === to || path.startsWith(`${to}/`);
}

function MainNav({ onNavigate }: { onNavigate?: (() => void) | undefined }) {
  const { db, companyId } = useStore();
  const active = useActive();
  const pending = db.approvals.filter(
    (a) => a.company_id === companyId && a.status === "pending",
  ).length;
  return (
    <div className="label-caps flex flex-col gap-0.5 text-[13px] font-semibold tracking-[0.1em]">
      {mainNav.map((i) => (
        <Link
          key={i.to}
          to={i.to}
          onClick={onNavigate}
          aria-current={active(i.to) ? "page" : undefined}
          className={cn(
            itemBase,
            active(i.to) ? itemActive : "text-muted-foreground hover:text-ink",
          )}
        >
          {i.label}
          {"count" in i && pending > 0 && (
            <span
              className="rounded-full bg-hold-bg px-[7px] py-px text-hold tabular"
              aria-label={`${pending} waiting`}
            >
              {pending}
            </span>
          )}
        </Link>
      ))}
    </div>
  );
}

function Departments({ onNavigate }: { onNavigate?: (() => void) | undefined }) {
  const active = useActive();
  return (
    <div className="flex flex-col gap-0.5">
      <div className={groupLabel}>Departments</div>
      {departments.map((i) => (
        <Link
          key={i.to}
          to={i.to}
          onClick={onNavigate}
          aria-current={active(i.to) ? "page" : undefined}
          className={cn(itemBase, active(i.to) ? `${itemActive} font-medium` : "hover:bg-soft")}
        >
          {i.label}
        </Link>
      ))}
    </div>
  );
}

function CohortNav({ onNavigate }: { onNavigate?: (() => void) | undefined }) {
  const active = useActive();
  return (
    <div className="flex flex-col gap-0.5">
      <div className={groupLabel}>Cohort</div>
      <Link
        to="/cohort"
        onClick={onNavigate}
        aria-current={active("/cohort") ? "page" : undefined}
        className={cn(itemBase, active("/cohort") ? `${itemActive} font-medium` : "hover:bg-soft")}
      >
        All missions
      </Link>
    </div>
  );
}

function MissionSwitcher() {
  const { setCompanyId, companyId } = useStore();
  const mine = useMyCompanies();
  const current = useCompany();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex min-h-11 w-full items-center justify-between gap-2 rounded-[8px] border bg-surface px-2.5 py-2 text-left shadow-tile">
        <span className="min-w-0">
          <span className="label-caps block text-[11px] tracking-[0.14em] text-muted-foreground">
            Mission
          </span>
          <span className="block truncate font-semibold">{current.name}</span>
        </span>
        <ChevronsUpDown className="size-4 shrink-0" aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        <DropdownMenuLabel className="label-caps text-[11px] text-muted-foreground">
          Your missions
        </DropdownMenuLabel>
        {mine.map((c) => (
          <DropdownMenuItem key={c.id} onClick={() => setCompanyId(c.id)}>
            <span className="flex-1">{c.name}</span>
            {c.id === companyId && <Check className="size-4" />}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link to="/onboarding">
            <Plus className="size-4" />
            New mission
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function FuelBox({ onNavigate }: { onNavigate?: (() => void) | undefined }) {
  const company = useCompany();
  const balance = useBalance();
  const tank = PLANS[company.plan].credits;
  const level = Math.max(0, Math.min(100, (balance / tank) * 100));
  const low = isLowBalance(balance, company.plan);
  return (
    <div className="flex flex-col gap-2 rounded-[8px] border bg-surface p-3.5 shadow-card">
      <div className="flex items-baseline justify-between">
        <span className="label-caps text-[11px] tracking-[0.14em] text-muted-foreground">Fuel</span>
        <span className="display-num text-[20px]">
          {num(balance)} <span className="text-[12px] text-muted-foreground">CR</span>
        </span>
      </div>
      <div className="h-1 rounded-sm bg-track" aria-hidden="true">
        <div
          className={cn("h-1 rounded-sm", low ? "bg-hold" : "bg-ink")}
          style={{ width: `${level}%` }}
        />
      </div>
      <Link
        to="/billing"
        onClick={onNavigate}
        className="label-caps self-start text-[12px] hover:opacity-80"
      >
        Top up
      </Link>
    </div>
  );
}

function AccountMenu({ onNavigate }: { onNavigate?: (() => void) | undefined }) {
  const { db, mode, user, setUserId, theme, toggleTheme, signOut } = useStore();
  const navigate = useNavigate();
  const initials = user.full_name
    .split(" ")
    .map((p) => p[0])
    .slice(-2)
    .join("");
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="flex min-h-11 w-full items-center gap-2.5 rounded-tile px-2 text-left hover:bg-soft"
        aria-label="Account"
      >
        <span className="label-caps flex size-8 shrink-0 items-center justify-center rounded-full border bg-surface text-[11px] tracking-[0.06em] shadow-tile">
          {initials}
        </span>
        <span className="min-w-0 flex-1 leading-tight">
          <span className="block truncate text-[13px] font-medium">{user.full_name}</span>
          <span className="block text-xs capitalize text-muted-foreground">{user.role}</span>
        </span>
        <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="start" className="w-56">
        {accountNav.map((i) => (
          <DropdownMenuItem key={i.to} asChild>
            <Link to={i.to} onClick={onNavigate}>
              {i.label}
            </Link>
          </DropdownMenuItem>
        ))}
        {/* Switching people is a demo convenience; live sessions are real sign-ins. */}
        {mode === "demo" && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
              Demo: view as
            </DropdownMenuLabel>
            {db.profiles
              .filter((p) => p.id !== "u4")
              .map((p) => (
                <DropdownMenuItem key={p.id} onClick={() => setUserId(p.id)}>
                  <span className="flex-1">{p.full_name}</span>
                  <span className="text-xs capitalize text-muted-foreground">{p.role}</span>
                </DropdownMenuItem>
              ))}
          </>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={toggleTheme}>
          {theme === "light" ? <Moon className="size-4" /> : <Sun className="size-4" />}
          {theme === "light" ? "Dark theme" : "Light theme"}
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => {
            void signOut().then(() => navigate({ to: "/" }));
          }}
        >
          <LogOut className="size-4" />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function SidebarContent({ onNavigate }: { onNavigate?: (() => void) | undefined }) {
  const { user } = useStore();
  return (
    <div className="flex min-h-full flex-col gap-3.5 px-3 py-4">
      <Link to="/hq" onClick={onNavigate} aria-label="Home" className="self-start">
        <BrandLogo />
      </Link>
      {user.role !== "founder" && <CohortNav onNavigate={onNavigate} />}
      <MissionSwitcher />
      <MainNav onNavigate={onNavigate} />
      <Departments onNavigate={onNavigate} />
      <div className="mt-auto flex flex-col gap-2">
        <FuelBox onNavigate={onNavigate} />
        <AccountMenu onNavigate={onNavigate} />
      </div>
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const company = useCompany();
  const balance = useBalance();
  const low = isLowBalance(balance, company.plan);
  const close = () => setOpen(false);
  return (
    <div className="flex min-h-screen bg-bg">
      <nav
        aria-label="Main"
        className="sticky top-0 hidden h-screen w-[236px] shrink-0 overflow-y-auto border-r bg-side tab:block"
      >
        <SidebarContent />
      </nav>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="left" className="w-[236px] overflow-y-auto bg-side p-0">
          <SheetTitle className="sr-only">Menu</SheetTitle>
          <SheetDescription className="sr-only">Main navigation</SheetDescription>
          <nav aria-label="Main">
            <SidebarContent onNavigate={close} />
          </nav>
        </SheetContent>
      </Sheet>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex h-14 items-center gap-2 border-b bg-side px-3 tab:hidden">
          <button
            className="flex size-11 items-center justify-center rounded-tile hover:bg-soft"
            onClick={() => setOpen(true)}
            aria-label="Open menu"
          >
            <Menu className="size-5" />
          </button>
          <Link to="/hq" aria-label="Home">
            <BrandLogo className="text-[15px]" />
          </Link>
          <span className="ml-auto truncate text-sm font-semibold">{company.name}</span>
        </header>
        <main className="flex min-w-0 flex-1 flex-col gap-3.5 px-4 pb-5 pt-[18px] tab:px-6">
          {low && (
            <div className="rounded-tile bg-hold-bg px-3 py-2 text-sm text-hold">
              You're below 20% of your monthly credits ({num(balance)} left).{" "}
              <Link to="/billing" className="font-medium underline">
                Top up
              </Link>
            </div>
          )}
          {children}
        </main>
      </div>
    </div>
  );
}
