"use client";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useState } from "react";

/** "forgot": asks for an email and sends a reset link. "reset": sets a new password for the signed-in user. */
export default function PasswordForm({ mode }: { mode: "forgot" | "reset" }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [err, setErr] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    setNotice("");
    if (mode === "reset" && password !== confirm) return setErr("Passwords don't match");
    setBusy(true);
    const res = await fetch(mode === "forgot" ? "/api/auth/forgot-password" : "/api/auth/update-password", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(mode === "forgot" ? { email } : { password }),
    });
    const j = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setErr(j.error || "Something went wrong");
    if (mode === "forgot") return setNotice(`If an account exists for ${email}, a reset link is on its way.`);
    router.push("/dashboard");
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="card w-full max-w-sm space-y-4">
      <h1 className="text-xl font-semibold text-white">{mode === "forgot" ? "Reset your password" : "Choose a new password"}</h1>
      {mode === "forgot" ? (
        <div>
          <label className="label">Email</label>
          <input className="input" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
      ) : (
        <>
          <div>
            <label className="label">New password</label>
            <input className="input" type="password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          <div>
            <label className="label">Confirm password</label>
            <input className="input" type="password" required minLength={8} value={confirm} onChange={(e) => setConfirm(e.target.value)} />
          </div>
        </>
      )}
      {err && <p className="text-sm text-red-400">{err}</p>}
      {notice && <p className="text-sm text-emerald-300">{notice}</p>}
      <button className="btn-primary w-full" disabled={busy}>
        {busy ? "..." : mode === "forgot" ? "Send reset link" : "Update password"}
      </button>
      <p className="text-center text-sm text-slate-400">
        <Link className="text-accent" href="/login">Back to sign in</Link>
      </p>
    </form>
  );
}
