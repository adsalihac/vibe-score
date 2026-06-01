import * as React from "react";

import { cn } from "@/lib/utils";

type ButtonVariant = "primary" | "ghost" | "outline" | "danger";
type ButtonSize = "default" | "sm" | "lg";

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    "bg-[var(--accent-primary)] text-black border border-[var(--accent-primary)] hover:bg-transparent hover:text-[var(--accent-primary)]",
  ghost:
    "bg-transparent border border-transparent text-[var(--foreground)] hover:bg-white/5",
  outline:
    "bg-transparent border border-[var(--border)] text-[var(--foreground)] hover:border-[var(--accent-secondary)] hover:text-[var(--accent-secondary)]",
  danger:
    "bg-[var(--danger)] text-white border border-[var(--danger)] hover:bg-transparent hover:text-[var(--danger)]",
};

const sizeClasses: Record<ButtonSize, string> = {
  default: "h-11 px-5 text-sm",
  sm: "h-9 px-3 text-xs",
  lg: "h-12 px-6 text-sm",
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
          "inline-flex items-center justify-center rounded-md font-semibold tracking-[0.1em] uppercase transition-all duration-300 disabled:opacity-50 disabled:pointer-events-none",
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
