import type { Metadata } from "next";
import { DocumentList } from "@/components/document-list";
import { UploadDropzone } from "@/components/upload-dropzone";
import { requireUser } from "@/lib/auth";
import { formatCount } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Dashboard",
};

export default async function DashboardPage() {
  const user = await requireUser();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("documents")
    .select("id, title, page_count, size_bytes, created_at")
    .order("created_at", { ascending: false });

  const documents = data ?? [];
  const totalPages = documents.reduce((sum, document) => sum + document.page_count, 0);

  return (
    <main className="mx-auto w-full max-w-5xl px-6 pb-20 pt-12">
      <header className="animate-rise">
        <p className="font-mono text-[10px] uppercase tracking-[0.28em] text-faint">
          Workspace
        </p>
        <h1 className="mt-3 font-display text-[clamp(2.4rem,6vw,3.6rem)] leading-none tracking-tight text-chalk">
          Your documents
        </h1>
        <p className="mt-4 max-w-lg text-[15px] leading-relaxed text-dim">
          Upload a PDF, then give each recipient their own link. You’ll see who
          opened it, which pages held them, and when they came back.
        </p>
      </header>

      <div className="mt-10 animate-rise" style={{ animationDelay: "80ms" }}>
        <UploadDropzone ownerId={user.id} />
      </div>

      <section className="mt-14">
        <div className="flex items-baseline justify-between gap-6">
          <h2 className="font-mono text-[10px] uppercase tracking-[0.28em] text-faint">
            02 — Library
          </h2>
          <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-faint">
            {documents.length === 0
              ? "Empty"
              : `${formatCount(documents.length, "document")} · ${formatCount(
                  totalPages,
                  "page",
                )} stored`}
          </p>
        </div>

        {error ? (
          <div
            role="alert"
            className="mt-4 border-l border-heat-3/60 py-2 pl-4 text-sm leading-relaxed text-heat-3"
          >
            We couldn’t load your library. Refresh to try again.
          </div>
        ) : (
          <DocumentList documents={documents} />
        )}
      </section>
    </main>
  );
}
