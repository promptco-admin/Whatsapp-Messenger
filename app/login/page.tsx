"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"loading" | "setup" | "login">("loading");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch("/api/auth/setup")
      .then((r) => r.json())
      .then((j) => setMode(j.needs_setup ? "setup" : "login"))
      .catch(() => setMode("login"));
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    try {
      const url = mode === "setup" ? "/api/auth/setup" : "/api/auth/login";
      const body = mode === "setup" ? { email, password, name } : { email, password };
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErr(j.error || "Something went wrong");
        return;
      }
      router.push("/");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  if (mode === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-wa-panel">
        <div className="text-sm text-wa-textMuted">Loading…</div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-wa-panel px-4">
      <div className="w-full max-w-sm rounded-lg bg-white p-8 shadow-lg">
        <div className="mb-6 text-center">
          <div className="mb-4 flex justify-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/prompt-logo.png"
              alt="Prompt Group"
              width={140}
              height={140}
              style={{ width: 140, height: "auto", objectFit: "contain" }}
            />
          </div>
          <div className="mb-1 text-base font-semibold text-wa-greenDark">
            WhatsApp Business Messenger
          </div>
          <div className="text-xs text-wa-textMuted">
            {mode === "setup"
              ? "Create the first admin account"
              : "Sign in to continue"}
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          {mode === "setup" && (
            <div>
              <label className="mb-1 block text-xs font-medium text-wa-textMuted">
                Your name
              </label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded border border-wa-border px-3 py-2 text-sm outline-none focus:border-wa-greenDark"
                placeholder="Sid"
              />
            </div>
          )}
          <div>
            <label className="mb-1 block text-xs font-medium text-wa-textMuted">
              Email
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded border border-wa-border px-3 py-2 text-sm outline-none focus:border-wa-greenDark"
              placeholder="you@example.com"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-wa-textMuted">
              Password
            </label>
            <input
              type="password"
              required
              minLength={mode === "setup" ? 8 : 1}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded border border-wa-border px-3 py-2 text-sm outline-none focus:border-wa-greenDark"
              placeholder={mode === "setup" ? "At least 8 characters" : "Your password"}
            />
          </div>

          {err && <div className="rounded bg-red-50 p-2 text-xs text-red-700">{err}</div>}

          <button
            type="submit"
            disabled={busy}
            className="w-full rounded bg-wa-greenDark py-2 text-sm font-medium text-white hover:bg-wa-green disabled:opacity-50"
          >
            {busy ? "…" : mode === "setup" ? "Create admin & sign in" : "Sign in"}
          </button>
        </form>
      </div>
    </div>
  );
}
