"use client";

import { useEffect, useRef, useState } from "react";
import type {
  AnnotationLayer,
  PDFDocumentLoadingTask,
  PDFDocumentProxy,
  PDFPageProxy,
  TextLayer,
} from "pdfjs-dist";
import type { PDFLinkService } from "pdfjs-dist/web/pdf_viewer.mjs";
import { cn } from "@/lib/cn";
import { parseClickableUrl } from "@/lib/tracking";
import "./pdf-layers.css";

const DEFAULT_RATIO = 612 / 792; // US Letter, width / height
const DPR_CAP = 2;
const NEAR_MARGIN = "1500px 0px";
const WORKER_URL = "/pdf.worker.min.mjs";

type RenderTask = ReturnType<PDFPageProxy["render"]>;

type LinkService = {
  addLinkAttributes(
    link: HTMLAnchorElement,
    url: string,
    newWindow?: boolean,
  ): void;
  getDestinationHash(destination: unknown): string;
  getAnchorUrl(hash: string): string;
  goToDestination(destination: unknown): Promise<void>;
  executeNamedAction(action: unknown): void;
  executeSetOCGState(state: unknown): void;
  getAttachmentContent(id: string): Promise<null>;
  eventBus: null;
};

/**
 * Minimal `PDFLinkService` for link annotations. The real service pulls in the
 * whole PDF.js viewer UI; we only need external URLs and mail/phone links.
 */
const linkService: LinkService = {
  addLinkAttributes(link, url) {
    const target = parseClickableUrl(url);
    if (!target) return;

    link.href = target.href;

    if (target.protocol === "mailto:" || target.protocol === "tel:") {
      link.removeAttribute("target");
      link.removeAttribute("rel");
      return;
    }

    link.target = "_blank";
    link.rel = "noopener noreferrer";
  },
  getDestinationHash: () => "#",
  getAnchorUrl: () => "#",
  goToDestination: async () => {},
  executeNamedAction: () => {},
  executeSetOCGState: () => {},
  getAttachmentContent: async () => null,
  eventBus: null,
};

export function PdfPages({
  url,
  onPageCount,
  onPagesReady,
}: {
  url: string;
  onPageCount?: (count: number) => void;
  /** Fires once the page elements are in the tree and observable. */
  onPagesReady?: () => void;
}) {
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [ratio, setRatio] = useState(DEFAULT_RATIO);
  const [failed, setFailed] = useState(false);

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
        onPagesReady?.();
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
  }, [url, onPageCount, onPagesReady]);

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
  const textLayerRef = useRef<HTMLDivElement>(null);
  const annotationLayerRef = useRef<HTMLDivElement>(null);
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

    const host = wrapperRef.current;
    const textDiv = textLayerRef.current;
    const annotationDiv = annotationLayerRef.current;
    if (!host || !textDiv || !annotationDiv) return;

    let cancelled = false;
    let task: RenderTask | null = null;
    let textLayer: TextLayer | null = null;
    let annotationLayer: AnnotationLayer | null = null;

    (async () => {
      const pdfjs = await import("pdfjs-dist");
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

      // PDF.js lays these layers out in CSS pixels. The canvas backing store
      // is what DPR scales, so the layer factor must not include the DPR.
      host.style.setProperty(
        "--total-scale-factor",
        String(viewport.scale),
      );

      try {
        const textContent = await page.getTextContent();
        if (cancelled) return;
        const layer = new pdfjs.TextLayer({
          textContentSource: textContent,
          container: textDiv,
          viewport,
        });
        textLayer = layer;
        await layer.render();
        if (cancelled) {
          textDiv.replaceChildren();
          textLayer = null;
        }
      } catch (error) {
        if (!cancelled) console.warn("dwell: text layer failed", error);
        textLayer = null;
        textDiv.replaceChildren();
      }

      if (cancelled) return;

      try {
        const annotations = await page.getAnnotations({ intent: "display" });
        if (cancelled) return;

        const links = annotations.filter(
          (annotation) =>
            annotation.annotationType === pdfjs.AnnotationType.LINK &&
            typeof annotation.url === "string" &&
            parseClickableUrl(annotation.url) !== null,
        );

        if (links.length === 0) {
          annotationDiv.replaceChildren();
          return;
        }

        annotationLayer = new pdfjs.AnnotationLayer({
          div: annotationDiv,
          page,
          viewport,
          linkService,
          accessibilityManager: null,
          annotationCanvasMap: null,
          annotationEditorUIManager: null,
          structTreeLayer: null,
          commentManager: null,
          annotationStorage: null,
        });
        const layer = annotationLayer;
        await layer.render({
          annotations: links,
          viewport,
          div: annotationDiv,
          page,
          linkService: linkService as unknown as PDFLinkService,
          renderForms: false,
        });
        if (cancelled) {
          layer.destroy();
          annotationLayer = null;
          annotationDiv.replaceChildren();
          return;
        }

        // Defense in depth: only web links open a new tab. Mail and phone links
        // keep browser-default behavior; anything else is made inert.
        for (const anchor of annotationDiv.querySelectorAll<HTMLAnchorElement>(
          "a[href]",
        )) {
          const target = parseClickableUrl(anchor.href);
          if (!target) {
            anchor.removeAttribute("href");
          } else if (
            target.protocol === "mailto:" ||
            target.protocol === "tel:"
          ) {
            anchor.removeAttribute("target");
            anchor.removeAttribute("rel");
          } else {
            anchor.target = "_blank";
            anchor.rel = "noopener noreferrer";
          }
        }
      } catch (error) {
        if (!cancelled) console.warn("dwell: annotation layer failed", error);
        annotationLayer?.destroy();
        annotationLayer = null;
        annotationDiv.replaceChildren();
      }
    })().catch(() => {
      // RenderingCancelledException is expected when a page scrolls away.
    });

    return () => {
      cancelled = true;
      task?.cancel();
      if (textLayer) {
        try {
          textLayer.cancel();
        } catch {
          // Already cancelled.
        }
      }
      textLayer = null;
      try {
        annotationLayer?.destroy();
      } catch {
        // Already destroyed.
      }
      annotationLayer = null;
      textDiv.replaceChildren();
      annotationDiv.replaceChildren();
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
      className="pdfPage relative mb-4 w-full overflow-hidden rounded-[2px] bg-white ring-1 ring-black/20 shadow-[0_1px_0_rgba(255,255,255,0.06),0_30px_60px_-30px_rgba(0,0,0,0.95)] sm:mb-6"
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
      <div ref={textLayerRef} className="textLayer" />
      <div ref={annotationLayerRef} className="annotationLayer" />
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
