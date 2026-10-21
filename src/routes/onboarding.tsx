import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { DawnLogo, SolAvatar } from "@/components/dawn/primitives";
import { useStore } from "@/lib/store";
import { pageHead } from "@/lib/seo";
import { businessDefaults, type Sector } from "@/lib/workspace";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/onboarding")({
  head: () => pageHead("Set up your company", "Tell Sol about your startup idea in a few short steps."),
  component: Onboarding,
});

const STAGE_OPTS = ["Just an idea", "Talking to customers", "Building something", "Have users"];

function Choice({ options, value, onChange }: { options: string[]; value: string; onChange: (v: string) => void }) {
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {options.map((o) => (
        <button type="button" key={o} onClick={() => onChange(o)}
          className={cn("rounded-lg border px-4 py-3 text-left text-sm transition-colors", value === o ? "border-primary bg-primary-soft font-medium" : "hover:bg-muted")}>{o}</button>
      ))}
    </div>
  );
}

function Onboarding() {
  const { createCompany } = useStore();
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [f, setF] = useState({ name: "", idea: "", customer: "", type: "", stage: "", goal: "", url: "", code: "", sector: "general" });
  const set = (k: keyof typeof f) => (v: string) => setF((s) => ({ ...s, [k]: v }));

  const steps = [
    { title: "What's your company called?", hint: "A working name is fine.", ok: f.name.trim(), body: <Input autoFocus className="h-11" placeholder="e.g. StudyBuddy" value={f.name} onChange={(e) => set("name")(e.target.value)} /> },
    { title: "Describe the idea in two sentences.", hint: "What it is, and why it matters.", ok: f.idea.trim(), body: <Textarea rows={4} placeholder="Bite-sized revision quizzes for Highers students…" value={f.idea} onChange={(e) => set("idea")(e.target.value)} /> },
    { title: "Who's your target customer?", hint: "Be specific.", ok: f.customer.trim() && f.type, body: <div className="space-y-3"><Input className="h-11" placeholder="S5–S6 students in Scotland" value={f.customer} onChange={(e) => set("customer")(e.target.value)} /><Choice options={["B2C", "B2B"]} value={f.type} onChange={set("type")} />{f.type&&<p className="text-xs text-muted-foreground">Enabled by default: {businessDefaults(f.type as "B2B"|"B2C").join(", ")}</p>}</div> },
    { title: "Where are you right now?", hint: "Sol will tailor tonight's work.", ok: f.stage, body: <div className="space-y-4"><Choice options={STAGE_OPTS} value={f.stage} onChange={set("stage")} /><label className="block text-sm">Sector pack<select aria-label="Sector pack" value={f.sector} onChange={e=>set("sector")(e.target.value)} className="mt-2 h-10 w-full rounded-md border bg-background px-3"><option value="general">General</option><option value="legal">Legal</option><option value="finance">Finance</option><option value="health">Health</option><option value="education">Education</option></select></label>{f.sector!=="general"&&<p className="text-xs text-warning">Regulated sector · stricter claims checks</p>}</div> },
    { title: "Main goal for the next 90 days?", hint: "One measurable outcome works best.", ok: f.goal.trim(), body: <Input className="h-11" placeholder="500 weekly active students" value={f.goal} onChange={(e) => set("goal")(e.target.value)} /> },
    { title: "A couple of optional extras", hint: "Skip if you don't have them.", ok: true, body: <div className="space-y-3"><Input className="h-11" placeholder="Existing website (https://…)" value={f.url} onChange={(e) => set("url")(e.target.value)} /><Input className="h-11" placeholder="Cohort invite code" value={f.code} onChange={(e) => set("code")(e.target.value)} /></div> },
  ];
  const s = steps[step] ?? steps[0]!;
  const last = step === steps.length - 1;

  const finish = () => {
    createCompany({ name: f.name.trim(), description: f.idea.trim(), customer_type: f.type as "B2B" | "B2C", target_customer: f.customer, goal_90d: f.goal, sector: f.sector as Sector });
    navigate({ to: "/hq" });
  };

  return (
    <div className="flex min-h-screen flex-col px-6 py-8">
      <DawnLogo />
      <div className="mx-auto flex w-full max-w-lg flex-1 flex-col justify-center">
        <div className="mb-8 flex gap-1.5">{steps.map((_, i) => <span key={i} className={cn("h-1 flex-1 rounded-full", i <= step ? "bg-primary" : "bg-muted")} />)}</div>
        <div className="mb-6 flex items-center gap-2 text-sm text-muted-foreground"><SolAvatar size={22} />Sol · step {step + 1} of {steps.length}</div>
        <h1 className="text-2xl font-semibold tracking-tight">{s.title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{s.hint}</p>
        <form className="mt-6" onSubmit={(e) => { e.preventDefault(); if (!s.ok) return; last ? finish() : setStep(step + 1); }}>
          {s.body}
          <div className="mt-8 flex justify-between">
            <Button type="button" variant="ghost" disabled={step === 0} onClick={() => setStep(step - 1)}><ArrowLeft className="h-4 w-4" />Back</Button>
            <Button type="submit" disabled={!s.ok}>{last ? "Create company" : "Continue"}<ArrowRight className="h-4 w-4" /></Button>
          </div>
        </form>
        {last && <p className="mt-4 text-xs text-muted-foreground">Your company starts at the Idea stage with 1,500 welcome credits.</p>}
      </div>
    </div>
  );
}
