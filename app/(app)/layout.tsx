import Link from "next/link";
import { SignOutButton } from "@/components/sign-out-button";
import { LiveDot } from "@/components/live-dot";
import { requireUser } from "@/lib/auth";
import { signOut } from "./actions";

// Everything under this layout is per-session; never prerender it.
export const dynamic = "force-dynamic";

export default async function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const user = await requireUser();

  return (
    <div className="relative z-10 flex min-h-dvh flex-col">
      <header className="sticky top-0 z-30 border-b border-line/80 bg-void/70 backdrop-blur-md">
        <div className="mx-auto flex h-16 w-full max-w-5xl items-center justify-between px-6">
          <Link
            href="/dashboard"
            className="group flex items-center gap-3"
            aria-label="Dwell dashboard"
          >
            <LiveDot />
            <span className="font-display text-xl tracking-tight text-chalk transition-colors group-hover:text-signal-soft">
              Dwell
            </span>
          </Link>

          <div className="flex items-center gap-5">
            <span
              className="hidden max-w-[16rem] truncate font-mono text-[10px] uppercase tracking-[0.16em] text-faint sm:inline"
              title={user.email ?? undefined}
            >
              {user.email}
            </span>
            <form action={signOut}>
              <SignOutButton />
            </form>
          </div>
        </div>
      </header>

      <div className="flex-1">{children}</div>

      <footer className="mx-auto w-full max-w-5xl px-6 pb-10">
        <div className="flex flex-col gap-2 border-t border-line pt-6 sm:flex-row sm:items-center sm:justify-between">
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-faint">
            Every link shows the reader what is recorded
          </p>
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-faint/70">
            No fingerprinting · visible time only
          </p>
        </div>
      </footer>
    </div>
  );
}
