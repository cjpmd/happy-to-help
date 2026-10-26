import { useEffect, useId, useState, type FormEvent } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { MessagesSquare, Mic } from "lucide-react";
import { toast } from "sonner";
import { useBalance, useStore, useEstimate } from "@/lib/store";
import { actionQuote } from "@/lib/credits";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { SolChat } from "./SolChat";
import { useRecorder } from "./Capture";
import { cn } from "@/lib/utils";

/** The HQ's "Ask Sol" bar. Sending opens the conversation in a side sheet. */
export function AskSolBar({
  companyId,
  open: openProp,
  onOpenChange,
}: {
  companyId: string;
  /** Control the conversation sheet from outside, e.g. so WHY on an approval can open it. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const { sendChat, solTyping } = useStore();
  const chatCost = useEstimate("chat");
  const balance = useBalance(companyId);
  const quote = actionQuote(balance, chatCost);
  const [text, setText] = useState("");
  const [openState, setOpenState] = useState(false);
  const open = openProp ?? openState;
  const setOpen = onOpenChange ?? setOpenState;
  const inputId = useId();
  const voice = useVoiceNote(companyId);

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
            ≈ {chatCost} CR
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
          aria-label={voice.recording ? "Recording: release to send" : "Hold to talk to Sol"}
          title="Hold to talk"
          className={cn(voice.recording && "bg-hold-bg text-hold")}
          {...voice.handlers}
        >
          <Mic />
        </Button>
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

/**
 * Hold the mic to talk instead of type (SPEC P): the note goes to Sol as a voice note and comes
 * back as a "From your note" review card. Where recording isn't available (the demo, or a
 * browser without a microphone) it opens Debrief to type instead.
 */
function useVoiceNote(companyId: string) {
  const { createCapture, mode } = useStore();
  const navigate = useNavigate();
  const rec = useRecorder();
  const available = mode === "live" && rec.supported;
  const { result, reset } = rec;
  useEffect(() => {
    if (!result) return;
    reset();
    void createCapture({
      companyId,
      source: "voice_note",
      consent: "own_voice",
      audio: result.blob,
      durationSeconds: result.seconds,
    }).then((id) => id && toast.success("Sent. Sol will put what it hears in GO / NO-GO."));
  }, [result, reset, createCapture, companyId]);
  return {
    recording: rec.recording,
    handlers: available
      ? {
          onPointerDown: () => void rec.start(),
          onPointerUp: () => rec.recording && rec.stop(),
          onPointerLeave: () => rec.recording && rec.stop(),
          onKeyDown: (e: React.KeyboardEvent) => {
            if ((e.key === " " || e.key === "Enter") && !rec.recording) {
              e.preventDefault();
              void rec.start();
            }
          },
          onKeyUp: (e: React.KeyboardEvent) => {
            if ((e.key === " " || e.key === "Enter") && rec.recording) rec.stop();
          },
        }
      : { onClick: () => void navigate({ to: "/debrief" }) },
  };
}
