"use client";

import { useEffect, useRef, useState } from "react";
import { PdfPages } from "@/components/pdf/pdf-pages";
import { LiveDot } from "@/components/live-dot";

type ViewState = "pending" | "ready" | "blocked";

export function Viewer({
  slug,
  title,
  recipientName,
  initialPageCount,
  signedUrl,
}: {
  slug: string;
  title: string;
  recipientName: string | null;
  initialPageCount: number;
  signedUrl: string;
}) {
  const [viewState, setViewState] = useState<ViewState>("pending");
  const [page, setPage] = useState(1);
  const [pageCount, setPageCount] = useState(initialPageCount);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    fetch("/api/view", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ slug }),
      cache: "no-store",
    })
      .then(async (response) => {
        if (response.status === 404) {
          setViewState("blocked");
          return;
        }
        if (!response.ok) {
          // Analytics must never get between a reader and the document.
          setViewState("ready");
          return;
        }
        const payload = (await response.json()) as { viewId?: unknown };
        if (typeof payload.viewId === "string") {
          setViewState("ready");
          try {
            // Phase 3 reads this to attach events to the same session.
            sessionStorage.setItem(`dwell:view:${slug}`, payload.viewId);
          } catch {
            // Private mode: the id stays in memory only.
          }
        } else {
          setViewState("ready");
        }
      })
      .catch(() => setViewState("ready"));
  }, [slug]);

  const pad = (value: number) => String(value).padStart(2, "0");
  const progress = pageCount > 0 ? Math.min(100, (page / pageCount) * 100) : 0;

  return (
    <div className="relative z-10 min-h-dvh">
      <header className="sticky top-0 z-30 border-b border-line bg-void/80 backdrop-blur-md">
        <div className="mx-auto flex h-14 w-full max-w-4xl items-center gap-4 px-4">
          <div className="flex shrink-0 items-center gap-2.5">
            <LiveDot />
            <span className="hidden font-display text-lg tracking-tight text-chalk sm:inline">
              Dwell
            </span>
          </div>

          <div className="min-w-0 flex-1 text-center">
            <p className="truncate text-[13px] leading-tight text-chalk">{title}</p>
            {recipientName ? (
              <p className="truncate font-mono text-[9px] uppercase tracking-[0.16em] text-faint">
                for {recipientName}
              </p>
            ) : null}
          </div>

          <p className="shrink-0 font-mono text-[10px] tabular-nums tracking-[0.08em] text-faint">
            {pad(page)} <span className="text-line-2">/</span> {pad(pageCount)}
          </p>
        </div>

        <div aria-hidden className="h-px bg-line">
          <div
            className="h-px bg-signal/70 transition-[width] duration-500 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>
      </header>

      <div className="border-b border-line bg-panel/30">
        <p className="mx-auto flex w-full max-w-4xl items-center gap-2.5 px-4 py-2.5 font-mono text-[10px] uppercase tracking-[0.16em] text-dim">
          <svg
            aria-hidden
            viewBox="0 0 16 16"
            className="h-3 w-3 shrink-0 text-signal"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M1.5 8s2.5-4.5 6.5-4.5S14.5 8 14.5 8 12 12.5 8 12.5 1.5 8 1.5 8Z" />
            <circle cx="8" cy="8" r="2" />
          </svg>
          This link records views and engagement.
        </p>
      </div>

      <main className="pb-16 pt-5 sm:pt-8">
        {viewState === "blocked" ? (
          <div className="mx-auto max-w-md px-6 py-28 text-center">
            <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-heat-3">
              Link closed
            </p>
            <h1 className="mt-4 font-display text-4xl leading-tight text-chalk">
              This link is no longer available.
            </h1>
            <p className="mt-3 text-sm leading-relaxed text-dim">
              It may have reached its view limit. Ask the sender for a new one.
            </p>
          </div>
        ) : (
          <PdfPages
            url={signedUrl}
            onPageChange={setPage}
            onPageCount={setPageCount}
          />
        )}
      </main>

      <footer className="mx-auto w-full max-w-3xl px-6 pb-12 text-center">
        <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-faint/70">
          Shared with Dwell · Know when it’s read
        </p>
      </footer>
    </div>
  );
}
