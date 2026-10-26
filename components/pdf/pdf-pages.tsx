"use client";

import { useEffect, useRef, useState } from "react";
import type {
  PDFDocumentLoadingTask,
  PDFDocumentProxy,
  PDFPageProxy,
} from "pdfjs-dist";
import { cn } from "@/lib/cn";

const DEFAULT_RATIO = 612 / 792; // US Letter, width / height
const DPR_CAP = 2;
const NEAR_MARGIN = "1500px 0px";
const WORKER_URL = "/pdf.worker.min.mjs";

type RenderTask = ReturnType<PDFPageProxy["render"]>;

export function PdfPages({
  url,
  onPageChange,
  onPageCount,
}: {
  url: string;
  onPageChange?: (page: number) => void;
  onPageCount?: (count: number) => void;
}) {
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [ratio, setRatio] = useState(DEFAULT_RATIO);
  const [failed, setFailed] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let disposed = false;
    let loadingTask: PDFDocumentLoadingTask | null = null;

    (async () => {
      try {
        const pdfjs = await import("pdfjs-dist");
        pdfjs.GlobalWorkerOptions.workerSrc = WORKER_URL;

        loadingTask = pdfjs.getDocument({
          url,
          withCredentials: false,
          // Same-origin copies made by scripts/copy-pdf-worker.mjs.
          cMapUrl: "/pdf/cmaps/",
          cMapPacked: true,
          standardFontDataUrl: "/pdf/standard_fonts/",
          wasmUrl: "/pdf/wasm/",
        });

        loadingTask.onProgress = ({ percent }: { percent: number }) => {
          if (disposed || !Number.isFinite(percent) || percent <= 0) return;
          setProgress(Math.min(100, Math.round(percent)));
        };

        const document = await loadingTask.promise;
        if (disposed) return;

        const first = await document.getPage(1);
        const viewport = first.getViewport({ scale: 1 });
        setRatio(viewport.width / viewport.height);
        setPdf(document);
        setProgress(100);
        onPageCount?.(document.numPages);
      } catch (error) {
        if (!disposed) {
          console.error("dwell: pdf load failed", error);
          setFailed(true);
        }
      }
    })();

    return () => {
      disposed = true;
      void loadingTask?.destroy();
    };
  }, [url, onPageCount]);

  // Which page occupies the middle of the viewport.
  useEffect(() => {
    const root = containerRef.current;
    if (!pdf || !root) return;

    const pages = root.querySelectorAll<HTMLElement>("[data-page]");
    if (pages.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const topmost = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];

        if (!topmost) return;
        const page = Number((topmost.target as HTMLElement).dataset.page);
        if (Number.isFinite(page) && page > 0) onPageChange?.(page);
      },
      { rootMargin: "-45% 0px -45% 0px" },
    );

    pages.forEach((page) => observer.observe(page));
    return () => observer.disconnect();
  }, [pdf, onPageChange]);

  if (failed) {
    return (
      <div className="mx-auto max-w-md px-6 py-28 text-center">
        <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-heat-3">
          Viewer
        </p>
        <p className="mt-4 font-display text-3xl leading-tight text-chalk">
          The pages didn’t load.
        </p>
        <p className="mt-3 text-sm leading-relaxed text-dim">
          The link may have expired, or the file couldn’t be read. Ask the sender
          for a fresh link.
        </p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="mt-7 rounded-full border border-line-2 px-4 py-2 font-mono text-[10px] uppercase tracking-[0.16em] text-dim transition-colors hover:border-signal/40 hover:text-signal"
        >
          Try again
        </button>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="mx-auto w-full max-w-[900px] px-3 sm:px-6"
      aria-busy={!pdf}
    >
      {!pdf ? <PreparingSheet ratio={ratio} progress={progress} /> : null}

      {pdf
        ? Array.from({ length: pdf.numPages }, (_, index) => (
            <PdfPage
              key={index}
              pdf={pdf}
              pageNumber={index + 1}
              totalPages={pdf.numPages}
              defaultRatio={ratio}
            />
          ))
        : null}
    </div>
  );
}

