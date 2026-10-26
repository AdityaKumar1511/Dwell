"use server";

import { createClient } from "@/lib/supabase/server";
import { getSiteUrl } from "@/lib/site-url";
import { safeNext } from "@/lib/safe-next";

export type LoginState = {
  status: "idle" | "sent" | "error";
  email?: string;
  message?: string;
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function signInWithEmail(
  _previous: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();

  if (email.length > 254 || !EMAIL_PATTERN.test(email)) {
    return { status: "error", message: "That email address doesn’t look right." };
  }

  const supabase = await createClient();
  const siteUrl = await getSiteUrl();
  const next = safeNext(formData.get("next"));

  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      // The callback route exchanges the code and sets the session cookies.
      emailRedirectTo: `${siteUrl}/auth/callback?next=${encodeURIComponent(next)}`,
      shouldCreateUser: true,
    },
  });

  if (error) {
    if (error.status === 429 || error.code === "over_email_send_rate_limit") {
      return {
        status: "error",
        message: "Too many links requested. Wait a minute, then try again.",
      };
    }
    return {
      status: "error",
      message: "We couldn’t send that link. Try again in a moment.",
    };
  }

  // Same response whether or not the account existed — no user enumeration.
  return { status: "sent", email };
}
