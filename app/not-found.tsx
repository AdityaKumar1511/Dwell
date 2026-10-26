import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Link unavailable",
  robots: { index: false, follow: false },
};

/**
 * Shared 404. Public links use it for invalid, revoked, expired, and
 * exhausted slugs, so all four cases are indistinguishable to a reader.
 */
export default function NotFound() {
  return (
    <main className="relative z-10 flex min-h-dvh items-center justify-center px-6 py-20">
      <div className="w-full max-w-sm">
        <p className="font-mono text-[10px] uppercase tracking-[0.28em] text-faint">
          Dwell · Link
        </p>
        <h1 className="mt-5 font-display text-4xl leading-[1.05] text-chalk">
          This link isn’t available.
        </h1>
        <p className="mt-4 text-sm leading-relaxed text-dim">
          It may have been revoked, expired, or mistyped. Ask the sender for a
          fresh one.
        </p>

        <div className="mt-10 flex items-center gap-2.5">
          <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-line-2" />
          <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-faint/70">
            Know when it’s read
          </span>
        </div>
      </div>
    </main>
  );
}
