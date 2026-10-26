import * as React from "react";

import { cn } from "@/lib/utils";

const Textarea = React.forwardRef<HTMLTextAreaElement, React.ComponentProps<"textarea">>(
  ({ className, ...props }, ref) => {
    return (
      <textarea
        className={cn(
          "flex min-h-[60px] w-full py-2 text-base disabled:cursor-not-allowed disabled:opacity-50 md:text-sm rounded-tile border border-line bg-surface px-3 shadow-none placeholder:text-muted-foreground focus-visible:outline-none focus-visible:border-ink focus-visible:ring-1 focus-visible:ring-ink",
          className,
        )}
        ref={ref}
        {...props}
      />
    );
  },
);
Textarea.displayName = "Textarea";

export { Textarea };
