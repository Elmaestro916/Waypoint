"use client";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useState } from "react";

export default function AuthForm({ mode }: { mode: "login" | "register" }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [err, setErr] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr("");
    const res = await fetch(`/api/auth/${mode}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(mode === "register" ? { email, password, name } : { email, password }),
    });
    const j = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setErr(j.error || "Something went wrong");
    if (j.needsConfirmation) {
      setNotice("Check your email and click the confirmation link, then sign in.");
      return;
    }
    router.push("/dashboard");
    router.refresh();
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
        <label className="label">Password</label>
        <input className="input" type="password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} />
      </div>
      {err && <p className="text-sm text-red-400">{err}</p>}
      {notice && <p className="text-sm text-emerald-300">{notice}</p>}
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