function PdfPage({
  pdf,
  pageNumber,
  totalPages,
  defaultRatio,
}: {
  pdf: PDFDocumentProxy;
  pageNumber: number;
  totalPages: number;
  defaultRatio: number;
}) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [near, setNear] = useState(false);
  const [width, setWidth] = useState(0);
  const [ratio, setRatio] = useState(defaultRatio);
  const [painted, setPainted] = useState(false);

  useEffect(() => {
    const element = wrapperRef.current;
    if (!element) return;

    const observer = new IntersectionObserver(
      ([entry]) => setNear(entry.isIntersecting),
      { rootMargin: NEAR_MARGIN },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const element = wrapperRef.current;
    if (!element) return;

    let timer = 0;
    const measure = () => setWidth(Math.round(element.clientWidth));
    measure();

    const observer = new ResizeObserver(() => {
      window.clearTimeout(timer);
      timer = window.setTimeout(measure, 150);
    });
    observer.observe(element);

    return () => {
      window.clearTimeout(timer);
      observer.disconnect();
    };
  }, []);

  useEffect(() => {
    if (!near || width === 0) return;

    let cancelled = false;
    let task: RenderTask | null = null;

    (async () => {
      const page = await pdf.getPage(pageNumber);
      if (cancelled) return;

      const base = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale: width / base.width });
      const canvas = canvasRef.current;
      if (!canvas) return;

      const dpr = Math.min(window.devicePixelRatio || 1, DPR_CAP);
      canvas.width = Math.max(1, Math.floor(viewport.width * dpr));
      canvas.height = Math.max(1, Math.floor(viewport.height * dpr));

      const context = canvas.getContext("2d", { alpha: false });
      if (!context) return;
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, canvas.width, canvas.height);

      task = page.render({
        canvas,
        canvasContext: context,
        viewport,
        transform: dpr === 1 ? undefined : [dpr, 0, 0, dpr, 0, 0],
      });

      await task.promise;
      if (cancelled) return;
      setRatio(base.width / base.height);
      setPainted(true);
    })().catch(() => {
      // RenderingCancelledException is expected when a page scrolls away.
    });

    return () => {
      cancelled = true;
      task?.cancel();
    };
  }, [near, width, pdf, pageNumber]);

  // Far from the viewport: release the bitmap so long PDFs stay light.
  useEffect(() => {
    if (near) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = 0;
    canvas.height = 0;
    setPainted(false);
  }, [near]);

  return (
    <div
      ref={wrapperRef}
      data-page={pageNumber}
      role="img"
      aria-label={`Page ${pageNumber} of ${totalPages}`}
      className="relative mb-4 w-full overflow-hidden rounded-[2px] bg-white ring-1 ring-black/20 shadow-[0_1px_0_rgba(255,255,255,0.06),0_30px_60px_-30px_rgba(0,0,0,0.95)] sm:mb-6"
      style={{ aspectRatio: ratio }}
    >
      <canvas
        ref={canvasRef}
        aria-hidden
        className={cn(
          "block h-full w-full transition-opacity duration-500",
          painted ? "opacity-100" : "opacity-0",
        )}
      />
      {!painted ? (
        <span aria-hidden className="absolute inset-0 animate-pulse bg-white" />
      ) : null}
    </div>
  );
}

function PreparingSheet({
  ratio,
  progress,
}: {
  ratio: number;
  progress: number | null;
}) {
  return (
    <div
      className="relative mb-4 w-full overflow-hidden rounded-[2px] bg-white ring-1 ring-black/20 sm:mb-6"
      style={{ aspectRatio: ratio }}
    >
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-4">
        <p className="font-mono text-[10px] uppercase tracking-[0.26em] text-ink/45">
          Preparing pages
        </p>
        <span className="h-px w-28 overflow-hidden bg-ink/10">
          <span className="block h-px w-1/3 animate-scan bg-ink/40" />
        </span>
        {progress !== null ? (
          <p className="font-mono text-[10px] tabular-nums text-ink/35">
            {progress}%
          </p>
        ) : null}
      </div>
    </div>
  );
}
