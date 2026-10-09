"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Aperture, Frame, Grain, Spotlight } from "@/components/chrome";
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
    <main className="relative flex min-h-dvh items-center justify-center overflow-hidden bg-velvet p-6 text-ivory">
      <Spotlight />
      <Grain />
      <Frame inset="inset-4" />
      <form onSubmit={submit} className="card card-gold relative w-full max-w-sm space-y-6 p-7 animate-rise">
        <div className="flex items-center gap-4">
          <Aperture className="h-10 w-10 text-gold" />
          <div>
            <p className="eyebrow">Attendant</p>
            <h1 className="display mt-1 text-3xl">Booth admin</h1>
          </div>
        </div>
        {!configured ? (
          <p className="rounded-xl bg-amber-tint px-4 py-3 text-sm text-amber">
            ADMIN_PASSWORD is not set on the controller, so nobody can sign in. Set it in .env and restart the booth.
          </p>
        ) : (
          <>
            <label className="block space-y-2">
              <span className="text-sm font-semibold text-ivory-soft">Password</span>
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
            {error && (
              <p className="text-sm text-claret" role="alert">
                {error}
              </p>
            )}
            <button type="submit" className="btn btn-primary w-full min-h-12" disabled={busy || password.length === 0}>
              Sign in
            </button>
          </>
        )}
      </form>
    </main>
  );
}
