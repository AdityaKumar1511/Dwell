"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { supabasePublicConfig } from "@/lib/env";

let browserClient: SupabaseClient<Database> | undefined;

/**
 * One client per tab. Creating a new client per component spawns extra auth
 * listeners and GoTrue locks, which manifests as random signed-out states.
 */
export function createClient(): SupabaseClient<Database> {
  if (browserClient) return browserClient;
  const { url, anonKey } = supabasePublicConfig();
  browserClient = createBrowserClient<Database>(url, anonKey);
  return browserClient;
}
