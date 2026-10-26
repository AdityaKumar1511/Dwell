"use client";

import { useEffect, useRef, useState, type DragEvent } from "react";
import { useRouter } from "next/navigation";
import { registerDocument } from "@/app/(app)/dashboard/actions";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/cn";
import { formatBytes } from "@/lib/format";
import { MAX_PDF_BYTES, MAX_PDF_LABEL } from "@/lib/limits";

type Stage = "idle" | "uploading" | "processing" | "done" | "error";

export function UploadDropzone({ ownerId }: { ownerId: string }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [stage, setStage] = useState<Stage>("idle");
  const [dragging, setDragging] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [detail, setDetail] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);

  const busy = stage === "uploading" || stage === "processing";

  useEffect(() => {
    if (stage !== "done") return;
    const timer = window.setTimeout(() => {
      setStage("idle");
      setDetail(null);
    }, 5000);
    return () => window.clearTimeout(timer);
  }, [stage]);

  async function accept(file: File | undefined) {
    if (!file || busy) return;

    setMessage(null);
    setDetail(null);
    setFileName(file.name);

    const looksLikePdf =
      file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");

    if (!looksLikePdf) {
      setStage("error");
      setMessage("That isn’t a PDF. Choose a .pdf file.");
      return;
    }
    if (file.size === 0) {
      setStage("error");
      setMessage("That file is empty.");
      return;
    }
    if (file.size > MAX_PDF_BYTES) {
      setStage("error");
      setMessage(`That file is too large. The limit is ${MAX_PDF_LABEL}.`);
      return;
    }

    // Direct-to-Storage upload: bytes never pass through a serverless function,
    // so the request-size ceiling doesn't apply.
    const path = `${ownerId}/${crypto.randomUUID()}.pdf`;

    setStage("uploading");
    try {
      const supabase = createClient();
      const { error: uploadError } = await supabase.storage
        .from("documents")
        .upload(path, file, {
          contentType: "application/pdf",
          cacheControl: "3600",
          upsert: false,
        });

      if (uploadError) {
        setStage("error");
        setMessage(uploadErrorMessage(uploadError.message));
        return;
      }

      setStage("processing");
      const result = await registerDocument({ path, title: file.name });

      if (!result.ok) {
        setStage("error");
        setMessage(result.error);
        return;
      }

      setStage("done");
      setDetail(
        `${result.document.title} · ${result.document.pageCount} ${
          result.document.pageCount === 1 ? "page" : "pages"
        } · ${formatBytes(file.size)}`,
      );
      router.refresh();
    } catch {
      setStage("error");
      setMessage("Upload failed. Check your connection and try again.");
    }
  }

  function handleDrop(event: DragEvent<HTMLElement>) {
    event.preventDefault();
    setDragging(false);
    if (busy) return;
    void accept(event.dataTransfer.files?.[0]);
  }

  function handleDragLeave(event: DragEvent<HTMLElement>) {
    if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
    setDragging(false);
  }

  return (
    <section
      aria-labelledby="upload-heading"
      aria-busy={busy}
      onDragOver={(event) => {
        event.preventDefault();
        if (!busy) setDragging(true);
      }}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={cn(
        "relative overflow-hidden rounded-xl border bg-panel/40 transition-colors duration-300",
        dragging ? "border-signal/60 bg-signal/[0.035]" : "border-line",
      )}
    >
      <span
        aria-hidden
        className={cn(
          "pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-signal/80 to-transparent transition-opacity duration-300",
          dragging || busy ? "opacity-100" : "opacity-0",
        )}
      />

      <div className="flex flex-col gap-6 p-6 sm:flex-row sm:items-center sm:justify-between sm:p-7">
        <div className="min-w-0">
          <p className="font-mono text-[10px] uppercase tracking-[0.28em] text-faint">
            01 — Add a document
          </p>
          <h2
            id="upload-heading"
            className="mt-3 font-display text-2xl leading-tight text-chalk"
          >
            Drop a PDF <span className="italic text-faint">or</span> choose a file
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-dim">
            Up to {MAX_PDF_LABEL}. Stored privately — only you can open it.
          </p>
        </div>

        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={busy}
          className="group inline-flex shrink-0 items-center gap-2.5 self-start rounded-full border border-line-2 px-5 py-2.5 font-mono text-[10px] uppercase tracking-[0.18em] text-chalk transition-colors hover:border-signal/60 hover:text-signal disabled:cursor-not-allowed disabled:opacity-40 sm:self-auto"
        >
          {busy ? "Working" : "Choose file"}
          <svg
            aria-hidden
            viewBox="0 0 16 16"
            className="h-3 w-3 transition-transform duration-300 group-hover:translate-y-[-1px]"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M8 12V3M4.5 6.5 8 3l3.5 3.5" />
          </svg>
        </button>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="application/pdf,.pdf"
        aria-label="Choose a PDF to upload"
        tabIndex={-1}
        className="sr-only"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          void accept(file);
        }}
      />

      <div
        role="status"
        aria-live="polite"
        className={cn(
          "flex min-h-[3.25rem] items-center gap-4 border-t px-6 py-3 transition-colors sm:px-7",
          stage === "error"
            ? "border-heat-3/30 bg-heat-3/[0.04]"
            : "border-line bg-void/20",
        )}
      >
        {stage === "idle" ? (
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-faint">
            Drag a file anywhere in this panel
          </p>
        ) : null}

        {busy ? (
          <>
            <span className="shrink-0 font-mono text-[10px] uppercase tracking-[0.18em] text-signal">
              {stage === "uploading" ? "Uploading" : "Reading pages"}
            </span>
            <span className="relative h-px flex-1 overflow-hidden bg-line-2">
              <span className="absolute inset-y-0 left-0 w-1/3 animate-scan bg-signal" />
            </span>
            <span className="max-w-[35%] truncate font-mono text-[10px] text-faint">
              {fileName}
            </span>
          </>
        ) : null}

        {stage === "done" ? (
          <div className="flex min-w-0 items-center gap-3 animate-rise">
            <svg
              aria-hidden
              viewBox="0 0 16 16"
              className="h-3.5 w-3.5 shrink-0 text-signal"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="m2.5 8.5 3.5 3.5 7.5-8" />
            </svg>
            <p className="truncate text-sm text-chalk">
              Added <span className="text-faint">—</span>{" "}
              <span className="text-dim">{detail}</span>
            </p>
          </div>
        ) : null}

        {stage === "error" ? (
          <div className="flex min-w-0 flex-1 items-center justify-between gap-4">
            <p role="alert" className="text-sm text-heat-3">
              {message}
            </p>
            <button
              type="button"
              onClick={() => {
                setStage("idle");
                setMessage(null);
              }}
              className="shrink-0 font-mono text-[10px] uppercase tracking-[0.18em] text-faint transition-colors hover:text-chalk"
            >
              Dismiss
            </button>
          </div>
        ) : null}
      </div>
    </section>
  );
}

function uploadErrorMessage(raw: string): string {
  const message = raw.toLowerCase();
  if (message.includes("bucket not found")) {
    return "Storage isn’t set up yet. Apply the Supabase migration, then retry.";
  }
  if (message.includes("row-level security") || message.includes("permission")) {
    return "Your session expired. Sign in again, then retry the upload.";
  }
  if (message.includes("too large") || message.includes("exceeded")) {
    return `That file is too large. The limit is ${MAX_PDF_LABEL}.`;
  }
  return "Upload failed. Check your connection and try again.";
}
