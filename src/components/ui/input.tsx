import * as React from "react";

import { cn } from "@/lib/utils";

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "flex h-[34px] w-full py-1 text-base transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground disabled:cursor-not-allowed disabled:opacity-50 pointer-coarse:h-11 md:text-sm rounded-tile border border-line bg-surface px-3 shadow-none placeholder:text-muted-foreground focus-visible:outline-none focus-visible:border-ink focus-visible:ring-1 focus-visible:ring-ink",
          className,
        )}
        ref={ref}
        {...props}
      />
    );
  },
);
Input.displayName = "Input";

export { Input };
