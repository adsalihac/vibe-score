import { cn } from "@/lib/utils";

export function Panel({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "relative rounded-lg border border-[var(--border)] bg-[linear-gradient(180deg,var(--panel),var(--panel-2))] p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.035),0_18px_42px_rgba(0,0,0,0.38)] md:p-6",
        className,
      )}
    >
      {children}
    </section>
  );
}
