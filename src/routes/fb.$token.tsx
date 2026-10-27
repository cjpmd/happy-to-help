import { useEffect, useState, type FormEvent } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useStore } from "@/lib/store";
import type { PublicFeedbackRequest } from "@/lib/storeContext";
import { pageHead } from "@/lib/seo";
import { cn } from "@/lib/utils";

// The public feedback page a customer opens from a feedback request (Phase 16). One answer per
// link; nothing else about them is shown or asked.
export const Route = createFileRoute("/fb/$token")({
  head: () => pageHead("How did we do?", "Tell us how we did."),
  component: FeedbackForm,
});

function FeedbackForm() {
  const { token } = Route.useParams();
  const { fetchFeedbackRequest, submitFeedback } = useStore();
  const [req, setReq] = useState<PublicFeedbackRequest | null | undefined>(undefined);
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    void fetchFeedbackRequest(token).then(setReq);
  }, [token, fetchFeedbackRequest]);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!rating) return;
    setBusy(true);
    const ok = await submitFeedback(token, rating, comment);
    setBusy(false);
    if (ok) setSent(true);
  };
  if (req === undefined) return <main aria-busy="true" />;
  return (
    <main className="mx-auto max-w-md space-y-4 p-6">
      {!req ? (
        <p className="text-sm text-muted-foreground">This feedback link isn't valid any more.</p>
      ) : sent || req.done ? (
        <>
          <h1 className="text-xl font-semibold">Thank you{req.name ? `, ${req.name}` : ""}.</h1>
          <p className="text-sm text-muted-foreground">{req.company} will read every word.</p>
        </>
      ) : (
        <form className="space-y-4" onSubmit={(e) => void submit(e)}>
          <h1 className="text-xl font-semibold">How did {req.company} do?</h1>
          <fieldset>
            <legend className="mb-2 text-sm">Your rating</legend>
            <div className="flex gap-1" role="radiogroup">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  role="radio"
                  aria-checked={rating === n}
                  aria-label={`${n} out of 5`}
                  onClick={() => setRating(n)}
                  className="rounded p-1"
                >
                  <Star
                    aria-hidden
                    className={cn(
                      "h-7 w-7",
                      n <= rating ? "fill-current" : "text-muted-foreground",
                    )}
                  />
                </button>
              ))}
            </div>
          </fieldset>
          <Textarea
            aria-label="Anything you'd like to tell us (optional)"
            placeholder="Anything you'd like to tell us (optional)"
            maxLength={2000}
            value={comment}
            onChange={(e) => setComment(e.target.value)}
          />
          <Button type="submit" disabled={!rating || busy}>
            Send
          </Button>
          <p className="text-xs text-muted-foreground">Your answer goes only to {req.company}.</p>
        </form>
      )}
    </main>
  );
}
