import { useState } from "react";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useCompany, useCompanyRole, useStore } from "@/lib/store";
import type { IntegrationProvider } from "@/lib/storeContext";
import { Pill } from "./primitives";

const PROVIDERS: { id: IntegrationProvider; name: string; what: string; on: string }[] = [
  {
    id: "resend",
    name: "Email (Resend)",
    what: "Sends the emails you approve from your own address, and brings replies into Customers.",
    on: "Approved emails really go out.",
  },
  {
    id: "ayrshare",
    name: "Social (Ayrshare)",
    what: "Publishes approved posts to your own accounts and brings back how they did.",
    on: "Approved posts really publish.",
  },
  {
    id: "posthog",
    name: "Site analytics (PostHog)",
    what: "Daily visitors and signups for your hub page and site, only from visitors who allow it.",
    on: "Telemetry uses your real numbers.",
  },
];

/** Settings → Integrations: each provider is off (mocked) until a founder switches it on. */
export function IntegrationsSection() {
  const { db, companyId, setIntegration } = useStore();
  const company = useCompany();
  const founder = useCompanyRole(companyId) === "founder";
  const setting = (p: IntegrationProvider) =>
    db.integration_settings.find((x) => x.company_id === companyId && x.provider === p);
  const ready = (p: IntegrationProvider) =>
    db.platform_integrations.find((x) => x.provider === p)?.configured ?? false;
  const resend = setting("resend");
  const [fromName, setFromName] = useState(resend?.config.from_name ?? company.name);
  const [replyTo, setReplyTo] = useState(resend?.config.reply_to ?? "");
  const inbound = import.meta.env["VITE_INBOUND_DOMAIN"] as string | undefined;
  return (
    <>
      <h2 className="mt-8 font-medium" id="integrations">
        Integrations
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Until you switch one on, Sol uses a stand-in and nothing leaves {company.name}.
      </p>
      {PROVIDERS.map((p) => {
        const s = setting(p.id);
        return (
          <div key={p.id} className="border-b py-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="flex items-center gap-2 text-sm">
                  {p.name}
                  <Pill tone={ready(p.id) ? "success" : "neutral"}>
                    {ready(p.id) ? "Available" : "Not set up yet"}
                  </Pill>
                </p>
                <p className="text-xs text-muted-foreground">
                  {p.what} {s?.enabled && ready(p.id) ? p.on : ""}
                </p>
              </div>
              <Switch
                checked={s?.enabled ?? false}
                disabled={!founder}
                aria-label={p.name}
                onCheckedChange={(v) =>
                  void setIntegration(companyId, p.id, v).then(
                    (ok) =>
                      ok &&
                      toast.success(
                        v
                          ? ready(p.id)
                            ? `${p.name} is on`
                            : `${p.name} is on, and starts working once the platform sets it up`
                          : `${p.name} is off`,
                      ),
                  )
                }
              />
            </div>
            {p.id === "resend" && founder && (
              <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
                <Input
                  value={fromName}
                  onChange={(e) => setFromName(e.target.value)}
                  aria-label="Send as"
                  placeholder="Send as"
                />
                <Input
                  value={replyTo}
                  onChange={(e) => setReplyTo(e.target.value)}
                  aria-label="Replies go to"
                  placeholder="Replies go to (your email)"
                  type="email"
                />
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    void setIntegration(companyId, "resend", resend?.enabled ?? false, {
                      from_name: fromName.trim() || company.name,
                      ...(replyTo.trim() ? { reply_to: replyTo.trim() } : {}),
                    }).then((ok) => ok && toast.success("Email settings saved"))
                  }
                >
                  Save
                </Button>
                {inbound && (
                  <p className="text-xs text-muted-foreground sm:col-span-3">
                    Customers can email {company.slug}@{inbound}; Sol files it in Customers.
                  </p>
                )}
              </div>
            )}
          </div>
        );
      })}
    </>
  );
}
