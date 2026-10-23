import { useId, useState, type FormEvent } from "react";
import { Link } from "@tanstack/react-router";
import { MessagesSquare } from "lucide-react";
import { useBalance, useStore } from "@/lib/store";
import { ACTION_COSTS, actionQuote } from "@/lib/credits";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { SolChat } from "./SolChat";

/** The HQ's "Ask Sol" bar. Sending opens the conversation in a side sheet. */
export function AskSolBar({ companyId }: { companyId: string }) {
  const { sendChat, solTyping } = useStore();
  const balance = useBalance(companyId);
  const quote = actionQuote(balance, ACTION_COSTS.chat);
  const [text, setText] = useState("");
  const [open, setOpen] = useState(false);
  const inputId = useId();

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const message = text.trim();
    if (message && quote.affordable && !solTyping) {
      void sendChat(companyId, message);
      setText("");
    }
    setOpen(true);
  };

  return (
    <>
      <form
        onSubmit={submit}
        className="flex items-center gap-3 rounded-[8px] border bg-surface py-1.5 pl-4 pr-1.5 shadow-card"
      >
        <label
          htmlFor={inputId}
          className="label-caps shrink-0 text-[12px] tracking-[0.16em] text-muted-foreground"
        >
          Ask Sol
        </label>
        <input
          id={inputId}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Plan, write, check or build something…"
          className="min-h-[34px] min-w-0 flex-1 bg-transparent text-ink outline-none placeholder:text-muted-foreground"
        />
        {quote.affordable ? (
          <span className="label-caps hidden text-[11px] text-muted-foreground tab:inline">
            ≈ {ACTION_COSTS.chat} CR
          </span>
        ) : (
          <Link to="/billing" className="label-caps text-[11px] text-hold">
            Top up to ask
          </Link>
        )}
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Open conversation with Sol"
          onClick={() => setOpen(true)}
        >
          <MessagesSquare />
        </Button>
        <Button type="submit" className="px-[18px]" disabled={solTyping}>
          Send
        </Button>
      </form>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-md">
          <SheetTitle className="sr-only">Sol</SheetTitle>
          <SheetDescription className="sr-only">Your conversation with Sol</SheetDescription>
          <SolChat companyId={companyId} fill />
        </SheetContent>
      </Sheet>
    </>
  );
}
