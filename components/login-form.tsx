"use client";

import { useActionState, useState } from "react";
import { signInWithEmail, type LoginState } from "@/app/login/actions";

const initialState: LoginState = { status: "idle" };

export function LoginPanel({ next }: { next: string }) {
  // Remounting resets useActionState, which is how "use a different email"
  // returns to the form without a second server round-trip.
  const [formKey, setFormKey] = useState(0);
  return (
    <LoginForm
      key={formKey}
      next={next}
      onReset={() => setFormKey((key) => key + 1)}
    />
  );
}

function LoginForm({ onReset, next }: { onReset: () => void; next: string }) {
  const [state, formAction, pending] = useActionState(signInWithEmail, initialState);

  if (state.status === "sent") {
    return (
      <div className="mt-10 animate-rise" role="status" aria-live="polite">
        <p className="font-mono text-[10px] uppercase tracking-[0.28em] text-signal">
          Link sent
        </p>
        <p className="mt-4 text-lg leading-relaxed text-chalk">
          Check your inbox.
        </p>
        <p className="mt-2 text-sm leading-relaxed text-dim">
          We sent a sign-in link to{" "}
          <span className="text-chalk">{state.email}</span>. It works once and
          expires in an hour.
        </p>
        <button
          type="button"
          onClick={onReset}
          className="mt-7 font-mono text-[10px] uppercase tracking-[0.22em] text-faint underline decoration-line-2 underline-offset-4 transition-colors hover:text-signal"
        >
          Use a different email
        </button>
      </div>
    );
  }

  return (
    <form action={formAction} className="mt-10">
      <input type="hidden" name="next" value={next} />
      <label
        htmlFor="email"
        className="font-mono text-[10px] uppercase tracking-[0.24em] text-faint"
      >
        Email
      </label>

      <div className="mt-2 border-b border-line-2 transition-colors duration-300 focus-within:border-signal">
        <input
          id="email"
          name="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          autoFocus
          required
          placeholder="you@studio.com"
          aria-describedby={state.status === "error" ? "login-error" : undefined}
          className="w-full bg-transparent py-3 text-lg text-chalk outline-none placeholder:text-faint/70"
        />
      </div>

      {state.status === "error" && state.message ? (
        <p
          id="login-error"
          role="alert"
          className="mt-4 text-sm leading-relaxed text-heat-3"
        >
          {state.message}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="group mt-8 inline-flex items-center gap-3 rounded-full bg-signal px-5 py-2.5 font-mono text-[11px] uppercase tracking-[0.16em] text-void transition-all duration-300 hover:bg-signal-soft disabled:cursor-wait disabled:opacity-60"
      >
        {pending ? "Sending" : "Email me a link"}
        <svg
          aria-hidden
          viewBox="0 0 16 16"
          className="h-3.5 w-3.5 transition-transform duration-300 group-hover:translate-x-1"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M2 8h11M9 4l4 4-4 4" />
        </svg>
      </button>

      <p className="mt-8 font-mono text-[10px] uppercase tracking-[0.2em] text-faint">
        No password. One-time link.
      </p>
    </form>
  );
}
