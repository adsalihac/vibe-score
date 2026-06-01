import * as React from "react";

import { cn } from "@/lib/utils";

export type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, ...props }, ref) => {
    return (
      <input
        ref={ref}
        className={cn(
          "h-14 w-full rounded-md border border-[var(--border)] bg-[var(--panel)] px-5 font-[family-name:var(--font-mono)] text-base text-[var(--foreground)] outline-none transition-all duration-300 placeholder:text-zinc-500 focus:border-[var(--accent-primary)] focus:shadow-[0_0_0_2px_rgba(0,255,179,0.2)]",
          className,
        )}
        {...props}
      />
    );
  },
);

Input.displayName = "Input";
