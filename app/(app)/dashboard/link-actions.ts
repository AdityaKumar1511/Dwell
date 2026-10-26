"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { SLUG_ENTROPY_BYTES } from "@/lib/links";

export type CreateLinkState = {
  status: "idle" | "created" | "error";
  message?: string;
  slug?: string;
  recipientName?: string;
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_NAME_LENGTH = 120;

export async function createLink(
  _previous: CreateLinkState,
  formData: FormData,
): Promise<CreateLinkState> {
  await requireUser();

  const documentId = String(formData.get("documentId") ?? "").trim();
  if (!UUID_PATTERN.test(documentId)) {
    return { status: "error", message: "Unknown document." };
  }

  const recipientName = normalizeName(formData.get("recipientName"));
  if (!recipientName) {
    return { status: "error", message: "Add a name for this recipient." };
  }

  const recipientEmail = normalizeEmail(formData.get("recipientEmail"));
  if (recipientEmail === false) {
    return { status: "error", message: "That email address doesn’t look right." };
  }

  const supabase = await createClient();

  // RLS on links requires the parent document to belong to this user, so an
  // unauthorized document_id fails the insert rather than creating a link.
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const slug = randomBytes(SLUG_ENTROPY_BYTES).toString("base64url");

    const { data, error } = await supabase
      .from("links")
      .insert({
        document_id: documentId,
        slug,
        recipient_name: recipientName,
        recipient_email: recipientEmail,
      })
      .select("id, slug, recipient_name")
      .single();

    if (!error && data) {
      revalidatePath("/dashboard");
      return {
        status: "created",
        slug: data.slug,
        recipientName: data.recipient_name ?? recipientName,
        message: `Link created for ${data.recipient_name ?? recipientName}.`,
      };
    }

    if (error?.code === "23505") continue; // slug collision, try again
    if (error?.code === "42501" || error?.code === "23503") {
      return { status: "error", message: "That document isn’t in your library." };
    }

    return { status: "error", message: "We couldn’t create that link. Try again." };
  }

  return {
    status: "error",
    message: "We couldn’t generate a unique link. Try again in a moment.",
  };
}

function normalizeName(value: FormDataEntryValue | null): string {
  if (typeof value !== "string") return "";
  return value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, MAX_NAME_LENGTH);
}

/** Returns null for "not provided", the address when valid, or false when invalid. */
function normalizeEmail(value: FormDataEntryValue | null): string | null | false {
  if (typeof value !== "string") return null;
  const email = value.trim().toLowerCase();
  if (!email) return null;
  if (email.length > 254 || !EMAIL_PATTERN.test(email)) return false;
  return email;
}
