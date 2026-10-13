"use client";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useState } from "react";

export default function AuthForm({ mode, initialError = "" }: { mode: "login" | "register"; initialError?: string }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [err, setErr] = useState(initialError);
  const [notice, setNotice] = useState("");
  const [canResend, setCanResend] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr("");
    setNotice("");
    setCanResend(false);
    const res = await fetch(`/api/auth/${mode}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(mode === "register" ? { email, password, name } : { email, password }),
    });
    const j = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setCanResend(j.code === "email_not_confirmed");
      return setErr(j.error || "Something went wrong");
    }
    if (j.needsConfirmation) {
      setNotice("Check your email and click the confirmation link to finish signing up.");
      setCanResend(true);
      return;
    }
    router.push("/dashboard");
    router.refresh();
  }

  async function resend() {
    setBusy(true);
    setErr("");
    const res = await fetch("/api/auth/resend", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email }),
    });
    setBusy(false);
    if (!res.ok) return setErr("Could not resend the email. Try again in a minute.");
    setNotice(`If ${email} is waiting for confirmation, a new link is on its way.`);
  }

  return (
    <form onSubmit={submit} className="card w-full max-w-sm space-y-4">
      <h1 className="text-xl font-semibold text-white">{mode === "login" ? "Welcome back" : "Create your account"}</h1>
      {mode === "register" && (
        <div>
          <label className="label">Name</label>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
      )}
      <div>
        <label className="label">Email</label>
        <input className="input" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
      </div>
      <div>
        <div className="flex items-baseline justify-between">
          <label className="label">Password</label>
          {mode === "login" && (
            <Link className="text-xs text-accent" href="/forgot-password">Forgot password?</Link>
          )}
        </div>
        <input className="input" type="password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} />
      </div>
      {err && <p className="text-sm text-red-400">{err}</p>}
      {notice && <p className="text-sm text-emerald-300">{notice}</p>}
      {canResend && email && (
        <button type="button" className="text-sm text-accent underline disabled:opacity-50" disabled={busy} onClick={resend}>
          Resend confirmation email
        </button>
      )}
      <button className="btn-primary w-full" disabled={busy}>
        {busy ? "..." : mode === "login" ? "Sign in" : "Create account"}
      </button>
      <p className="text-center text-sm text-slate-400">
        {mode === "login" ? (
          <>New here? <Link className="text-accent" href="/register">Create an account</Link></>
        ) : (
          <>Already registered? <Link className="text-accent" href="/login">Sign in</Link></>
        )}
      </p>
    </form>
  );
}
