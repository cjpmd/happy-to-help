import { useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useStore } from "@/lib/store";
import { localTime } from "@/lib/schedule";

/** Today's 07:00 brief at the top of HQ, until it's dismissed (Phase 8). */
export function BriefCard({ companyId }: { companyId: string }) {
  const { db, now } = useStore();
  const today = localTime(now).date;
  const brief = db.briefs.find((b) => b.company_id === companyId && b.brief_date === today);
  const [hidden, setHidden] = useState<string | null>(null);
  if (!brief || hidden === `${companyId}:${today}`) return null;
  return (
    <section
      aria-label="Morning brief"
      className="relative rounded-card border bg-card px-4 py-3 shadow-card"
    >
      <Button
        size="icon"
        variant="ghost"
        className="absolute right-1.5 top-1.5 h-7 w-7"
        aria-label="Dismiss the morning brief"
        onClick={() => setHidden(`${companyId}:${today}`)}
      >
        <X className="h-3.5 w-3.5" />
      </Button>
      <h2 className="label-caps text-[12px] tracking-[0.16em] text-muted-foreground">
        Morning brief
      </h2>
      <p className="mt-1.5 whitespace-pre-line pr-6 text-sm leading-relaxed">{brief.content}</p>
    </section>
  );
}
