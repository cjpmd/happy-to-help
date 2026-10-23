import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { PRODUCT_NAME } from "@/lib/brand";
import { useState } from "react";
import { Mail, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { BrandLogo, SolAvatar } from "@/components/mission/primitives";
import { pageHead } from "@/lib/seo";

export const Route = createFileRoute("/")({
  head: () =>
    pageHead(
      "Sign in",
      `Sign in to ${PRODUCT_NAME} and see what Sol, your AI cofounder, did overnight.`,
    ),
  component: SignIn,
});

function SignIn() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const navigate = useNavigate();
  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="flex flex-col px-6 py-8 sm:px-12">
        <BrandLogo />
        <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center">
          <h1 className="text-3xl font-semibold tracking-tight">Wake up to progress.</h1>
          <p className="mt-2 text-muted-foreground">
            Sol works on your startup overnight. You review and approve over breakfast.
          </p>
          {sent ? (
            <div className="mt-8 rounded-xl border bg-card p-5 shadow-card">
              <Mail className="h-5 w-5 text-primary" />
              <p className="mt-3 font-medium">Check your inbox</p>
              <p className="mt-1 text-sm text-muted-foreground">
                We've sent a magic link to {email}. It expires in 1 hour.
              </p>
              <Button className="mt-4 w-full" onClick={() => navigate({ to: "/hq" })}>
                Continue to demo <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          ) : (
            <form
              className="mt-8 space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                if (email) setSent(true);
              }}
            >
              <label className="text-sm font-medium" htmlFor="email">
                Work email
              </label>
              <Input
                id="email"
                type="email"
                required
                placeholder="you@startup.co.uk"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="h-11"
              />
              <Button type="submit" className="h-11 w-full">
                Email me a magic link
              </Button>
            </form>
          )}
          <div className="mt-6 flex flex-wrap gap-x-4 gap-y-2 text-sm text-muted-foreground">
            <Link to="/hq" className="hover:text-foreground">
              Explore the demo →
            </Link>
            <Link to="/onboarding" className="hover:text-foreground">
              New founder? Start here →
            </Link>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">© 2026 {PRODUCT_NAME}. Made in Glasgow.</p>
      </div>
      <div className="relative hidden overflow-hidden border-l bg-sidebar lg:block">
        <div className="relative flex h-full flex-col justify-center gap-4 p-16">
          <div className="max-w-md rounded-2xl border bg-card p-5 shadow-float">
            <div className="flex items-center gap-2.5">
              <SolAvatar size={32} />
              <div>
                <p className="text-sm font-medium">Sol</p>
                <p className="text-xs text-muted-foreground">powered by Claude · 07:02</p>
              </div>
            </div>
            <p className="mt-4 text-sm leading-relaxed">
              Morning ☀️ While you slept I shipped the streak counter to preview, drafted a TikTok
              post and a welcome email, and checked your ICO fee.{" "}
              <span className="font-medium">3 things need your approval.</span>
            </p>
          </div>
          <div className="ml-12 max-w-sm rounded-2xl border bg-card p-4 shadow-float">
            <p className="text-xs text-muted-foreground">Overnight</p>
            <p className="mt-1 text-2xl font-semibold tabular">8 runs · 795 credits</p>
            <p className="text-xs text-success">1 failed run auto-refunded</p>
          </div>
        </div>
      </div>
    </div>
  );
}
