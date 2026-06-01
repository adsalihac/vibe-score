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
        "relative rounded-xl border border-[var(--border)] bg-[var(--panel)] p-5 md:p-6",
        className,
      )}
    >
      {children}
    </section>
  );
}
