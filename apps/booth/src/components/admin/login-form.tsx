"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { post } from "@/components/use-snapshot";

export function LoginForm({ configured }: { configured: boolean }) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await post("/api/admin/login", { password });
    if (res.ok) {
      router.push("/admin");
      router.refresh();
      return;
    }
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    setError(data.error ?? "Could not sign in");
    setBusy(false);
  }

  return (
    <main className="flex min-h-dvh items-center justify-center bg-night p-6 text-cream">
      <form onSubmit={submit} className="card w-full max-w-sm space-y-5 p-6">
        <div>
          <p className="eyebrow">Attendant</p>
          <h1 className="display mt-1 text-3xl">Booth admin</h1>
        </div>
        {!configured ? (
          <p className="rounded-xl bg-gold-tint px-4 py-3 text-sm text-gold">
            ADMIN_PASSWORD is not set on the controller, so nobody can sign in. Set it in .env and restart the booth.
          </p>
        ) : (
          <>
            <label className="block space-y-2">
              <span className="text-sm font-semibold text-cream-soft">Password</span>
              <input
                type="password"
                className="field"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoFocus
                autoComplete="current-password"
                data-testid="password"
              />
            </label>
            {error && <p className="text-sm text-rose" role="alert">{error}</p>}
            <button type="submit" className="btn btn-primary w-full" disabled={busy || password.length === 0}>
              Sign in
            </button>
          </>
        )}
      </form>
    </main>
  );
}
