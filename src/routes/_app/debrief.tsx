import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { PageHeader } from "@/components/mission/primitives";
import { DebriefRecorder, FollowUpQuestions, ReviewCard } from "@/components/mission/Capture";
import { useStore } from "@/lib/store";
import { pageHead } from "@/lib/seo";

export const Route = createFileRoute("/_app/debrief")({
  head: () => pageHead("Debrief", "Tell Sol what happened in your meeting."),
  component: Debrief,
});

/** Debrief mode (SPEC P): mobile-first. Talk, answer up to two questions, accept. */
function Debrief() {
  const { db } = useStore();
  const [captureId, setCaptureId] = useState<string | null>(null);
  const cap = captureId ? db.captures.find((c) => c.id === captureId) : undefined;
  return (
    <div className="mx-auto max-w-lg">
      <PageHeader
        title="Debrief"
        description="Just had a meeting? Tell Sol what happened. It'll pick out who's doing what and ask if anything's missing."
      />
      {!cap ? (
        <DebriefRecorder onAdded={setCaptureId} />
      ) : cap.status === "transcribing" || cap.status === "extracting" ? (
        <p className="rounded-card border bg-card p-4 text-sm shadow-card" role="status">
          Sol is {cap.status === "transcribing" ? "listening to" : "reading"} your debrief…
        </p>
      ) : cap.status === "failed" ? (
        <p className="rounded-card border bg-card p-4 text-sm shadow-card" role="alert">
          That didn't work ({cap.error ?? "an error on our side"}). Nothing was charged.
        </p>
      ) : (
        <div className="space-y-4">
          <FollowUpQuestions captureId={cap.id} />
          <ReviewCard captureId={cap.id} />
          <p className="text-center text-sm">
            <button type="button" className="underline" onClick={() => setCaptureId(null)}>
              Record another
            </button>{" "}
            · <Link to="/meetings">All meetings</Link>
          </p>
        </div>
      )}
    </div>
  );
}
