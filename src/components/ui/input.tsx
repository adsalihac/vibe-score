import * as React from "react";

import { cn } from "@/lib/utils";

export type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, ...props }, ref) => {
    return (
      <input
        ref={ref}
        className={cn(
          "h-12 w-full rounded-none border border-[var(--border)] bg-[rgba(10,10,10,0.9)] px-4 font-mono text-[0.84rem] text-[var(--foreground)] outline-none transition-colors duration-150 placeholder:text-[var(--muted)] focus:border-[var(--accent-primary)] focus:text-[var(--accent-primary)]",
          className,
        )}
        {...props}
      />
    );
  },
);

Input.displayName = "Input";
