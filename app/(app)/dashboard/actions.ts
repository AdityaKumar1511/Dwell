"use server";

import { revalidatePath } from "next/cache";
import { PDFDocument } from "pdf-lib";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { MAX_PDF_BYTES, MAX_PDF_LABEL, MAX_PDF_PAGES } from "@/lib/limits";

const OBJECT_NAME_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.pdf$/i;

export type RegisterDocumentResult =
  | {
      ok: true;
      document: { id: string; title: string; pageCount: number };
    }
  | { ok: false; error: string };

/**
 * Step two of the upload: the browser has already PUT the bytes straight to
 * Storage. Here we re-open that object server-side, verify it really is a PDF,
 * derive the page count ourselves, and only then insert the row. Client-sent
 * metadata (other than the display title) is never trusted.
 */
export async function registerDocument(input: {
  path: string;
  title: string;
}): Promise<RegisterDocumentResult> {
  const user = await requireUser();

  const path = typeof input?.path === "string" ? input.path : "";
  const prefix = `${user.id}/`;
  const objectName = path.startsWith(prefix) ? path.slice(prefix.length) : "";

  if (!objectName || !OBJECT_NAME_PATTERN.test(objectName)) {
    return { ok: false, error: "That upload doesn’t belong to your account." };
  }

  const admin = createAdminClient();
  const bucket = admin.storage.from("documents");

  const cleanup = async () => {
    try {
      await bucket.remove([path]);
    } catch {
      // Orphaned object is swept by the bucket policy; never fail the UX on it.
    }
  };

  const { data: blob, error: downloadError } = await bucket.download(path);
  if (downloadError || !blob) {
    return { ok: false, error: "We couldn’t find that upload. Please try again." };
  }

  if (blob.size > MAX_PDF_BYTES || blob.size === 0) {
    await cleanup();
    return {
      ok: false,
      error: `That file is outside the ${MAX_PDF_LABEL} limit.`,
    };
  }

  const bytes = new Uint8Array(await blob.arrayBuffer());

  // A PDF header may sit anywhere in the first 1024 bytes per the spec.
  const head = new TextDecoder("latin1").decode(bytes.subarray(0, 1024));
  if (!head.includes("%PDF-")) {
    await cleanup();
    return { ok: false, error: "That file isn’t a valid PDF." };
  }

  let pageCount: number;
  try {
    const pdf = await PDFDocument.load(bytes, {
      ignoreEncryption: true,
      updateMetadata: false,
    });
    pageCount = pdf.getPageCount();
  } catch {
    await cleanup();
    return {
      ok: false,
      error: "We couldn’t read that PDF. It may be damaged or password-protected.",
    };
  }

  if (pageCount < 1) {
    await cleanup();
    return { ok: false, error: "That PDF has no pages." };
  }
  if (pageCount > MAX_PDF_PAGES) {
    await cleanup();
    return {
      ok: false,
      error: `That PDF has ${pageCount.toLocaleString("en")} pages. The limit is ${MAX_PDF_PAGES}.`,
    };
  }

  const title = sanitizeTitle(input?.title, objectName);

  const supabase = await createClient();
  const { data: row, error: insertError } = await supabase
    .from("documents")
    .insert({
      owner_id: user.id,
      title,
      file_path: path,
      page_count: pageCount,
      size_bytes: bytes.byteLength,
      mime_type: "application/pdf",
    })
    .select("id, title, page_count")
    .single();

  if (insertError || !row) {
    await cleanup();
    return { ok: false, error: "We couldn’t save that document. Please try again." };
  }

  revalidatePath("/dashboard");

  return {
    ok: true,
    document: { id: row.id, title: row.title, pageCount: row.page_count },
  };
}

function sanitizeTitle(raw: unknown, fallback: string): string {
  const source = typeof raw === "string" ? raw : "";
  const cleaned = source
    .replace(/\.pdf$/i, "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 200)
    .trim();

  if (cleaned) return cleaned;

  const fallbackTitle = fallback.replace(/\.pdf$/i, "").trim().slice(0, 200);
  return fallbackTitle || "Untitled document";
}
