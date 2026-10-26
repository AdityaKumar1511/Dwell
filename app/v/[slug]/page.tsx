import { cache } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { SIGNED_URL_TTL_SECONDS, SLUG_PATTERN } from "@/lib/links";
import { Viewer } from "./viewer";

export const dynamic = "force-dynamic";

type ViewerData = {
  slug: string;
  title: string;
  recipientName: string | null;
  pageCount: number;
  signedUrl: string;
};

/**
 * Public link resolution. No cookies, no user session: the slug is the
 * credential. The service role reads the row and signs the PDF, and only the
 * signed URL + display fields leave this module — never file_path.
 */
const loadViewerData = cache(async (slug: string): Promise<ViewerData | null> => {
  if (!SLUG_PATTERN.test(slug)) return null;

  const admin = createAdminClient();

  const { data: link, error } = await admin
    .from("links")
    .select(
      "id, recipient_name, revoked, expires_at, max_views, documents!inner ( id, title, file_path, page_count )",
    )
    .eq("slug", slug)
    .maybeSingle();

  if (error || !link) return null;
  if (link.revoked) return null;
  if (link.expires_at && Date.parse(link.expires_at) <= Date.now()) return null;

  if (link.max_views !== null) {
    const { count, error: countError } = await admin
      .from("views")
      .select("id", { count: "exact", head: true })
      .eq("link_id", link.id);

    if (countError) return null;
    if ((count ?? 0) >= link.max_views) return null;
  }

  const document = link.documents;
  if (!document) return null;

  const { data: signed, error: signError } = await admin.storage
    .from("documents")
    .createSignedUrl(document.file_path, SIGNED_URL_TTL_SECONDS);

  if (signError || !signed?.signedUrl) return null;

  return {
    slug,
    title: document.title,
    recipientName: link.recipient_name,
    pageCount: document.page_count,
    signedUrl: signed.signedUrl,
  };
});

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const data = await loadViewerData(slug);

  if (!data) {
    return {
      title: "Link unavailable",
      robots: { index: false, follow: false },
    };
  }

  return {
    title: data.title,
    description: "A document shared with you on Dwell.",
    robots: { index: false, follow: false },
  };
}

export default async function ViewPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const data = await loadViewerData(slug);

  if (!data) notFound();

  return (
    <Viewer
      slug={data.slug}
      title={data.title}
      recipientName={data.recipientName}
      initialPageCount={data.pageCount}
      signedUrl={data.signedUrl}
    />
  );
}
