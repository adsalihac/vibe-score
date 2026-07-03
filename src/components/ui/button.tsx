import * as React from "react";

import { cn } from "@/lib/utils";

type ButtonVariant = "primary" | "ghost" | "outline" | "danger";
type ButtonSize = "default" | "sm" | "lg";

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    "border border-[#f7931a]/70 bg-gradient-to-r from-[#ea580c] via-[#f7931a] to-[#ffd600] text-[#0b0d10] shadow-[0_0_24px_-6px_rgba(247,147,26,0.55)] hover:border-[#ffd600] hover:shadow-[0_0_32px_-4px_rgba(255,214,0,0.55)] hover:brightness-110",
  ghost:
    "bg-transparent border border-transparent text-[var(--foreground)] hover:bg-white/10 hover:text-[#ffd600]",
  outline:
    "border border-white/12 bg-white/5 text-[var(--foreground)] backdrop-blur-sm hover:border-[#f7931a]/70 hover:bg-white/10 hover:text-[#ffd600]",
  danger:
    "border border-[var(--danger)] bg-[var(--danger)] text-white hover:bg-transparent hover:text-[var(--danger)]",
};

const sizeClasses: Record<ButtonSize, string> = {
  default: "h-11 px-5 text-[0.78rem]",
  sm: "h-9 px-4 text-[0.68rem]",
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
          "inline-flex items-center justify-center rounded-full font-body font-semibold tracking-[0.08em] uppercase transition-all duration-300 disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f7931a] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)]",
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
