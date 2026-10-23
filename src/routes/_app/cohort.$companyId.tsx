import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowLeft, Eye } from "lucide-react";
import { useStore } from "@/lib/store";
import { CompanyHQ } from "@/components/mission/CompanyHQ";
import { Panel } from "@/components/mission/primitives";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { pageHead } from "@/lib/seo";
import { fmtDateTime } from "@/lib/format";

export const Route = createFileRoute("/_app/cohort/$companyId")({
  head: () =>
    pageHead(
      "Company overview",
      "Read-only company HQ for mentors, with stage gate approvals and comments.",
    ),
  component: MentorCompany,
});

function MentorCompany() {
  const { companyId } = Route.useParams();
  const { db, addComment } = useStore();
  const [text, setText] = useState("");
  const comments = db.gate_comments.filter((c) => c.company_id === companyId);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Link
          to="/cohort"
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Cohort
        </Link>
        <span className="flex items-center gap-1.5 rounded-full bg-muted px-3 py-1 text-xs text-muted-foreground">
          <Eye className="h-3.5 w-3.5" />
          Mentor view · read-only
        </span>
      </div>
      <CompanyHQ companyId={companyId} readOnly />
      <Panel title="Mentor comments">
        <ul className="space-y-3">
          {comments.map((c) => (
            <li key={c.id} className="text-sm">
              <p>
                <span className="font-medium">{c.author}</span>{" "}
                <span className="text-xs text-muted-foreground">{fmtDateTime(c.created_at)}</span>
              </p>
              <p className="mt-0.5 text-muted-foreground">{c.text}</p>
            </li>
          ))}
          {!comments.length && <li className="text-sm text-muted-foreground">No comments yet.</li>}
        </ul>
        <form
          className="mt-4 flex flex-col gap-2 sm:flex-row"
          onSubmit={(e) => {
            e.preventDefault();
            if (text.trim()) {
              addComment(companyId, text.trim());
              setText("");
            }
          }}
        >
          <Textarea
            rows={2}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Leave feedback for the founder…"
            className="flex-1"
          />
          <Button type="submit" className="sm:self-end">
            Comment
          </Button>
        </form>
      </Panel>
    </div>
  );
}
