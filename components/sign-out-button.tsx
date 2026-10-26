"use client";

import { useFormStatus } from "react-dom";

export function SignOutButton() {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="font-mono text-[10px] uppercase tracking-[0.2em] text-faint transition-colors hover:text-chalk disabled:opacity-50"
    >
      {pending ? "Signing out" : "Sign out"}
    </button>
  );
}
