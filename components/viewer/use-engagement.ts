"use client";

import { useEffect, useState, type RefObject } from "react";
import {
  TRACK_LIMITS,
  sanitizeClickHref,
  type TrackableEventType,
  type TrackedEvent,
} from "@/lib/tracking";

const TICK_MS = 1_000;
const SETTLE_MS = 150;
const MIN_VISIBLE_RATIO = 0.1;
/** A new page must be this much more visible before we switch. */
const SWITCH_MARGIN = 0.02;
/** Visible + focused, or visible and input within this window. */
const ACTIVITY_WINDOW_MS = 30_000;

const ACTIVITY_EVENTS = [
  "pointerdown",
  "pointermove",
  "keydown",
  "touchstart",
  "scroll",
] as const;

type PageFields = {
  page?: number | null;
  durationMs?: number | null;
  depth?: number | null;
  meta?: { href?: string };
};

/**
 * Owns page detection, active-time accounting, depth, and event delivery for a
 * single reading session. One instance per mounted viewer; no globals.
 */
class EngagementEngine {
  private readonly onPage: (page: number) => void;

  private viewId: string | null = null;
  private currentPage: number | null = null;
  private started = false;
  private closed = false;

  private queue: TrackedEvent[] = [];
  private activeMs = 0;
  private lastTick = 0;
  private lastActivity = Date.now();

  private readonly depth = new Map<number, number>();
  private readonly ratios = new Map<number, number>();
  private container: HTMLElement | null = null;
  private settleTimer: number | null = null;
  private scrollFrame: number | null = null;
  private sending = false;

  constructor(onPage: (page: number) => void) {
    this.onPage = onPage;
  }

  setViewId(viewId: string | null) {
    if (viewId === this.viewId) return;
    this.viewId = viewId;
    this.beginPage();
  }

