import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { LeadFormView } from "@/components/mission/LinkLayer";
import { useStore } from "@/lib/store";
import type { PublicForm } from "@/lib/links";
import { pageHead } from "@/lib/seo";

// An embeddable lead form (in an iframe on the company's own website).
export const Route = createFileRoute("/f/$formId")({
  validateSearch: (s: Record<string, unknown>): { l?: string } =>
    typeof s["l"] === "string" && /^[A-Za-z0-9]{6,12}$/.test(s["l"]) ? { l: s["l"] } : {},
  head: () => pageHead("Get in touch", "Send a message."),
  component: EmbeddedForm,
});

function EmbeddedForm() {
  const { formId } = Route.useParams();
  const { l } = Route.useSearch();
  const { fetchForm } = useStore();
  const [form, setForm] = useState<PublicForm | null | undefined>(undefined);
  useEffect(() => {
    void fetchForm(formId).then(setForm);
  }, [formId, fetchForm]);
  if (form === undefined) return <main aria-busy="true" />;
  return (
    <main className="mx-auto max-w-md p-3">
      {form ? (
        <LeadFormView form={form} linkCode={l} page={`/f/${form.id}`} />
      ) : (
        <p className="text-sm text-muted-foreground">This form isn't taking enquiries.</p>
      )}
    </main>
  );
}
