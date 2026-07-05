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
        "relative overflow-hidden rounded-none border border-[var(--border)] bg-[linear-gradient(180deg,rgba(13,18,13,0.98),rgba(10,15,10,1))] p-5 pt-10 shadow-[inset_0_0_0_1px_rgba(31,82,31,0.4),0_0_18px_rgba(51,255,0,0.08)] transition-colors duration-200 hover:border-[var(--accent-primary)] md:p-6 md:pt-11",
        className,
      )}
    >
      <div className="pointer-events-none absolute inset-x-0 top-0 h-7 border-b border-[var(--border)] bg-[rgba(10,10,10,0.85)]" />
      <div className="pointer-events-none absolute left-3 top-2 text-[0.58rem] uppercase tracking-[0.16em] text-[var(--accent-secondary)]">
        +-- pane --+
      </div>
      {children}
    </section>
  );
}
