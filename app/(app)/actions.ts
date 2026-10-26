"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function signOut() {
  const supabase = await createClient();
  try {
    await supabase.auth.signOut();
  } catch {
    // Local sign-out still matters more than the network call succeeding;
    // the proxy will redirect to /login either way.
  }
  redirect("/login");
}
