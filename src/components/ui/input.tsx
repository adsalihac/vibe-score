import * as React from "react";

import { cn } from "@/lib/utils";

export type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, ...props }, ref) => {
    return (
      <input
        ref={ref}
        className={cn(
          "h-14 w-full rounded-md border border-[var(--border)] bg-[var(--panel-2)] px-5 text-[0.92rem] text-[var(--foreground)] outline-none transition-all duration-200 placeholder:text-[var(--muted)] focus:border-[var(--accent-primary)] focus:shadow-[0_0_0_2px_rgba(125,211,168,0.18)]",
          className,
        )}
        {...props}
      />
    );
  },
);

Input.displayName = "Input";
