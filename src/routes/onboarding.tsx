import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { BrandLogo, SolAvatar } from "@/components/mission/primitives";
import { useStore } from "@/lib/store";
import { pageHead } from "@/lib/seo";
import { businessDefaults, type Sector } from "@/lib/workspace";
import { analyseVoice, parseContactsCsv } from "@/lib/voice";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/onboarding")({
  head: () =>
    pageHead("Set up your company", "Tell Sol about your startup idea in a few short steps."),
  component: Onboarding,
});

const STAGE_OPTS = ["Just an idea", "Talking to customers", "Building something", "Have users"];

function Choice({
  options,
  value,
  onChange,
}: {
  options: string[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {options.map((o) => (
        <button
          type="button"
          key={o}
          onClick={() => onChange(o)}
          className={cn(
            "rounded-lg border px-4 py-3 text-left text-sm transition-colors",
            value === o ? "border-primary bg-primary-soft font-medium" : "hover:bg-muted",
          )}
        >
          {o}
        </button>
      ))}
    </div>
  );
}

function Onboarding() {
  const { createCompany, importContacts, addVoiceSource, mode, auth } = useStore();
  const navigate = useNavigate();
  const [saving, setSaving] = useState(false);
  // Live mode: you sign in first, then set up the mission.
  useEffect(() => {
    if (mode === "live" && auth === "signed_out") void navigate({ to: "/" });
  }, [mode, auth, navigate]);
  const [step, setStep] = useState(0);
  const [path, setPath] = useState<"" | "start_up" | "keep_going">("");
  const [contacts, setContacts] = useState<ReturnType<typeof parseContactsCsv> | null>(null);
  const [f, setF] = useState({
    instagram: "",
    tiktok: "",
    linkedin: "",
    facebook: "",
    google: "",
    emails: "",
    name: "",
    idea: "",
    customer: "",
    type: "",
    stage: "",
    goal: "",
    url: "",
    code: "",
    sector: "general",
  });
  const set = (k: keyof typeof f) => (v: string) => setF((s) => ({ ...s, [k]: v }));

  const pathStep = {
    title: "Which sounds like you?",
    hint: "Both get the same Sol. This sets where you start and what HQ shows first.",
    ok: path,
    body: (
      <div className="grid gap-2">
        {(
          [
            ["start_up", "Starting up", "I have an idea or I'm getting ready to launch."],
            ["keep_going", "Keeping going", "I'm already trading and want help growing."],
          ] as const
        ).map(([value, label, detail]) => (
          <button
            type="button"
            key={value}
            onClick={() => setPath(value)}
            aria-pressed={path === value}
            className={cn(
              "rounded-lg border px-4 py-3 text-left text-sm transition-colors",
              path === value ? "border-primary bg-primary-soft" : "hover:bg-muted",
            )}
          >
            <span className="font-medium">{label}</span>
            <span className="mt-0.5 block text-muted-foreground">{detail}</span>
          </button>
        ))}
      </div>
    ),
  };
  const voice = analyseVoice(f.emails.split(/\n-{3,}\n|\n{3,}/));
  const sectorPicker = (
    <label className="block text-sm">
      Sector pack
      <select
        aria-label="Sector pack"
        value={f.sector}
        onChange={(e) => set("sector")(e.target.value)}
        className="mt-2 h-10 w-full rounded-md border bg-background px-3"
      >
        <option value="general">General</option>
        <option value="legal">Legal</option>
        <option value="finance">Finance</option>
        <option value="health">Health</option>
        <option value="education">Education</option>
      </select>
    </label>
  );
  const keepGoingSteps = [
    {
      title: "What's your business called?",
      hint: "As your customers know it.",
      ok: f.name.trim(),
      body: (
        <Input
          autoFocus
          className="h-11"
          placeholder="e.g. Harbour Bakes"
          value={f.name}
          onChange={(e) => set("name")(e.target.value)}
        />
      ),
    },
    {
      title: "What do you sell, and to whom?",
      hint: "Two sentences is plenty.",
      ok: f.idea.trim() && f.type,
      body: (
        <div className="space-y-3">
          <Textarea
            rows={3}
            placeholder="Sourdough and celebration cakes from a harbourside bakery…"
            value={f.idea}
            onChange={(e) => set("idea")(e.target.value)}
          />
          <Input
            className="h-11"
            placeholder="Who buys from you (e.g. local families and cafés)"
            value={f.customer}
            onChange={(e) => set("customer")(e.target.value)}
          />
          <Choice options={["B2C", "B2B"]} value={f.type} onChange={set("type")} />
          {sectorPicker}
        </div>
      ),
    },
    {
      title: "Where can Sol find you?",
      hint: "Your website, socials and Google Business profile. Skip any you don't use.",
      ok: true,
      body: (
        <div className="space-y-3">
          <Input
            className="h-11"
            placeholder="Website (https://…)"
            value={f.url}
            onChange={(e) => set("url")(e.target.value)}
          />
          <div className="grid gap-3 sm:grid-cols-2">
            <Input
              className="h-11"
              aria-label="Instagram"
              placeholder="Instagram @handle"
              value={f.instagram}
              onChange={(e) => set("instagram")(e.target.value)}
            />
            <Input
              className="h-11"
              aria-label="TikTok"
              placeholder="TikTok @handle"
              value={f.tiktok}
              onChange={(e) => set("tiktok")(e.target.value)}
            />
            <Input
              className="h-11"
              aria-label="LinkedIn"
              placeholder="LinkedIn page"
              value={f.linkedin}
              onChange={(e) => set("linkedin")(e.target.value)}
            />
            <Input
              className="h-11"
              aria-label="Facebook"
              placeholder="Facebook page"
              value={f.facebook}
              onChange={(e) => set("facebook")(e.target.value)}
            />
          </div>
          <Input
            className="h-11"
            aria-label="Google Business profile"
            placeholder="Google Business profile link"
            value={f.google}
            onChange={(e) => set("google")(e.target.value)}
          />
        </div>
      ),
    },
    {
      title: "Bring your customers",
      hint: "Upload a CSV with name and email columns. Optional, and you can do it later.",
      ok: true,
      body: (
        <div className="space-y-2">
          <input
            type="file"
            accept=".csv,text/csv"
            aria-label="Contacts CSV"
            className="block w-full text-sm file:mr-3 file:rounded-tile file:border file:bg-surface file:px-3 file:py-2"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              setContacts(file ? parseContactsCsv(await file.text()) : null);
            }}
          />
          {contacts && (
            <p className="text-sm text-muted-foreground" role="status">
              {contacts.rows.length} contacts ready to import
              {contacts.skipped ? `, ${contacts.skipped} rows skipped (no valid email)` : ""}. Only
              people with a record of consent will get marketing.
            </p>
          )}
        </div>
      ),
    },
    {
      title: "Teach Sol your voice",
      hint: "Paste a few emails you've sent customers (separate them with a blank line or ---). Optional.",
      ok: true,
      body: (
        <div className="space-y-3">
          <Textarea
            rows={6}
            aria-label="Past emails"
            placeholder={"Hi Sarah,\n\nThanks for your order! …\n\nBest wishes\nRory"}
            value={f.emails}
            onChange={(e) => set("emails")(e.target.value)}
          />
          {voice && (
            <div className="rounded-tile bg-soft p-3 text-sm shadow-tile" aria-live="polite">
              <p className="label-caps text-[11px] text-muted-foreground">Sol's first read</p>
              <p className="mt-1 whitespace-pre-line">{voice.summary}</p>
              <p className="mt-2 text-xs text-muted-foreground">
                Sol will turn this into a voice profile for you to approve before replying to
                anyone.
              </p>
            </div>
          )}
        </div>
      ),
    },
    {
      title: "Main goal for the next 90 days?",
      hint: "One measurable outcome works best.",
      ok: f.goal.trim(),
      body: (
        <div className="space-y-3">
          <Input
            className="h-11"
            placeholder="200 click-and-collect orders a week"
            value={f.goal}
            onChange={(e) => set("goal")(e.target.value)}
          />
          <Input
            className="h-11"
            placeholder="Cohort invite code (optional)"
            value={f.code}
            onChange={(e) => set("code")(e.target.value)}
          />
        </div>
      ),
    },
  ];
  const startUpSteps = [
    {
      title: "What's your company called?",
      hint: "A working name is fine.",
      ok: f.name.trim(),
      body: (
        <Input
          autoFocus
          className="h-11"
          placeholder="e.g. StudyBuddy"
          value={f.name}
          onChange={(e) => set("name")(e.target.value)}
        />
      ),
    },
    {
      title: "Describe the idea in two sentences.",
      hint: "What it is, and why it matters.",
      ok: f.idea.trim(),
      body: (
        <Textarea
          rows={4}
          placeholder="Bite-sized revision quizzes for Highers students…"
          value={f.idea}
          onChange={(e) => set("idea")(e.target.value)}
        />
      ),
    },
    {
      title: "Who's your target customer?",
      hint: "Be specific.",
      ok: f.customer.trim() && f.type,
      body: (
        <div className="space-y-3">
          <Input
            className="h-11"
            placeholder="S5–S6 students in Scotland"
            value={f.customer}
            onChange={(e) => set("customer")(e.target.value)}
          />
          <Choice options={["B2C", "B2B"]} value={f.type} onChange={set("type")} />
          {f.type && (
            <p className="text-xs text-muted-foreground">
              Enabled by default: {businessDefaults(f.type as "B2B" | "B2C").join(", ")}
            </p>
          )}
        </div>
      ),
    },
    {
      title: "Where are you right now?",
      hint: "Sol will tailor tonight's work.",
      ok: f.stage,
      body: (
        <div className="space-y-4">
          <Choice options={STAGE_OPTS} value={f.stage} onChange={set("stage")} />
          {sectorPicker}
          {f.sector !== "general" && (
            <p className="text-xs text-warning">Regulated sector · stricter claims checks</p>
          )}
        </div>
      ),
    },
    {
      title: "Main goal for the next 90 days?",
      hint: "One measurable outcome works best.",
      ok: f.goal.trim(),
      body: (
        <Input
          className="h-11"
          placeholder="500 weekly active students"
          value={f.goal}
          onChange={(e) => set("goal")(e.target.value)}
        />
      ),
    },
    {
      title: "A couple of optional extras",
      hint: "Skip if you don't have them.",
      ok: true,
      body: (
        <div className="space-y-3">
          <Input
            className="h-11"
            placeholder="Existing website (https://…)"
            value={f.url}
            onChange={(e) => set("url")(e.target.value)}
          />
          <Input
            className="h-11"
            placeholder="Cohort invite code"
            value={f.code}
            onChange={(e) => set("code")(e.target.value)}
          />
        </div>
      ),
    },
  ];
  const steps = [
    pathStep,
    ...(path === "keep_going" ? keepGoingSteps : path === "start_up" ? startUpSteps : []),
  ];
  const s = steps[step] ?? steps[0]!;
  const last = step === steps.length - 1;

  // Every answer is kept, including stage, website and cohort code (bug B6).
  const finish = async () => {
    setSaving(true);
    const keepGoing = path === "keep_going";
    const handles = Object.fromEntries(
      (
        [
          ["instagram", f.instagram],
          ["tiktok", f.tiktok],
          ["linkedin", f.linkedin],
          ["facebook", f.facebook],
        ] as const
      ).filter(([, v]) => v.trim()),
    );
    const id = await createCompany({
      name: f.name.trim(),
      description: f.idea.trim(),
      customer_type: f.type as "B2B" | "B2C",
      target_customer: f.customer,
      goal_90d: f.goal,
      sector: f.sector as Sector,
      starting_stage: keepGoing ? "Trading" : f.stage || null,
      existing_website_url: f.url.trim() || null,
      cohort_code: f.code.trim() || undefined,
      entry_path: keepGoing ? "keep_going" : "start_up",
      social_handles: handles,
      google_business_url: f.google.trim() || null,
    });
    if (id && keepGoing) {
      if (contacts?.rows.length) {
        const added = await importContacts(id, contacts.rows);
        if (added !== null) toast.success(`Imported ${added} contacts.`);
      }
      for (const email of f.emails
        .split(/\n-{3,}\n|\n{3,}/)
        .map((e) => e.trim())
        .filter(Boolean))
        await addVoiceSource(id, "email", email);
    }
    setSaving(false);
    if (id) void navigate({ to: "/hq" });
  };

  return (
    <div className="flex min-h-screen flex-col px-6 py-8">
      <BrandLogo />
      <div className="mx-auto flex w-full max-w-lg flex-1 flex-col justify-center">
        <div className="mb-8 flex gap-1.5">
          {steps.map((_, i) => (
            <span
              key={i}
              className={cn("h-1 flex-1 rounded-full", i <= step ? "bg-primary" : "bg-muted")}
            />
          ))}
        </div>
        <div className="mb-6 flex items-center gap-2 text-sm text-muted-foreground">
          <SolAvatar size={22} />
          Sol · step {step + 1} of {steps.length}
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">{s.title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{s.hint}</p>
        <form
          className="mt-6"
          onSubmit={(e) => {
            e.preventDefault();
            if (!s.ok) return;
            if (last) void finish();
            else setStep(step + 1);
          }}
        >
          {s.body}
          <div className="mt-8 flex justify-between">
            <Button
              type="button"
              variant="ghost"
              disabled={step === 0}
              onClick={() => setStep(step - 1)}
            >
              <ArrowLeft className="h-4 w-4" />
              Back
            </Button>
            <Button type="submit" disabled={!s.ok || saving}>
              {last ? "Create company" : "Continue"}
              <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </form>
        {last && (
          <p className="mt-4 text-xs text-muted-foreground">
            {path === "keep_going"
              ? "You'll start at the Grow phase. Sol learns your voice and proposes how to reply to customers before it talks to anyone."
              : mode === "demo"
                ? "Your company starts at the Idea stage with 1,500 welcome credits."
                : "Your company starts at the Idea stage. Choose a plan in Billing, or use your cohort's credits if you have a code."}
          </p>
        )}
      </div>
    </div>
  );
}
