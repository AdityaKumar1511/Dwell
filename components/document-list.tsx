import type { DashboardDocument } from "@/types/dashboard";
import { DocumentRow } from "@/components/document-row";

export function DocumentList({ documents }: { documents: DashboardDocument[] }) {
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
        <DocumentRow key={document.id} document={document} index={index} />
      ))}
    </ul>
  );
}
