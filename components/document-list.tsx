import type { DocumentRow } from "@/types/database";
import { formatBytes, formatCount, relativeTime } from "@/lib/format";

type ListedDocument = Pick<
  DocumentRow,
  "id" | "title" | "page_count" | "size_bytes" | "created_at"
>;

export function DocumentList({ documents }: { documents: ListedDocument[] }) {
  if (documents.length === 0) {
    return (
      <div className="border-t border-line py-16">
        <p className="font-display text-3xl italic text-dim">A clean shelf.</p>
        <p className="mt-3 max-w-sm text-sm leading-relaxed text-faint">
          Your first upload lands here, ready for a tracked link.
        </p>
      </div>
    );
  }

  return (
    <ul className="mt-4 border-t border-line">
      {documents.map((document, index) => (
        <li
          key={document.id}
          className="animate-rise"
          style={{ animationDelay: `${Math.min(index * 45, 360)}ms` }}
        >
          <div className="group grid grid-cols-[2.25rem_1fr_auto] items-center gap-4 border-b border-line py-5 transition-colors hover:border-line-2">
            <span className="font-mono text-[10px] tabular-nums text-faint transition-colors group-hover:text-signal">
              {String(index + 1).padStart(2, "0")}
            </span>

            <div className="min-w-0">
              <p className="truncate text-[15px] text-chalk">{document.title}</p>
              <p className="mt-1.5 font-mono text-[10px] uppercase tracking-[0.16em] text-faint">
                {formatCount(document.page_count, "page")}
                <span aria-hidden className="mx-2 text-line-2">
                  /
                </span>
                {formatBytes(document.size_bytes)}
                <span aria-hidden className="mx-2 text-line-2">
                  /
                </span>
                added {relativeTime(document.created_at)}
              </p>
            </div>

            <span className="hidden items-center gap-2 font-mono text-[10px] uppercase tracking-[0.18em] text-faint sm:inline-flex">
              <span aria-hidden className="h-1 w-1 rounded-full bg-line-2" />
              No links
            </span>
          </div>
        </li>
      ))}
    </ul>
  );
}
