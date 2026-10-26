"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";

type CopyState = "idle" | "copied" | "failed";

export function CopyLinkButton({
  slug,
  label = "Copy link",
  className,
}: {
  slug: string;
  label?: string;
  className?: string;
}) {
  const [state, setState] = useState<CopyState>("idle");
  const timer = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (timer.current) window.clearTimeout(timer.current);
    },
    [],
  );

  async function copy() {
    const url = `${window.location.origin}/v/${slug}`;
    let copied = false;

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
        copied = true;
      }
    } catch {
      // Falls through to the older path (http, permissions denied).
    }

    if (!copied) copied = legacyCopy(url);

    setState(copied ? "copied" : "failed");
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setState("idle"), 2000);
  }

  return (
    <button
      type="button"
      onClick={copy}
      title={`/v/${slug}`}
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.16em] transition-colors",
        state === "copied"
          ? "border-signal/40 text-signal"
          : state === "failed"
            ? "border-heat-3/40 text-heat-3"
            : "border-line-2 text-dim hover:border-signal/40 hover:text-signal",
        className,
      )}
    >
      {state === "copied" ? (
        <svg
          aria-hidden
          viewBox="0 0 16 16"
          className="h-3 w-3"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="m2.5 8.5 3.5 3.5 7.5-8" />
        </svg>
      ) : (
        <svg
          aria-hidden
          viewBox="0 0 16 16"
          className="h-3 w-3"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <rect x="5.5" y="5.5" width="8" height="8" rx="1.5" />
          <path d="M10.5 3.5v-1a1 1 0 0 0-1-1h-6a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h1" />
        </svg>
      )}
      <span>
        {state === "copied" ? "Copied" : state === "failed" ? "Copy failed" : label}
      </span>
      <span role="status" aria-live="polite" className="sr-only">
        {state === "copied" ? "Link copied to clipboard" : ""}
      </span>
    </button>
  );
}

function legacyCopy(value: string): boolean {
  try {
    const field = document.createElement("textarea");
    field.value = value;
    field.setAttribute("readonly", "");
    field.style.position = "fixed";
    field.style.opacity = "0";
    document.body.appendChild(field);
    field.select();
    const copied = document.execCommand("copy");
    document.body.removeChild(field);
    return copied;
  } catch {
    return false;
  }
}
