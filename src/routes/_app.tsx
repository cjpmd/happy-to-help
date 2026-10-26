import { useEffect } from "react";
import { createFileRoute, Outlet, useNavigate } from "@tanstack/react-router";
import { AppShell } from "@/components/mission/AppShell";
import { useStore } from "@/lib/store";

export const Route = createFileRoute("/_app")({
  component: AppLayout,
});

/**
 * Live mode needs a session and at least one company: signed-out visitors go to sign-in, and
 * people with no company yet go to onboarding. The demo is always signed in.
 */
function AppLayout() {
  const { auth, loading, db } = useStore();
  const navigate = useNavigate();
  const ready = auth === "signed_in" && !loading;
  const noCompany = ready && db.companies.length === 0;
  useEffect(() => {
    if (auth === "signed_out") void navigate({ to: "/" });
    else if (noCompany) void navigate({ to: "/onboarding" });
  }, [auth, noCompany, navigate]);
  if (!ready || noCompany)
    return (
      <div
        className="flex min-h-screen items-center justify-center bg-bg"
        role="status"
        aria-live="polite"
      >
        <p className="label-caps text-[12px] text-muted-foreground">Loading mission…</p>
      </div>
    );
  return (
    <AppShell>
      <Outlet />
    </AppShell>
  );
}
