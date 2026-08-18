import React, { useState, useEffect, useMemo } from "react";
import { MapPin, Check, X, LogIn, LogOut, Settings, Loader2, Navigation } from "lucide-react";
import { supabase } from "./supabaseClient";
import { C, mono, pill, btnPrimary, btnGhost, inputStyle, label, todayStr, timeStr, haversine, getLocation } from "./tokens";

export default function Attendance({ me, isManager }) {
  const [view, setView] = useState("staff"); // managers can flip to an overview; staff always see "staff"
  const [employees, setEmployees] = useState([]); // only populated for managers
  const [settings, setSettings] = useState(null);
  const [myPunches, setMyPunches] = useState([]);
  const [allPunches, setAllPunches] = useState([]); // manager overview only
  const [myLeaves, setMyLeaves] = useState([]);
  const [allLeaves, setAllLeaves] = useState([]); // manager overview only
  const [busy, setBusy] = useState(false);
  const [gpsMsg, setGpsMsg] = useState("");
  const [showSettings, setShowSettings] = useState(false);
  const [showLeaveForm, setShowLeaveForm] = useState(false);
  const [leaveDraft, setLeaveDraft] = useState({ type: "Annual", from: todayStr(), to: todayStr(), reason: "" });

  async function loadMine() {
    const [{ data: set }, { data: p }, { data: l }] = await Promise.all([
      supabase.from("settings").select("*").eq("id", 1).single(),
      supabase.from("punches").select("*").eq("employee_id", me.id).order("ts", { ascending: true }),
      supabase.from("leaves").select("*").eq("employee_id", me.id).order("requested_at", { ascending: false }),
    ]);
    if (set) setSettings(set);
    if (p) setMyPunches(p);
    if (l) setMyLeaves(l);
  }
  async function loadManagerData() {
    const [{ data: emp }, { data: p }, { data: l }] = await Promise.all([
      supabase.from("employees").select("*").order("name"),
      supabase.from("punches").select("*").order("ts", { ascending: true }),
      supabase.from("leaves").select("*").order("requested_at", { ascending: false }),
    ]);
    if (emp) setEmployees(emp);
    if (p) setAllPunches(p);
    if (l) setAllLeaves(l);
  }

  useEffect(() => { loadMine(); if (isManager) loadManagerData(); }, []); // eslint-disable-line

  const myPunchesToday = myPunches.filter((p) => p.ts.slice(0, 10) === todayStr());
  const lastPunch = myPunchesToday[myPunchesToday.length - 1];
  const isPunchedIn = lastPunch && lastPunch.type === "in";

  async function doPunch(type) {
    setBusy(true); setGpsMsg("");
    try {
      const loc = await getLocation();
      let locationType = "field", distance = null;
      if (settings?.shop_lat != null && settings?.shop_lng != null) {
        distance = Math.round(haversine(settings.shop_lat, settings.shop_lng, loc.lat, loc.lng));
        locationType = distance <= settings.radius_meters ? "shop" : "field";
      }
      const { error } = await supabase.from("punches").insert({
        employee_id: me.id, type, ts: new Date().toISOString(),
        lat: loc.lat, lng: loc.lng, location_type: locationType, distance,
      });
      if (error) throw error;
      setGpsMsg(locationType === "shop" ? "Punched at the shop." : "Punched at a field location — logged with GPS.");
      loadMine(); if (isManager) loadManagerData();
    } catch (err) {
      setGpsMsg("Couldn't get location: " + (err.message || "permission denied. Enable location access and try again."));
    } finally { setBusy(false); }
  }

  async function submitLeave() {
    if (!leaveDraft.reason.trim()) return;
    await supabase.from("leaves").insert({
      employee_id: me.id, type: leaveDraft.type, from_date: leaveDraft.from, to_date: leaveDraft.to,
      reason: leaveDraft.reason, status: "pending",
    });
    setLeaveDraft({ type: "Annual", from: todayStr(), to: todayStr(), reason: "" });
    setShowLeaveForm(false);
    loadMine(); if (isManager) loadManagerData();
  }

  async function setLeaveStatus(id, status) {
    await supabase.from("leaves").update({ status }).eq("id", id);
    loadManagerData();
  }

  async function captureShopLocation() {
    setBusy(true);
    try {
      const loc = await getLocation();
      const { error } = await supabase.from("settings").update({ shop_lat: loc.lat, shop_lng: loc.lng }).eq("id", 1);
      if (error) throw error;
      setGpsMsg("Shop location saved.");
      loadMine();
    } catch (err) { setGpsMsg("Couldn't get location: " + err.message); }
    finally { setBusy(false); }
  }

  async function updateSetting(patch) {
    setSettings((s) => ({ ...s, ...patch }));
    await supabase.from("settings").update(patch).eq("id", 1);
  }

  const salarySummary = useMemo(() => {
    if (!settings || !isManager) return [];
    const now = new Date();
    const year = now.getFullYear(), month = now.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    return employees.map((emp) => {
      let absentDays = 0, lateDays = 0, lateMinutesTotal = 0;
      const dailyRate = (emp.salary || 0) / 26;

      for (let d = 1; d <= daysInMonth; d++) {
        const date = new Date(year, month, d);
        if (date > now) break;
        if (date.getDay() === settings.weekly_off) continue;
        const dstr = todayStr(date);

        const approvedLeave = allLeaves.some((l) => l.employee_id === emp.id && l.status === "approved" && dstr >= l.from_date && dstr <= l.to_date);
        if (approvedLeave) continue;

        const dayIns = allPunches.filter((p) => p.employee_id === emp.id && p.ts.slice(0, 10) === dstr && p.type === "in");
        if (dayIns.length === 0) { absentDays++; continue; }
        const firstIn = new Date(dayIns.sort((a, b) => a.ts.localeCompare(b.ts))[0].ts);
        const [sh, sm] = settings.shift_start.split(":").map(Number);
        const shiftStart = new Date(date); shiftStart.setHours(sh, sm, 0, 0);
        const lateMins = Math.max(0, (firstIn - shiftStart) / 60000 - settings.grace_minutes);
        if (lateMins > 0) { lateDays++; lateMinutesTotal += lateMins; }
      }
      const lateDeduction = (lateMinutesTotal / (8 * 60)) * dailyRate;
      const absentDeduction = absentDays * dailyRate;
      const totalDeduction = absentDeduction + lateDeduction;
      const netPay = Math.max(0, (emp.salary || 0) - totalDeduction);
      return { emp, absentDays, lateDays, totalDeduction, netPay };
    });
  }, [employees, allPunches, allLeaves, settings, isManager]);

  const todayAll = employees.map((emp) => {
    const today = allPunches.filter((p) => p.employee_id === emp.id && p.ts.slice(0, 10) === todayStr());
    const last = today[today.length - 1];
    return { emp, status: last ? last.type : "none", last };
  });
  const pendingLeaves = allLeaves.filter((l) => l.status === "pending");

  if (!settings) return <div style={{ padding: 24, color: C.inkSoft }}>Loading…</div>;

  return (
    <div style={{ maxWidth: 560, margin: "0 auto", padding: 20, width: "100%" }}>
      {isManager && (
        <div style={{ display: "flex", gap: 4, background: C.bg, borderRadius: 20, padding: 3, width: "fit-content", marginBottom: 20 }}>
          {["staff", "manager"].map((v) => (
            <button key={v} onClick={() => setView(v)} style={{ border: "none", borderRadius: 18, padding: "6px 14px", fontSize: 11.5, fontFamily: mono, background: view === v ? C.leaf : "transparent", color: view === v ? "#fff" : C.inkSoft, fontWeight: 600 }}>
              {v === "staff" ? "My punch" : "Overview"}
            </button>
          ))}
        </div>
      )}

      {view === "staff" || !isManager ? (
        <>
          <div style={{ background: C.paper, border: `1px solid ${C.line}`, borderRadius: 12, padding: 24, marginBottom: 20 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
              <div style={{ fontSize: 13, color: C.inkSoft, fontFamily: mono }}>{todayStr()}</div>
              <span style={pill(isPunchedIn ? C.green : C.roseSoft, isPunchedIn ? C.leafDark : C.rose)}>{isPunchedIn ? "Punched in" : "Not punched in"}</span>
            </div>
            {myPunchesToday.length > 0 && (
              <div style={{ marginBottom: 18 }}>
                {myPunchesToday.map((p) => (
                  <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, padding: "6px 0", borderBottom: `1px solid ${C.line}` }}>
                    {p.type === "in" ? <LogIn size={14} color={C.leaf} /> : <LogOut size={14} color={C.rose} />}
                    <span style={{ fontFamily: mono, fontWeight: 600 }}>{p.type === "in" ? "IN" : "OUT"}</span>
                    <span>{timeStr(new Date(p.ts))}</span>
                    <span style={{ marginLeft: "auto", ...pill(p.location_type === "shop" ? C.green : C.amberSoft, p.location_type === "shop" ? C.leafDark : "#8C5B1E") }}>
                      <MapPin size={10} /> {p.location_type === "shop" ? "Shop" : "Field"}
                    </span>
                  </div>
                ))}
              </div>
            )}
            <button onClick={() => doPunch(isPunchedIn ? "out" : "in")} disabled={busy} style={{ ...btnPrimary, background: isPunchedIn ? C.rose : C.leaf }}>
              {busy ? <Loader2 size={16} /> : isPunchedIn ? <LogOut size={16} /> : <LogIn size={16} />}
              {busy ? "Getting location…" : isPunchedIn ? "Punch out" : "Punch in"}
            </button>
            {gpsMsg && <div style={{ fontSize: 12, color: C.inkSoft, marginTop: 10, textAlign: "center" }}>{gpsMsg}</div>}
          </div>

          <div style={{ background: C.paper, border: `1px solid ${C.line}`, borderRadius: 12, padding: 20 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <div style={{ fontSize: 15, fontWeight: 600 }}>Leave & excuses</div>
              <button onClick={() => setShowLeaveForm((s) => !s)} style={btnGhost}>{showLeaveForm ? "Cancel" : "+ Request"}</button>
            </div>
            {showLeaveForm && (
              <div style={{ marginBottom: 16, padding: 14, background: C.bg, borderRadius: 8 }}>
                <div style={label}>Type</div>
                <select value={leaveDraft.type} onChange={(e) => setLeaveDraft({ ...leaveDraft, type: e.target.value })} style={{ ...inputStyle, fontFamily: mono, marginBottom: 10 }}>
                  {["Annual", "Sick", "Excuse", "Unpaid"].map((t) => <option key={t}>{t}</option>)}
                </select>
                <div style={{ display: "flex", gap: 10, marginBottom: 10 }}>
                  <div style={{ flex: 1 }}><div style={label}>From</div><input type="date" value={leaveDraft.from} onChange={(e) => setLeaveDraft({ ...leaveDraft, from: e.target.value })} style={inputStyle} /></div>
                  <div style={{ flex: 1 }}><div style={label}>To</div><input type="date" value={leaveDraft.to} onChange={(e) => setLeaveDraft({ ...leaveDraft, to: e.target.value })} style={inputStyle} /></div>
                </div>
                <div style={label}>Reason</div>
                <textarea value={leaveDraft.reason} onChange={(e) => setLeaveDraft({ ...leaveDraft, reason: e.target.value })} style={{ ...inputStyle, minHeight: 60, marginBottom: 12 }} placeholder="Brief reason…" />
                <button onClick={submitLeave} style={btnPrimary}>Submit request</button>
              </div>
            )}
            {myLeaves.length === 0 && !showLeaveForm && <div style={{ fontSize: 13, color: C.inkSoft }}>No requests yet.</div>}
            {myLeaves.map((l) => (
              <div key={l.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: `1px solid ${C.line}`, fontSize: 13 }}>
                <div>
                  <div style={{ fontWeight: 600 }}>{l.type} · {l.from_date}{l.to_date !== l.from_date ? ` → ${l.to_date}` : ""}</div>
                  <div style={{ color: C.inkSoft, fontSize: 12 }}>{l.reason}</div>
                </div>
                <span style={pill(l.status === "approved" ? C.green : l.status === "rejected" ? C.redSoft : C.amberSoft, l.status === "approved" ? C.leafDark : l.status === "rejected" ? C.red : "#8C5B1E")}>{l.status}</span>
              </div>
            ))}
          </div>
        </>
      ) : (
        <>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <div style={{ fontSize: 18, fontWeight: 600 }}>Today's floor</div>
            <button onClick={() => setShowSettings((s) => !s)} style={{ ...btnGhost, display: "flex", alignItems: "center", gap: 6 }}><Settings size={13} /> Settings</button>
          </div>

          {showSettings && (
            <div style={{ background: C.paper, border: `1px solid ${C.line}`, borderRadius: 12, padding: 18, marginBottom: 18 }}>
              <div style={label}>Shop location</div>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
                <div style={{ fontSize: 13, flex: 1 }}>{settings.shop_lat != null ? `${settings.shop_lat.toFixed(5)}, ${settings.shop_lng.toFixed(5)}` : "Not set — punches will log as Field until set"}</div>
                <button onClick={captureShopLocation} disabled={busy} style={{ ...btnGhost, display: "flex", alignItems: "center", gap: 6 }}><Navigation size={12} /> Use my location</button>
              </div>
              <div style={{ display: "flex", gap: 10, marginBottom: 12 }}>
                <div style={{ flex: 1 }}><div style={label}>Shop radius (m)</div><input type="number" value={settings.radius_meters} onChange={(e) => updateSetting({ radius_meters: Number(e.target.value) })} style={inputStyle} /></div>
                <div style={{ flex: 1 }}><div style={label}>Grace (min)</div><input type="number" value={settings.grace_minutes} onChange={(e) => updateSetting({ grace_minutes: Number(e.target.value) })} style={inputStyle} /></div>
              </div>
              <div style={{ display: "flex", gap: 10 }}>
                <div style={{ flex: 1 }}><div style={label}>Shift start</div><input type="time" value={settings.shift_start} onChange={(e) => updateSetting({ shift_start: e.target.value })} style={inputStyle} /></div>
                <div style={{ flex: 1 }}><div style={label}>Shift end</div><input type="time" value={settings.shift_end} onChange={(e) => updateSetting({ shift_end: e.target.value })} style={inputStyle} /></div>
              </div>
              {gpsMsg && <div style={{ fontSize: 12, color: C.inkSoft, marginTop: 10 }}>{gpsMsg}</div>}
            </div>
          )}

          <div style={{ background: C.paper, border: `1px solid ${C.line}`, borderRadius: 12, marginBottom: 18, overflow: "hidden" }}>
            {todayAll.map(({ emp, status, last }) => (
              <div key={emp.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", borderBottom: `1px solid ${C.line}` }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{emp.name}</div>
                  <div style={{ fontSize: 11.5, color: C.inkSoft, fontFamily: mono }}>{emp.role}</div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <span style={pill(status === "in" ? C.green : status === "out" ? C.roseSoft : C.bg, status === "in" ? C.leafDark : status === "out" ? C.rose : C.inkSoft)}>{status === "in" ? "In" : status === "out" ? "Out" : "No punch"}</span>
                  {last && <div style={{ fontSize: 11, color: C.inkSoft, marginTop: 4 }}>{timeStr(new Date(last.ts))} · {last.location_type === "shop" ? "Shop" : "Field"}</div>}
                </div>
              </div>
            ))}
          </div>

          <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 10 }}>Pending requests {pendingLeaves.length > 0 && `(${pendingLeaves.length})`}</div>
          {pendingLeaves.length === 0 ? <div style={{ fontSize: 13, color: C.inkSoft, marginBottom: 18 }}>Nothing waiting on approval.</div> : (
            <div style={{ marginBottom: 18 }}>
              {pendingLeaves.map((l) => {
                const emp = employees.find((e) => e.id === l.employee_id);
                return (
                  <div key={l.id} style={{ background: C.paper, border: `1px solid ${C.line}`, borderRadius: 10, padding: 14, marginBottom: 8 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                      <div style={{ fontWeight: 600, fontSize: 13.5 }}>{emp?.name} · {l.type}</div>
                      <div style={{ fontSize: 12, color: C.inkSoft, fontFamily: mono }}>{l.from_date}{l.to_date !== l.from_date ? ` → ${l.to_date}` : ""}</div>
                    </div>
                    <div style={{ fontSize: 12.5, color: C.inkSoft, marginBottom: 10 }}>{l.reason}</div>
                    <div style={{ display: "flex", gap: 8 }}>
                      <button onClick={() => setLeaveStatus(l.id, "approved")} style={{ ...btnGhost, color: C.leafDark, borderColor: "#CFE0CF", display: "flex", alignItems: "center", gap: 5 }}><Check size={12} /> Approve</button>
                      <button onClick={() => setLeaveStatus(l.id, "rejected")} style={{ ...btnGhost, color: C.red, borderColor: "#E6C8C4", display: "flex", alignItems: "center", gap: 5 }}><X size={12} /> Reject</button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 10 }}>This month's payroll</div>
          <div style={{ background: C.paper, border: `1px solid ${C.line}`, borderRadius: 12, overflow: "hidden" }}>
            {salarySummary.map(({ emp, absentDays, lateDays, totalDeduction, netPay }) => (
              <div key={emp.id} style={{ padding: "13px 16px", borderBottom: `1px solid ${C.line}` }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{emp.name}</div>
                  <div style={{ fontFamily: mono, fontSize: 14, fontWeight: 600 }}>KD {netPay.toFixed(2)}</div>
                </div>
                <div style={{ fontSize: 11.5, color: C.inkSoft, fontFamily: mono }}>base {emp.salary} · {absentDays} absent · {lateDays} late · −{totalDeduction.toFixed(2)}</div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
