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
        "relative overflow-hidden rounded-2xl border border-white/10 bg-[linear-gradient(180deg,rgba(15,17,21,0.96),rgba(8,9,12,0.98))] p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.05),0_0_0_1px_rgba(247,147,26,0.06),0_24px_50px_-20px_rgba(234,88,12,0.45)] backdrop-blur-lg transition-all duration-300 hover:-translate-y-0.5 hover:border-[#f7931a]/30 hover:shadow-[0_0_0_1px_rgba(247,147,26,0.15),0_30px_70px_-24px_rgba(247,147,26,0.4)] md:p-6",
        className,
      )}
    >
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#f7931a]/60 to-transparent" />
      {children}
    </section>
  );
}
