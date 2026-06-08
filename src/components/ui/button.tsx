import * as React from "react";

import { cn } from "@/lib/utils";

type ButtonVariant = "primary" | "ghost" | "outline" | "danger";
type ButtonSize = "default" | "sm" | "lg";

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    "bg-[var(--accent-primary)] text-[#101316] border border-[var(--accent-primary)] shadow-[0_8px_18px_rgba(0,0,0,0.18)] hover:bg-[#96dfba] hover:border-[#96dfba]",
  ghost:
    "bg-transparent border border-transparent text-[var(--foreground)] hover:bg-white/5",
  outline:
    "bg-[#050607] border border-[var(--border)] text-[var(--foreground)] hover:border-[var(--accent-primary)] hover:text-[var(--accent-primary)]",
  danger:
    "bg-[var(--danger)] text-white border border-[var(--danger)] hover:bg-transparent hover:text-[var(--danger)]",
};

const sizeClasses: Record<ButtonSize, string> = {
  default: "h-11 px-5 text-[0.78rem]",
  sm: "h-9 px-3 text-[0.68rem]",
  lg: "h-12 px-6 text-[0.8rem]",
};

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "primary", size = "default", ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(
          "inline-flex items-center justify-center rounded-md font-semibold tracking-normal transition-all duration-200 disabled:opacity-50 disabled:pointer-events-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-primary)]/45",
          variantClasses[variant],
          sizeClasses[size],
          className,
        )}
        {...props}
      />
    );
  },
);

Button.displayName = "Button";
