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
        "relative rounded-xl border border-[var(--border)] bg-[linear-gradient(180deg,var(--panel),var(--panel-2))] p-5 shadow-[0_14px_36px_rgba(0,0,0,0.34)] md:p-6",
        className,
      )}
    >
      {children}
    </section>
  );
}
