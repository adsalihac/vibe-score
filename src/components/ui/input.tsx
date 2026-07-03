import * as React from "react";

import { cn } from "@/lib/utils";

export type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, ...props }, ref) => {
    return (
      <input
        ref={ref}
        className={cn(
          "h-12 w-full rounded-xl border border-transparent border-b-white/15 bg-black/40 px-4 text-[0.92rem] text-[var(--foreground)] outline-none transition-all duration-200 placeholder:text-white/30 focus:border-[#f7931a] focus:border-b-[#f7931a] focus:bg-black/55 focus:shadow-[0_10px_22px_-16px_rgba(247,147,26,0.55)]",
          className,
        )}
        {...props}
      />
    );
  },
);

Input.displayName = "Input";
