import * as React from "react";

import { cn } from "@/lib/utils";

type ButtonVariant = "primary" | "ghost" | "outline" | "danger";
type ButtonSize = "default" | "sm" | "lg";

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    "border border-[var(--accent-primary)] bg-transparent text-[var(--accent-primary)] hover:bg-[var(--accent-primary)] hover:text-[var(--background)]",
  ghost:
    "border border-transparent bg-transparent text-[var(--foreground)] hover:border-[var(--border)] hover:bg-[rgba(31,82,31,0.18)]",
  outline:
    "border border-[var(--border)] bg-[rgba(31,82,31,0.1)] text-[var(--foreground)] hover:border-[var(--accent-secondary)] hover:text-[var(--accent-secondary)]",
  danger:
    "border border-[var(--danger)] bg-transparent text-[var(--danger)] hover:bg-[var(--danger)] hover:text-[var(--background)]",
};

const sizeClasses: Record<ButtonSize, string> = {
  default: "h-11 px-5 text-[0.72rem]",
  sm: "h-9 px-4 text-[0.66rem]",
  lg: "h-12 px-6 text-[0.78rem]",
};

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "primary", size = "default", children, ...props }, ref) => {
    const displayChild =
      typeof children === "string" && variant !== "ghost" ? `[ ${children.toUpperCase()} ]` : children;

    return (
      <button
        ref={ref}
        className={cn(
          "inline-flex items-center justify-center rounded-none border font-mono font-semibold tracking-[0.11em] uppercase transition-colors duration-150 disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-none focus-visible:bg-[var(--accent-primary)] focus-visible:text-[var(--background)]",
          variantClasses[variant],
          sizeClasses[size],
          className,
        )}
        {...props}
      >
        {displayChild}
      </button>
    );
  },
);

Button.displayName = "Button";
