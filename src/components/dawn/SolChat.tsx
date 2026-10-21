import { useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowUp } from "lucide-react";
import { useStore, useBalance } from "@/lib/store";
import { fmtTime } from "@/lib/format";
import { SolAvatar } from "./primitives";
import { Button } from '@/components/ui/button';
import { Link } from '@tanstack/react-router';
import { ACTION_COSTS, actionQuote } from '@/lib/credits';
import { Why } from './WorkControls';
import { cn } from "@/lib/utils";

export function SolChat({ companyId, readOnly }: { companyId: string; readOnly?: boolean }) {
  const { db, sendChat, solTyping } = useStore();
  const balance = useBalance(companyId);
  const quote = actionQuote(balance,ACTION_COSTS.chat);
  const [text, setText] = useState("");
  const msgs = db.chat_messages.filter((m) => m.company_id === companyId);
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => { endRef.current?.scrollIntoView({ block: "nearest" }); }, [msgs.length, solTyping]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!text.trim() || !quote.affordable || solTyping) return;
    void sendChat(companyId, text.trim());
    setText("");
  };

  return (
    <section className="flex flex-col rounded-xl border bg-card shadow-card">
      <header className="flex items-center gap-2.5 border-b px-4 py-3">
        <SolAvatar size={28} />
        <div className="leading-tight">
          <p className="text-sm font-medium">Sol</p>
          <p className="text-[11px] text-muted-foreground">Your AI cofounder · powered by Claude</p>
        </div>
      </header>
      <div className="max-h-72 min-h-40 space-y-3 overflow-y-auto px-4 py-3">
        {msgs.map((m) => (
          <div key={m.id} className={cn("flex gap-2", m.sender === "founder" && "justify-end")}>
            {m.sender === "sol" && <SolAvatar size={20} className="mt-0.5" />}
            <div className={cn("max-w-[85%] rounded-2xl px-3 py-2 text-sm leading-relaxed", m.sender === "sol" ? "rounded-tl-sm bg-muted" : "rounded-tr-sm bg-primary text-primary-foreground")}>
              {m.content}
              {m.sender === "sol" && <Why />}
              <span className={cn("mt-1 block text-[10px] tabular", m.sender === "sol" ? "text-muted-foreground" : "text-primary-foreground/70")}>{fmtTime(m.created_at)}</span>
            </div>
          </div>
        ))}
        {solTyping && (
          <div className="flex items-center gap-2"><SolAvatar size={20} /><span className="animate-pulse text-xs text-muted-foreground">Sol is thinking…</span></div>
        )}
        <div ref={endRef} />
      </div>
      {!readOnly && (
        <form onSubmit={submit} className="border-t p-2">
          <div className="flex items-center gap-2"><input aria-label="Message Sol" value={text} onChange={(e) => setText(e.target.value)} placeholder="Ask Sol anything…" className="h-9 flex-1 rounded-lg bg-transparent px-2 text-sm outline-none placeholder:text-muted-foreground" />
          <Button type="submit" disabled={!text.trim()||!quote.affordable||solTyping} aria-label="Send · ≈ 10 credits" className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground transition-opacity disabled:opacity-30">
            <ArrowUp className="h-4 w-4" />
          </Button></div>
          <p className="px-2 pt-1 text-[10px] text-muted-foreground">≈ 10 credits · {quote.affordable?`${quote.after.toLocaleString("en-GB")} left after`:"Insufficient credits"} {!quote.affordable&&<Link to="/billing" className="text-primary underline">Top up</Link>}</p>
        </form>
      )}
    </section>
  );
}
