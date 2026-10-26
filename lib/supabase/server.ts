import "server-only";

import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { supabasePublicConfig } from "@/lib/env";

/**
 * Request-scoped client bound to the owner's auth cookies. RLS applies, so this
 * is the correct client for anything that reads or writes owner data.
 */
export async function createClient(): Promise<SupabaseClient<Database>> {
  const { url, anonKey } = supabasePublicConfig();
  const cookieStore = await cookies();

  return createServerClient<Database>(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Called from a Server Component, where cookies are read-only.
          // Session refresh is handled by proxy.ts, so this is safe to ignore.
        }
      },
    },
  });
}
