import { useEffect, useRef, useState } from "react";
import { ArrowUp } from "lucide-react";
import { useStore } from "@/lib/store";
import { fmtTime } from "@/lib/format";
import { SolAvatar } from "./primitives";
import { cn } from "@/lib/utils";

export function SolChat({ companyId, readOnly }: { companyId: string; readOnly?: boolean }) {
  const { db, sendChat, solTyping } = useStore();
  const [text, setText] = useState("");
  const msgs = db.chat_messages.filter((m) => m.company_id === companyId);
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => { endRef.current?.scrollIntoView({ block: "nearest" }); }, [msgs.length, solTyping]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
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
        <form onSubmit={submit} className="flex items-center gap-2 border-t p-2">
          <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Ask Sol anything…" className="h-9 flex-1 rounded-lg bg-transparent px-2 text-sm outline-none placeholder:text-muted-foreground" />
          <button type="submit" disabled={!text.trim()} aria-label="Send" className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground transition-opacity disabled:opacity-30">
            <ArrowUp className="h-4 w-4" />
          </button>
        </form>
      )}
    </section>
  );
}
