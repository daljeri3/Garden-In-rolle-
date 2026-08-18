import React, { useState, useEffect } from "react";
import { Flower2, LogOut } from "lucide-react";
import { supabase } from "./supabaseClient";
import EmployeeRecords from "./EmployeeRecords.jsx";
import Attendance from "./Attendance.jsx";
import Login from "./Login.jsx";
import { C, mono, serif } from "./tokens";

export default function App() {
  const [session, setSession] = useState(undefined); // undefined = loading, null = signed out
  const [me, setMe] = useState(null); // this user's employee record
  const [tab, setTab] = useState("attendance");

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session) { setMe(null); return; }
    supabase.from("employees").select("*").eq("email", session.user.email).single()
      .then(({ data }) => setMe(data || null));
  }, [session]);

  if (session === undefined) return <div style={{ padding: 24, color: C.inkSoft, fontFamily: serif }}>Loading…</div>;
  if (!session) return <Login />;

  if (session && me === null) {
    // Logged in with Supabase, but no matching employee record yet.
    return (
      <div style={{ fontFamily: serif, background: C.bg, minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24, textAlign: "center" }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>Almost there</div>
          <div style={{ fontSize: 14, color: C.inkSoft, maxWidth: 320, marginBottom: 16 }}>
            You're signed in as {session.user.email}, but there's no staff record linked to this login yet.
            Ask your manager to add you in the Records tab using this exact email.
          </div>
          <button onClick={() => supabase.auth.signOut()} style={{ background: "none", border: `1px solid ${C.line}`, borderRadius: 8, padding: "9px 18px", fontSize: 13, fontFamily: mono, color: C.inkSoft }}>Sign out</button>
        </div>
      </div>
    );
  }

  const isManager = !!me.is_manager;

  return (
    <div style={{ fontFamily: serif, background: C.bg, minHeight: "100vh", color: C.ink, display: "flex", flexDirection: "column" }}>
      <style>{`
        * { box-sizing: border-box; }
        button { cursor: pointer; font-family: inherit; }
        input:focus, select:focus, textarea:focus { border-color: ${C.leaf} !important; }
        ::placeholder { color: #B4AF9E; }
        body { margin: 0; }
      `}</style>

      <div style={{ borderBottom: `1px solid ${C.line}`, background: "#FFFFFF", padding: "16px 20px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 32, height: 32, borderRadius: 8, background: C.leaf, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Flower2 size={16} color="#fff" />
          </div>
          <div>
            <div style={{ fontSize: 15.5, fontWeight: 600, lineHeight: 1.1 }}>Tahani Flowers</div>
            <div style={{ fontFamily: mono, fontSize: 10, letterSpacing: 1, color: C.inkSoft, textTransform: "uppercase" }}>{me.name} · {me.role}</div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {isManager && (
            <div style={{ display: "flex", gap: 4, background: C.bg, borderRadius: 20, padding: 3 }}>
              {[["attendance", "Attendance"], ["records", "Records"]].map(([v, l]) => (
                <button key={v} onClick={() => setTab(v)} style={{ border: "none", borderRadius: 18, padding: "6px 14px", fontSize: 11.5, fontFamily: mono, background: tab === v ? C.leaf : "transparent", color: tab === v ? "#fff" : C.inkSoft, fontWeight: 600 }}>{l}</button>
              ))}
            </div>
          )}
          <button onClick={() => supabase.auth.signOut()} title="Sign out" style={{ background: "none", border: `1px solid ${C.line}`, borderRadius: 8, padding: "8px 10px", color: C.inkSoft }}>
            <LogOut size={14} />
          </button>
        </div>
      </div>

      {tab === "records" && isManager ? <EmployeeRecords /> : <Attendance me={me} isManager={isManager} />}
    </div>
  );
}
