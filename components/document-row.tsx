"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createLink, type CreateLinkState } from "@/app/(app)/dashboard/link-actions";
import type { DashboardDocument } from "@/types/dashboard";
import { CopyLinkButton } from "@/components/copy-link-button";
import { cn } from "@/lib/cn";
import { formatBytes, formatCount, relativeTime } from "@/lib/format";

const initialState: CreateLinkState = { status: "idle" };

export function DocumentRow({
  document,
  index,
}: {
  document: DashboardDocument;
  index: number;
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(createLink, initialState);

  const panelId = `links-${document.id}`;
  const linkCount = document.links.length;
  const justCreated =
    state.status === "created" &&
    !!state.slug &&
    !document.links.some((link) => link.slug === state.slug);

  useEffect(() => {
    if (state.status !== "created") return;
    formRef.current?.reset();
    router.refresh();
  }, [state, router]);

  function openPanel(focusForm = false) {
    setOpen(true);
    if (focusForm) {
      window.requestAnimationFrame(() => nameRef.current?.focus());
    }
  }

  return (
    <li
      className="animate-rise"
      style={{ animationDelay: `${Math.min(index * 45, 360)}ms` }}
    >
      <div className="grid grid-cols-[2.25rem_1fr_auto] items-center gap-4 border-b border-line py-5">
        <span
          className={cn(
            "font-mono text-[10px] tabular-nums transition-colors",
            open ? "text-signal" : "text-faint",
          )}
        >
          {String(index + 1).padStart(2, "0")}
        </span>

        <button
          type="button"
          onClick={() => (open ? setOpen(false) : openPanel())}
          aria-expanded={open}
          aria-controls={panelId}
          className="group min-w-0 text-left"
        >
          <span className="block truncate text-[15px] text-chalk transition-colors group-hover:text-white">
            {document.title}
          </span>
          <span className="mt-1.5 flex flex-wrap items-center gap-x-2 font-mono text-[10px] uppercase tracking-[0.16em] text-faint">
            {formatCount(document.pageCount, "page")}
            <Sep />
            {formatBytes(document.sizeBytes)}
            <Sep />
            {linkCount === 0
              ? "no links"
              : formatCount(linkCount, "link")}
            <Sep />
            added {relativeTime(document.createdAt)}
          </span>
        </button>

        <button
          type="button"
          onClick={() => (open ? nameRef.current?.focus() : openPanel(true))}
          aria-expanded={open}
          aria-controls={panelId}
          className={cn(
            "inline-flex shrink-0 items-center gap-2 rounded-full border px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.16em] transition-colors",
            open
              ? "border-signal/40 text-signal"
              : "border-line-2 text-dim hover:border-signal/40 hover:text-signal",
          )}
          aria-label={
            linkCount === 0
              ? `Create a link for ${document.title}`
              : open
                ? `Add another link for ${document.title}`
                : `Show ${linkCount} link${linkCount === 1 ? "" : "s"} for ${document.title}`
          }
        >
          {linkCount === 0 ? "Create link" : formatCount(linkCount, "link")}
          <svg
            aria-hidden
            viewBox="0 0 16 16"
            className={cn(
              "h-3 w-3 transition-transform duration-300",
              open && "rotate-180",
            )}
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="m4 6 4 4 4-4" />
          </svg>
        </button>
      </div>

      {open ? (
        <div
          id={panelId}
          className="animate-rise border-b border-line pb-6 pl-[3.25rem] pr-1"
        >
          <form
            ref={formRef}
            action={formAction}
            className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end"
          >
            <input type="hidden" name="documentId" value={document.id} />

            <label className="block">
              <span className="font-mono text-[9px] uppercase tracking-[0.2em] text-faint">
                Recipient
              </span>
              <input
                ref={nameRef}
                name="recipientName"
                required
                maxLength={120}
                placeholder="Jordan Reyes"
                autoComplete="off"
                className="mt-1.5 w-full rounded-md border border-line bg-void/40 px-3 py-2 text-sm text-chalk outline-none transition-colors placeholder:text-faint/60 focus:border-signal/60"
              />
            </label>

            <label className="block">
              <span className="font-mono text-[9px] uppercase tracking-[0.2em] text-faint">
                Email <span className="text-faint/60">(optional)</span>
              </span>
              <input
                name="recipientEmail"
                type="email"
                maxLength={254}
                placeholder="jordan@studio.com"
                autoComplete="off"
                className="mt-1.5 w-full rounded-md border border-line bg-void/40 px-3 py-2 text-sm text-chalk outline-none transition-colors placeholder:text-faint/60 focus:border-signal/60"
              />
            </label>

            <button
              type="submit"
              disabled={pending}
              className="h-[38px] rounded-full bg-signal px-4 font-mono text-[10px] uppercase tracking-[0.16em] text-void transition-colors hover:bg-signal-soft disabled:cursor-wait disabled:opacity-60"
            >
              {pending ? "Creating" : "Create link"}
            </button>
          </form>

          {state.status === "error" && state.message ? (
            <p role="alert" className="mt-3 text-sm text-heat-3">
              {state.message}
            </p>
          ) : null}

          {justCreated ? (
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-signal/25 bg-signal/[0.04] px-4 py-3">
              <p className="min-w-0 text-sm text-chalk">
                Ready for{" "}
                <span className="text-signal">{state.recipientName}</span>
                <span className="block font-mono text-[10px] uppercase tracking-[0.14em] text-faint">
                  /v/{state.slug}
                </span>
              </p>
              <CopyLinkButton slug={state.slug!} className="border-signal/40 text-signal" />
            </div>
          ) : null}

          <ul className="mt-5 border-t border-line/80">
            {document.links.map((link) => (
              <li
                key={link.id}
                className="flex flex-wrap items-center justify-between gap-3 border-b border-line/60 py-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm text-chalk">
                    {link.recipientName ?? "Unnamed recipient"}
                    {link.recipientEmail ? (
                      <span className="text-faint"> · {link.recipientEmail}</span>
                    ) : null}
                    {link.revoked ? (
                      <span className="ml-2 font-mono text-[9px] uppercase tracking-[0.16em] text-heat-3">
                        revoked
                      </span>
                    ) : null}
                  </p>
                  <p className="mt-1 font-mono text-[10px] text-faint">
                    /v/{link.slug}
                    <span aria-hidden className="mx-2 text-line-2">
                      /
                    </span>
                    {relativeTime(link.createdAt)}
                  </p>
                </div>
                <CopyLinkButton slug={link.slug} />
              </li>
            ))}

            {linkCount === 0 ? (
              <li className="py-4 text-sm text-faint">
                No links yet. Create one above, then send it to your reader.
              </li>
            ) : null}
          </ul>
        </div>
      ) : null}
    </li>
  );
}

function Sep() {
  return (
    <span aria-hidden className="text-line-2">
      /
    </span>
  );
}
