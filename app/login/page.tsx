import type { Metadata } from "next";
import { LoginPanel } from "@/components/login-form";
import { LiveDot } from "@/components/live-dot";

export const metadata: Metadata = {
  title: "Sign in",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string | string[]; next?: string | string[] }>;
}) {
  const params = await searchParams;
  const expired = params.error === "expired";
  const next = typeof params.next === "string" ? params.next : "/dashboard";

  return (
    <main className="relative z-10 flex min-h-dvh flex-col">
      <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col px-6">
        <header className="flex h-20 items-center justify-between">
          <div className="flex items-center gap-3">
            <LiveDot />
            <span className="font-display text-xl tracking-tight text-chalk">Dwell</span>
          </div>
          <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-faint">
            Know when it’s read
          </span>
        </header>

        <div className="grid flex-1 items-center gap-14 pb-16 pt-6 lg:grid-cols-[1.15fr_0.85fr] lg:gap-20 lg:pt-0">
          <section>
            <p className="font-mono text-[10px] uppercase tracking-[0.28em] text-faint">
              Read receipts for documents
            </p>
            <h1 className="mt-6 font-display text-[clamp(2.9rem,7.5vw,5rem)] leading-[0.92] tracking-[-0.01em] text-chalk">
              Know when
              <br />
              <span className="italic text-signal">it’s read.</span>
            </h1>
            <p className="mt-7 max-w-sm text-[15px] leading-relaxed text-dim">
              One private link per recipient. Per-page attention, not just an
              open. Readers always see what is recorded.
            </p>

            <div className="mt-10 flex flex-wrap items-center gap-x-4 gap-y-3 font-mono text-[10px] uppercase tracking-[0.18em] text-faint">
              <span>Own viewer</span>
              <span aria-hidden className="h-px w-5 bg-line-2" />
              <span>Visible time only</span>
              <span aria-hidden className="h-px w-5 bg-line-2" />
              <span>No fingerprinting</span>
            </div>
          </section>

          <section className="animate-rise lg:border-l lg:border-line lg:pl-12">
            <p className="font-mono text-[10px] uppercase tracking-[0.28em] text-faint">
              Sign in
            </p>

            {expired ? (
              <p
                role="alert"
                className="mt-6 border-l border-heat-3/60 pl-3 text-sm leading-relaxed text-heat-3"
              >
                That link expired or was already used. Request a fresh one below.
              </p>
            ) : null}

            <LoginPanel next={next} />
          </section>
        </div>
      </div>
    </main>
  );
}
