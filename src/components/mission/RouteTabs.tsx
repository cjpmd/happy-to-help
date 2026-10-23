import type { ReactNode } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

/**
 * Tabs whose current tab lives in the URL (?tab=…), so links, refresh and the
 * back button all land on the right tab. The route owns the search param.
 */
export function RouteTabs<T extends string>({
  label,
  value,
  onValueChange,
  tabs,
}: {
  label: string;
  value: T;
  onValueChange: (value: T) => void;
  tabs: { value: T; label: string; content: ReactNode }[];
}) {
  return (
    <Tabs value={value} onValueChange={(v) => onValueChange(v as T)}>
      <TabsList aria-label={label}>
        {tabs.map((t) => (
          <TabsTrigger key={t.value} value={t.value}>
            {t.label}
          </TabsTrigger>
        ))}
      </TabsList>
      {tabs.map((t) => (
        <TabsContent key={t.value} value={t.value} className="mt-3.5">
          {t.content}
        </TabsContent>
      ))}
    </Tabs>
  );
}
