export function LiveDot({ className = "" }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={`relative inline-flex h-2 w-2 shrink-0 items-center justify-center ${className}`}
    >
      <span className="absolute inset-0 rounded-full bg-signal animate-radiate" />
      <span className="relative h-2 w-2 rounded-full bg-signal animate-pulse-dot" />
    </span>
  );
}
