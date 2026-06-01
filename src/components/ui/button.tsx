import * as React from "react";

import { cn } from "@/lib/utils";

type ButtonVariant = "primary" | "ghost" | "outline" | "danger";
type ButtonSize = "default" | "sm" | "lg";

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    "bg-[var(--accent-primary)] text-black border border-[var(--accent-primary)] shadow-[0_10px_24px_rgba(0,255,179,0.2)] hover:bg-[#78ffd7] hover:border-[#78ffd7]",
  ghost:
    "bg-transparent border border-transparent text-[var(--foreground)] hover:bg-white/5",
  outline:
    "bg-[var(--panel-2)] border border-[var(--border)] text-[var(--foreground)] hover:border-[var(--accent-secondary)] hover:text-[var(--accent-secondary)]",
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
          "inline-flex items-center justify-center rounded-lg font-bold tracking-[0.11em] uppercase transition-all duration-250 disabled:opacity-50 disabled:pointer-events-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-secondary)]/55",
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
