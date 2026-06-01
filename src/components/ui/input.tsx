import * as React from "react";

import { cn } from "@/lib/utils";

export type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, ...props }, ref) => {
    return (
      <input
        ref={ref}
        className={cn(
          "h-14 w-full rounded-lg border border-[var(--border)] bg-[var(--panel-2)] px-5 font-[family-name:var(--font-mono)] text-[0.92rem] text-[var(--foreground)] outline-none transition-all duration-250 placeholder:text-[var(--muted)] focus:border-[var(--accent-secondary)] focus:shadow-[0_0_0_2px_rgba(77,159,255,0.25)]",
          className,
        )}
        {...props}
      />
    );
  },
);

Input.displayName = "Input";
