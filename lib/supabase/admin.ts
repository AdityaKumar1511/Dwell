import "server-only";

import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { supabasePublicConfig } from "@/lib/env";

/**
 * Service-role client. Bypasses RLS — server-only, never bundled for the client.
 * Use it for work an anonymous recipient triggers (token-validated routes) and
 * for reading private storage objects. Always validate the caller's authority
 * before touching this.
 */
export function createAdminClient(): SupabaseClient<Database> {
  const { url } = supabasePublicConfig();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!serviceKey) {
    throw new Error(
      "Missing SUPABASE_SERVICE_ROLE_KEY. It must only ever exist in .env.local or your host's server environment.",
    );
  }

  return createSupabaseClient<Database>(url, serviceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });
}
