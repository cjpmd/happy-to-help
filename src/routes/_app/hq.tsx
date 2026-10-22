import { createFileRoute } from "@tanstack/react-router";
import { CompanyHQ } from "@/components/dawn/CompanyHQ";
import { useStore } from "@/lib/store";
import { pageHead } from "@/lib/seo";

export const Route = createFileRoute("/_app/hq")({
  head: () =>
    pageHead(
      "Company HQ",
      "Your stage, website, Sol chat, approvals and overnight activity in one place.",
    ),
  component: HQ,
});

function HQ() {
  const { companyId } = useStore();
  return <CompanyHQ companyId={companyId} />;
}
