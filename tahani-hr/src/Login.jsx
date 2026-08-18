import React, { useState } from "react";
import { Flower2, Loader2 } from "lucide-react";
import { supabase } from "./supabaseClient";
import { C, mono, serif, inputStyle, btnPrimary, label } from "./tokens";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) setError(error.message);
    setBusy(false);
  }

  return (
    <div style={{ fontFamily: serif, background: C.bg, minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <style>{`
        * { box-sizing: border-box; }
        button { cursor: pointer; font-family: inherit; }
        input:focus { border-color: ${C.leaf} !important; }
      `}</style>
      <form onSubmit={handleSubmit} style={{ background: C.paper, border: `1px solid ${C.line}`, borderRadius: 14, padding: 32, width: "100%", maxWidth: 340 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 24 }}>
          <div style={{ width: 34, height: 34, borderRadius: 8, background: C.leaf, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Flower2 size={18} color="#fff" />
          </div>
          <div>
            <div style={{ fontSize: 17, fontWeight: 600, lineHeight: 1.1 }}>Tahani Flowers</div>
            <div style={{ fontFamily: mono, fontSize: 10, letterSpacing: 1, color: C.inkSoft, textTransform: "uppercase" }}>Staff sign in</div>
          </div>
        </div>

        <div style={{ marginBottom: 14 }}>
          <div style={label}>Email</div>
          <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} style={inputStyle} placeholder="you@example.com" autoComplete="username" />
        </div>
        <div style={{ marginBottom: 18 }}>
          <div style={label}>Password</div>
          <input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} style={inputStyle} placeholder="••••••••" autoComplete="current-password" />
        </div>

        {error && <div style={{ fontSize: 12.5, color: C.red, marginBottom: 14 }}>{error}</div>}

        <button type="submit" disabled={busy} style={btnPrimary}>
          {busy ? <Loader2 size={16} /> : null}
          {busy ? "Signing in…" : "Sign in"}
        </button>

        <div style={{ fontSize: 11.5, color: C.inkSoft, marginTop: 16, lineHeight: 1.5 }}>
          Don't have a login? Ask your manager to create one for you.
        </div>
      </form>
    </div>
  );
}
