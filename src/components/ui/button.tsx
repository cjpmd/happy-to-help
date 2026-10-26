import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "label-caps inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-tile text-[13px] tracking-[0.14em] cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50 disabled:cursor-not-allowed pointer-coarse:min-h-11 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        // Primary: ink fill, surface text.
        default: "bg-primary text-primary-foreground hover:bg-primary/85",
        destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/90",
        // Secondary: surface with a line border.
        outline: "border border-line bg-surface text-ink hover:bg-soft",
        secondary: "border border-line bg-surface text-ink hover:bg-soft",
        ghost: "text-ink hover:bg-soft",
        link: "text-ink underline-offset-4 hover:underline",
      },
      size: {
        default: "min-h-[34px] px-4",
        sm: "min-h-[30px] px-3 text-[11px]",
        lg: "min-h-11 px-6",
        icon: "size-[34px] pointer-coarse:size-11",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