  /** Observes the rendered pages. Returns the detach function. */
  attachPages(container: HTMLElement): () => void {
    this.container = container;
    this.ratios.clear();

    const pages = Array.from(
      container.querySelectorAll<HTMLElement>("[data-page]"),
    );

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const page = Number((entry.target as HTMLElement).dataset.page);
          if (Number.isFinite(page) && page > 0) {
            this.ratios.set(page, entry.intersectionRatio);
          }
        }
        this.scheduleSettle();
      },
      { threshold: [0, 0.1, 0.25, 0.5, 0.75, 0.9, 1] },
    );

    for (const page of pages) observer.observe(page);

    const onScroll = () => {
      this.lastActivity = Date.now();
      if (this.scrollFrame !== null) return;
      this.scrollFrame = window.requestAnimationFrame(() => {
        this.scrollFrame = null;
        if (this.currentPage !== null) this.updateDepth(this.currentPage);
      });
    };

    const onResize = () => {
      if (this.currentPage !== null) this.updateDepth(this.currentPage);
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onResize);
    container.addEventListener("click", this.handleClick, true);

    if (this.currentPage !== null) this.updateDepth(this.currentPage);

    return () => {
      observer.disconnect();
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onResize);
      container.removeEventListener("click", this.handleClick, true);
      if (this.scrollFrame !== null) window.cancelAnimationFrame(this.scrollFrame);
      if (this.settleTimer !== null) window.clearTimeout(this.settleTimer);
      this.scrollFrame = null;
      this.settleTimer = null;
      this.ratios.clear();
      if (this.container === container) this.container = null;
    };
  }

  /** Visibility, activity, print/copy, and unload listeners. */
  attachLifecycle(): () => void {
    const onVisibility = () => this.handleVisibility();
    const onPageHide = () => this.finish();
    const onBeforePrint = () =>
      this.record("print", { page: this.currentPage });
    const onCopy = () => this.record("copy", { page: this.currentPage });

    const onFocus = () => {
      this.lastActivity = Date.now();
      if (this.lastTick === 0) this.lastTick = Date.now();
    };

    const onKeyDown = (event: KeyboardEvent) => {
      this.lastActivity = Date.now();
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
        this.record("download", { page: this.currentPage });
      }
    };

    const onActivity = () => {
      this.lastActivity = Date.now();
    };

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", onPageHide);
    window.addEventListener("beforeprint", onBeforePrint);
    document.addEventListener("copy", onCopy);
    window.addEventListener("focus", onFocus);
    window.addEventListener("keydown", onKeyDown);
    for (const name of ACTIVITY_EVENTS) {
      window.addEventListener(name, onActivity, { passive: true });
    }

    const tickTimer = window.setInterval(() => this.tick(), TICK_MS);
    const flushTimer = window.setInterval(
      () => void this.flush(),
      TRACK_LIMITS.flushIntervalMs,
    );

    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", onPageHide);
      window.removeEventListener("beforeprint", onBeforePrint);
      document.removeEventListener("copy", onCopy);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("keydown", onKeyDown);
      for (const name of ACTIVITY_EVENTS) {
        window.removeEventListener(name, onActivity);
      }
      window.clearInterval(tickTimer);
      window.clearInterval(flushTimer);

      // No `close` here: React StrictMode remounts effects in development and
      // the real end of a session is pagehide. Just drain what is queued.
      if (this.queue.length > 0) void this.flush();
    };
  }

  private readonly handleClick = (event: MouseEvent) => {
    const target = event.target;
    if (!(target instanceof Element)) return;

    const anchor = target.closest("a[href]");
    if (!(anchor instanceof HTMLAnchorElement)) return;

    const href = sanitizeClickHref(anchor.href);
    if (!href) return;

    const isWebLink =
      anchor.protocol === "http:" || anchor.protocol === "https:";
    const isDownload =
      isWebLink &&
      (anchor.hasAttribute("download") ||
        /\.(pdf|zip|docx?|csv|xlsx?|pptx?)$/i.test(anchor.pathname));

    this.record(isDownload ? "download" : "click", {
      page: this.currentPage,
      meta: { href },
    });
  };

  private scheduleSettle() {
    if (this.settleTimer !== null) window.clearTimeout(this.settleTimer);
    this.settleTimer = window.setTimeout(() => {
      this.settleTimer = null;
      this.settle();
    }, SETTLE_MS);
  }

  private settle() {
    let bestPage: number | null = null;
    let bestRatio = 0;

    for (const [page, ratio] of this.ratios) {
      if (ratio < MIN_VISIBLE_RATIO) continue;
      if (
        bestPage === null ||
        ratio > bestRatio ||
        (ratio === bestRatio && page < bestPage)
      ) {
        bestPage = page;
        bestRatio = ratio;
      }
    }

    if (bestPage === null) return;

    if (this.currentPage === null) {
      this.enterPage(bestPage);
      return;
    }

    if (bestPage === this.currentPage) return;

    const currentRatio = this.ratios.get(this.currentPage) ?? 0;
    if (
      currentRatio < MIN_VISIBLE_RATIO ||
      bestRatio > currentRatio + SWITCH_MARGIN
    ) {
      this.switchPage(bestPage);
    }
  }

  private switchPage(page: number) {
    if (page === this.currentPage) return;

    if (this.currentPage !== null && this.viewId) {
      this.tick();
      this.record("page_leave", {
        page: this.currentPage,
        durationMs: Math.round(this.activeMs),
        depth: this.depth.get(this.currentPage) ?? 0,
      });
    }

    this.enterPage(page);
  }

  private enterPage(page: number) {
    this.currentPage = page;
    this.activeMs = 0;
    this.lastTick = Date.now();
    this.updateDepth(page);
    this.onPage(page);

    if (this.viewId) {
      this.started = true;
      this.record("page_enter", { page, durationMs: 0 });
    }
  }

  /** Called if a viewId arrives after page detection already ran. */
  private beginPage() {
    if (this.started || this.currentPage === null || !this.viewId) return;
    this.started = true;
    this.activeMs = 0;
    this.lastTick = Date.now();
    this.record("page_enter", { page: this.currentPage, durationMs: 0 });
  }

  private updateDepth(page: number) {
    const element = this.container?.querySelector<HTMLElement>(
      `[data-page="${page}"]`,
    );
    if (!element) return;

    const rect = element.getBoundingClientRect();
    if (rect.height <= 0) return;

    const viewport =
      window.innerHeight || document.documentElement.clientHeight || 0;
    const seen = Math.min(rect.bottom, viewport) - rect.top;
    const percent = Math.max(
      0,
      Math.min(100, Math.round((seen / rect.height) * 100)),
    );

    if (percent > (this.depth.get(page) ?? 0)) this.depth.set(page, percent);
  }

  private isActive(now: number): boolean {
    return (
      document.visibilityState === "visible" &&
      (document.hasFocus() || now - this.lastActivity < ACTIVITY_WINDOW_MS)
    );
  }

  private tick() {
    const now = Date.now();
    if (
      this.viewId &&
      this.currentPage !== null &&
      this.lastTick > 0 &&
      this.isActive(now)
    ) {
      this.activeMs += Math.min(now - this.lastTick, TICK_MS);
    }
    this.lastTick = now;
  }

  /** Adds the slice since the last tick, assuming the reader was active. */
  private addPartial() {
    const now = Date.now();
    if (this.lastTick > 0) {
      this.activeMs += Math.min(Math.max(now - this.lastTick, 0), TICK_MS);
    }
    this.lastTick = now;
  }

  private handleVisibility() {
    if (document.visibilityState === "hidden") {
      if (this.started) this.addPartial();
      this.lastTick = 0;

      if (!this.viewId) return;
      this.record("tab_hidden", { page: this.currentPage });
      this.beacon();
      return;
    }

    this.lastActivity = Date.now();
    this.lastTick = Date.now();

    if (this.viewId && this.started) {
      this.record("tab_visible", { page: this.currentPage });
    }
  }

  private finish() {
    if (this.closed) return;
    this.closed = true;

    if (this.viewId) {
      this.addPartial();
      if (this.currentPage !== null) {
        this.record("page_leave", {
          page: this.currentPage,
          durationMs: Math.round(this.activeMs),
          depth: this.depth.get(this.currentPage) ?? 0,
        });
      }
      this.record("close", { page: this.currentPage });
      this.beacon();
    }

    this.activeMs = 0;
  }

  private record(type: TrackableEventType, fields: PageFields = {}) {
    if (!this.viewId) return;

    this.queue.push({ id: newEventId(), type, ...fields });
    if (this.queue.length > TRACK_LIMITS.queueCap) {
      this.queue.splice(0, this.queue.length - TRACK_LIMITS.queueCap);
    }
    if (this.queue.length >= TRACK_LIMITS.eventsPerRequest) {
      void this.flush();
    }
  }

  private async send(events: TrackedEvent[]): Promise<boolean> {
    if (!this.viewId) return true;

    try {
      const response = await fetch("/api/track", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ viewId: this.viewId, events }),
        cache: "no-store",
        keepalive: true,
      });

      if (response.ok) return true;
      // 429/5xx are transient; retry on the next flush. Other 4xx (400, 404,
      // 410, 413) will never succeed, so drop the batch instead of poisoning
      // the queue with events that can never be delivered.
      if (response.status === 429) return false;
      return response.status >= 400 && response.status < 500;
    } catch {
      return false;
    }
  }

  private async flush() {
    if (this.sending || !this.viewId || this.queue.length === 0) return;

    const batch = this.queue.splice(0, TRACK_LIMITS.eventsPerRequest);
    this.sending = true;

    try {
      if (!(await this.send(batch))) this.requeue(batch);
    } finally {
      this.sending = false;
    }
  }

  private beacon() {
    if (!this.viewId) return;

    const events = this.queue.splice(0, this.queue.length);
    for (
      let index = 0;
      index < events.length;
      index += TRACK_LIMITS.eventsPerRequest
    ) {
      const chunk = events.slice(
        index,
        index + TRACK_LIMITS.eventsPerRequest,
      );
      const body = JSON.stringify({ viewId: this.viewId, events: chunk });
      let sent = false;

      try {
        sent = navigator.sendBeacon(
          "/api/track",
          new Blob([body], { type: "application/json" }),
        );
      } catch {
        sent = false;
      }

      if (!sent) void this.send(chunk).then((ok) => !ok && this.requeue(chunk));
    }
  }

  private requeue(batch: TrackedEvent[]) {
    this.queue = [...batch, ...this.queue].slice(0, TRACK_LIMITS.queueCap);
  }
}

export function useEngagementTracker({
  viewId,
  pagesReady,
  containerRef,
}: {
  viewId: string | null;
  pagesReady: boolean;
  containerRef: RefObject<HTMLElement | null>;
}): { currentPage: number } {
  const [currentPage, setCurrentPage] = useState(1);
  const [engine] = useState(() => new EngagementEngine(setCurrentPage));

  useEffect(() => {
    engine.setViewId(viewId);
  }, [engine, viewId]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !pagesReady) return;
    return engine.attachPages(container);
  }, [engine, containerRef, pagesReady]);

  useEffect(() => engine.attachLifecycle(), [engine]);

  return { currentPage };
}

function newEventId(): string {
  const cryptoApi = globalThis.crypto;

  if (cryptoApi && typeof cryptoApi.randomUUID === "function") {
    return cryptoApi.randomUUID();
  }

  const bytes = new Uint8Array(16);
  if (cryptoApi && typeof cryptoApi.getRandomValues === "function") {
    cryptoApi.getRandomValues(bytes);
  } else {
    for (let index = 0; index < bytes.length; index += 1) {
      bytes[index] = Math.floor(Math.random() * 256);
    }
  }

  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;

  const hex = Array.from(bytes, (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");

  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
