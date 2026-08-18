import React, { useState, useEffect, useMemo, useRef } from "react";
import {
  MapPin, Check, X, LogIn, LogOut, Settings, Loader2, Navigation, QrCode, Printer,
  Download, AlertTriangle, ExternalLink, Clock3,
} from "lucide-react";
import { QRCodeCanvas } from "qrcode.react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import * as XLSX from "xlsx";
import { supabase } from "./supabaseClient";
import {
  C, mono, pill, btnPrimary, btnGhost, inputStyle, label,
  todayStr, timeStr, haversine, getLocation, mapsLink, currentMonthStr,
  WEEKDAY_NAMES, annualLeaveAccrued, sickPayTier,
} from "./tokens";

// Kuwait Labor Law No. 6/2010, Article 38: wage deductions for disciplinary
// penalties can never exceed 5 days' pay in a single month. This cap is
// enforced in code, not just documented — see the deduction math below.
const MAX_DEDUCTION_DAYS = 5;

export default function Attendance({ me, isManager }) {
  const [view, setView] = useState("staff");
  const [employees, setEmployees] = useState([]);
  const [settings, setSettings] = useState(null);
  const [myPunches, setMyPunches] = useState([]);
  const [allPunches, setAllPunches] = useState([]);
  const [myLeaves, setMyLeaves] = useState([]);
  const [allLeaves, setAllLeaves] = useState([]);
  const [adjustments, setAdjustments] = useState([]);
  const [warnings, setWarnings] = useState([]);
  const [busy, setBusy] = useState(false);
  const [gpsMsg, setGpsMsg] = useState("");
  const [showSettings, setShowSettings] = useState(false);
  const [showLeaveForm, setShowLeaveForm] = useState(false);
  const [leaveDraft, setLeaveDraft] = useState({ type: "Annual", from: todayStr(), to: todayStr(), reason: "" });
  const [medicalFile, setMedicalFile] = useState(null);
  const [leaveError, setLeaveError] = useState("");
  const [uploadingLeave, setUploadingLeave] = useState(false);
  const [openPayrollId, setOpenPayrollId] = useState(null);
  const [adjustDraft, setAdjustDraft] = useState({ amount: "", note: "" });
  const [warnDraft, setWarnDraft] = useState({ employeeId: "", note: "" });
  const [showWarnForm, setShowWarnForm] = useState(false);
  const [showManualAttendance, setShowManualAttendance] = useState(false);
  const [manualDraft, setManualDraft] = useState({ employeeId: "", date: todayStr(), timeIn: "09:00", timeOut: "", note: "" });
  const [manualMsg, setManualMsg] = useState("");

  const qrCanvasRef = useRef(null);
  const mapRef = useRef(null);
  const mapInstance = useRef(null);
  const settingsMapRef = useRef(null);
  const settingsMapInstance = useRef(null);
  const shopMarkerRef = useRef(null);
  const [pendingShopLoc, setPendingShopLoc] = useState(null);

  const punchUrl = typeof window !== "undefined" ? window.location.origin : "";
  const month = currentMonthStr();

  function printQrCode() {
    const canvas = qrCanvasRef.current?.querySelector("canvas");
    if (!canvas) return;
    const dataUrl = canvas.toDataURL("image/png");
    const w = window.open("", "_blank");
    w.document.write(`
      <html><head><title>Garden In Rolle — Punch QR</title></head>
      <body style="font-family: sans-serif; text-align:center; padding-top: 60px;">
        <h2>Garden In Rolle — Scan to punch in/out</h2>
        <img src="${dataUrl}" style="width:280px;height:280px;" />
        <p style="color:#666; font-size:14px;">Point your phone camera at this code, then open the link.</p>
        <script>window.onload = () => window.print();<\/script>
      </body></html>
    `);
    w.document.close();
  }

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
    const [{ data: emp }, { data: p }, { data: l }, { data: adj }, { data: warn }] = await Promise.all([
      supabase.from("employees").select("*").order("name"),
      supabase.from("punches").select("*").order("ts", { ascending: true }),
      supabase.from("leaves").select("*").order("requested_at", { ascending: false }),
      supabase.from("payroll_adjustments").select("*").eq("month", month),
      supabase.from("warnings").select("*").order("created_at", { ascending: false }),
    ]);
    if (emp) setEmployees(emp);
    if (p) setAllPunches(p);
    if (l) setAllLeaves(l);
    if (adj) setAdjustments(adj);
    if (warn) setWarnings(warn);
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
    if (leaveDraft.type === "Sick" && !medicalFile) {
      setLeaveError("A medical certificate is required for sick leave (Kuwait Labor Law Article 69).");
      return;
    }
    setLeaveError("");
    setUploadingLeave(true);
    let medicalPath = null;
    try {
      if (medicalFile) {
        const path = `${me.id}/${Date.now()}_${medicalFile.name}`;
        const { error: upErr } = await supabase.storage.from("medical-letters").upload(path, medicalFile);
        if (upErr) throw upErr;
        medicalPath = path;
      }
      await supabase.from("leaves").insert({
        employee_id: me.id, type: leaveDraft.type, from_date: leaveDraft.from, to_date: leaveDraft.to,
        reason: leaveDraft.reason, status: "pending", medical_letter_path: medicalPath,
      });
      setLeaveDraft({ type: "Annual", from: todayStr(), to: todayStr(), reason: "" });
      setMedicalFile(null);
      setShowLeaveForm(false);
      loadMine(); if (isManager) loadManagerData();
    } catch (err) {
      setLeaveError("Couldn't submit: " + (err.message || "upload failed, try again."));
    } finally { setUploadingLeave(false); }
  }

  async function viewMedicalLetter(path) {
    const { data, error } = await supabase.storage.from("medical-letters").createSignedUrl(path, 60);
    if (!error && data?.signedUrl) window.open(data.signedUrl, "_blank");
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
      setPendingShopLoc(null);
      loadMine();
      if (settingsMapInstance.current) settingsMapInstance.current.setView([loc.lat, loc.lng], 16);
      if (shopMarkerRef.current) shopMarkerRef.current.setLatLng([loc.lat, loc.lng]);
    } catch (err) { setGpsMsg("Couldn't get location: " + err.message); }
    finally { setBusy(false); }
  }

  async function saveShopLocationFromMap() {
    if (!pendingShopLoc) return;
    setBusy(true);
    const { error } = await supabase.from("settings")
      .update({ shop_lat: pendingShopLoc.lat, shop_lng: pendingShopLoc.lng }).eq("id", 1);
    setBusy(false);
    if (!error) { setGpsMsg("Shop location saved."); loadMine(); }
  }

  async function searchAddress(query) {
    if (!query.trim()) return;
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query + ", Kuwait")}&limit=1`);
      const data = await res.json();
      if (data && data[0]) {
        const lat = parseFloat(data[0].lat), lng = parseFloat(data[0].lon);
        setPendingShopLoc({ lat, lng });
        if (settingsMapInstance.current) settingsMapInstance.current.setView([lat, lng], 16);
        if (shopMarkerRef.current) shopMarkerRef.current.setLatLng([lat, lng]);
      } else {
        setGpsMsg("Couldn't find that address — try a more specific search.");
      }
    } catch { setGpsMsg("Address search failed — check your connection."); }
  }

  async function updateSetting(patch) {
    setSettings((s) => ({ ...s, ...patch }));
    await supabase.from("settings").update(patch).eq("id", 1);
  }

  async function saveAdjustment(employeeId) {
    const amount = parseFloat(adjustDraft.amount) || 0;
    await supabase.from("payroll_adjustments").upsert(
      { employee_id: employeeId, month, amount, note: adjustDraft.note, updated_at: new Date().toISOString() },
      { onConflict: "employee_id,month" }
    );
    setOpenPayrollId(null);
    setAdjustDraft({ amount: "", note: "" });
    loadManagerData();
  }

  async function addManualWarning() {
    if (!warnDraft.employeeId || !warnDraft.note.trim()) return;
    await supabase.from("warnings").insert({
      employee_id: warnDraft.employeeId, type: "manual", note: warnDraft.note, date: todayStr(),
    });
    setWarnDraft({ employeeId: "", note: "" });
    setShowWarnForm(false);
    loadManagerData();
  }

  async function addManualAttendance() {
    if (!manualDraft.employeeId || !manualDraft.date) return;
    setManualMsg("Saving…");
    const rows = [];
    if (manualDraft.timeIn) {
      rows.push({
        employee_id: manualDraft.employeeId, type: "in",
        ts: new Date(`${manualDraft.date}T${manualDraft.timeIn}:00`).toISOString(),
        location_type: "manual", lat: null, lng: null, distance: null,
      });
    }
    if (manualDraft.timeOut) {
      rows.push({
        employee_id: manualDraft.employeeId, type: "out",
        ts: new Date(`${manualDraft.date}T${manualDraft.timeOut}:00`).toISOString(),
        location_type: "manual", lat: null, lng: null, distance: null,
      });
    }
    if (rows.length === 0) { setManualMsg("Add at least a punch-in time."); return; }
    const { error } = await supabase.from("punches").insert(rows);
    if (error) { setManualMsg("Couldn't save: " + error.message); return; }
    if (manualDraft.note.trim()) {
      await supabase.from("warnings").insert({
        employee_id: manualDraft.employeeId, type: "manual", date: manualDraft.date,
        note: `Manual attendance entry: ${manualDraft.note}`,
      });
    }
    setManualMsg(`Saved for ${manualDraft.date}.`);
    setManualDraft({ employeeId: manualDraft.employeeId, date: todayStr(), timeIn: "09:00", timeOut: "", note: "" });
    loadManagerData();
  }

  // ---- Payroll: absence/lateness math with progressive warnings.
  // Lateness is a disciplinary fine → capped at 5 days/month (Article 38).
  // Unexcused absence is simply unpaid time, not a fine → NOT capped, since
  // "no work, no pay" isn't a penalty under the law, it's just not earning
  // wages for days not worked. Approved sick leave follows the Article 69
  // pay tiers instead of a flat deduction. ----
  const salarySummary = useMemo(() => {
    if (!settings || !isManager) return [];
    const now = new Date();
    const year = now.getFullYear(), monthIdx = now.getMonth();
    const daysInMonth = new Date(year, monthIdx + 1, 0).getDate();
    const yearStart = `${year}-01-01`;

    return employees.map((emp) => {
      let absentCount = 0, lateCount = 0, lateMinutesTotal = 0, sickDaysThisMonth = 0;
      const dailyRate = (emp.salary || 0) / 26;

      // Sick days already used earlier this year (before this month), for tiering
      const sickDaysUsedBeforeThisMonth = allLeaves.filter((l) =>
        l.employee_id === emp.id && l.type === "Sick" && l.status === "approved" &&
        l.from_date >= yearStart && l.from_date < `${year}-${String(monthIdx + 1).padStart(2, "0")}-01`
      ).reduce((sum, l) => sum + (new Date(l.to_date) - new Date(l.from_date)) / 86400000 + 1, 0);
      let sickRunning = sickDaysUsedBeforeThisMonth;

      for (let d = 1; d <= daysInMonth; d++) {
        const date = new Date(year, monthIdx, d);
        if (date > now) break;
        if (date.getDay() === settings.weekly_off) continue;
        const dstr = todayStr(date);
        if (settings.tracking_start_date && dstr < settings.tracking_start_date) continue; // before the app was in use — don't penalize

        const approvedSick = allLeaves.some((l) => l.employee_id === emp.id && l.type === "Sick" && l.status === "approved" && dstr >= l.from_date && dstr <= l.to_date);
        if (approvedSick) { sickDaysThisMonth++; continue; }

        const approvedOtherLeave = allLeaves.some((l) => l.employee_id === emp.id && l.type !== "Sick" && l.status === "approved" && dstr >= l.from_date && dstr <= l.to_date);
        if (approvedOtherLeave) continue;

        const dayIns = allPunches.filter((p) => p.employee_id === emp.id && p.ts.slice(0, 10) === dstr && p.type === "in");
        if (dayIns.length === 0) {
          absentCount++; // unexcused: no punch, no approved leave, no medical note
          continue;
        }
        const firstIn = new Date(dayIns.sort((a, b) => a.ts.localeCompare(b.ts))[0].ts);
        const [sh, sm] = settings.shift_start.split(":").map(Number);
        const shiftStart = new Date(date); shiftStart.setHours(sh, sm, 0, 0);
        const lateMins = Math.max(0, (firstIn - shiftStart) / 60000 - settings.grace_minutes);
        if (lateMins > 0) {
          lateCount++;
          if (lateCount > 1) lateMinutesTotal += lateMins; // 1st late this month = warning only
        }
      }

      // Lateness: disciplinary fine, capped at 5 days' wage/month (Art. 38)
      const rawLateDeduction = (lateMinutesTotal / (8 * 60)) * dailyRate;
      const legalCap = dailyRate * MAX_DEDUCTION_DAYS;
      const lateCapped = rawLateDeduction > legalCap;
      const lateDeduction = Math.min(rawLateDeduction, legalCap);

      // Absence: unpaid time, not a fine — direct, uncapped deduction
      const absentDeduction = absentCount * dailyRate;
      const highAbsenceRisk = absentCount > 5; // Art. 41 territory — flagged, not automated

      // Sick leave: pay per Article 69 tier based on cumulative days this year
      const sickPayable = sickPayTier(Math.round(sickRunning), sickDaysThisMonth);
      const sickUnpaidDeduction = Math.max(0, (sickDaysThisMonth - sickPayable)) * dailyRate;

      const disciplinaryDeduction = lateDeduction; // only the capped, fine-based part
      const totalDeduction = disciplinaryDeduction + absentDeduction + sickUnpaidDeduction;

      const adj = adjustments.find((a) => a.employee_id === emp.id);
      const adjustment = adj?.amount || 0;
      const netPay = Math.max(0, (emp.salary || 0) - totalDeduction + adjustment);

      const usedAnnualThisYear = allLeaves.filter((l) =>
        l.employee_id === emp.id && l.type === "Annual" && l.status === "approved" && l.from_date >= yearStart
      ).reduce((sum, l) => sum + (new Date(l.to_date) - new Date(l.from_date)) / 86400000 + 1, 0);
      const annualAccrued = annualLeaveAccrued(emp.contract_start, now);
      const annualBalance = Math.max(0, annualAccrued - usedAnnualThisYear);

      return {
        emp, absentCount, lateCount, lateDeduction, lateCapped, absentDeduction, highAbsenceRisk,
        sickDaysThisMonth, sickUnpaidDeduction, totalDeduction, adjustment, note: adj?.note || "",
        netPay, annualAccrued, annualBalance, sickUsedThisYear: Math.round(sickDaysUsedBeforeThisMonth + sickDaysThisMonth),
      };
    });
  }, [employees, allPunches, allLeaves, settings, isManager, adjustments]);

  // Auto-generate a written warning the first time someone is late or
  // absent in a month, before any deduction applies — matching Article 37's
  // requirement that a worker be notified in writing before being penalized.
  useEffect(() => {
    if (!isManager || !settings || employees.length === 0) return;
    const toCreate = [];
    salarySummary.forEach(({ emp, absentCount, lateCount }) => {
      if (absentCount >= 1) toCreate.push({ employee_id: emp.id, type: "absence", month, date: todayStr(), note: "Automatic: unexcused absence on record this month" });
      if (lateCount >= 1) toCreate.push({ employee_id: emp.id, type: "late", month, date: todayStr(), note: "Automatic: first late arrival this month" });
    });
    if (toCreate.length === 0) return;
    supabase.from("warnings").upsert(toCreate, { onConflict: "employee_id,type,month", ignoreDuplicates: true })
      .then(() => supabase.from("warnings").select("*").order("created_at", { ascending: false }))
      .then(({ data }) => { if (data) setWarnings(data); });
  }, [salarySummary]); // eslint-disable-line

  const todayAll = employees.map((emp) => {
    const today = allPunches.filter((p) => p.employee_id === emp.id && p.ts.slice(0, 10) === todayStr());
    const last = today[today.length - 1];
    return { emp, status: last ? last.type : "none", last };
  });
  const pendingLeaves = allLeaves.filter((l) => l.status === "pending");
  const recentWarnings = warnings.slice(0, 10);

  // ---- Excel export of all punch records ----
  function exportPunchesToExcel() {
    const rows = allPunches.map((p) => {
      const emp = employees.find((e) => e.id === p.employee_id);
      return {
        Name: emp?.name || "Unknown", Role: emp?.role || "", Type: p.type === "in" ? "Punch In" : "Punch Out",
        Date: p.ts.slice(0, 10), Time: timeStr(new Date(p.ts)), Location: p.location_type === "shop" ? "Shop" : p.location_type === "manual" ? "Manual entry" : "Field",
        "Distance from shop (m)": p.distance ?? "", Latitude: p.lat, Longitude: p.lng,
        "Google Maps link": mapsLink(p.lat, p.lng),
      };
    });
    const ws = XLSX.utils.json_to_sheet(rows);
    ws["!cols"] = [{ wch: 20 }, { wch: 12 }, { wch: 10 }, { wch: 12 }, { wch: 10 }, { wch: 8 }, { wch: 16 }, { wch: 10 }, { wch: 10 }, { wch: 40 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Punches");
    XLSX.writeFile(wb, `garden-in-rolle-punches-${todayStr()}.xlsx`);
  }

  // ---- Live map (Overview) ----
  useEffect(() => {
    if (view !== "manager" || !isManager || !mapRef.current || mapInstance.current || !settings) return;
    const center = settings.shop_lat != null ? [settings.shop_lat, settings.shop_lng] : [29.3759, 47.9774];
    const map = L.map(mapRef.current).setView(center, 14);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { attribution: "&copy; OpenStreetMap contributors", maxZoom: 19 }).addTo(map);
    if (settings.shop_lat != null) {
      L.circle(center, { radius: settings.radius_meters, color: "#3F5B44", fillColor: "#3F5B44", fillOpacity: 0.1 }).addTo(map);
      const shopIcon = L.divIcon({ className: "", html: '<div style="background:#3F5B44;width:14px;height:14px;border-radius:50%;border:2px solid #fff;"></div>', iconSize: [14, 14] });
      L.marker(center, { icon: shopIcon }).addTo(map).bindPopup("Garden In Rolle — Shop");
    }
    todayAll.forEach(({ emp, last }) => {
      if (!last || last.lat == null || last.lng == null) return;
      const color = last.location_type === "shop" ? "#3F5B44" : "#B98A3E";
      const icon = L.divIcon({ className: "", html: `<div style="background:${color};width:12px;height:12px;border-radius:50%;border:2px solid #fff;"></div>`, iconSize: [12, 12] });
      L.marker([last.lat, last.lng], { icon }).addTo(map)
        .bindPopup(`<b>${emp.name}</b><br>${emp.role}<br>${timeStr(new Date(last.ts))} · ${last.location_type === "shop" ? "Shop" : "Field"}<br><a href="${mapsLink(last.lat, last.lng)}" target="_blank">Open in Google Maps →</a>`);
    });
    mapInstance.current = map;
    setTimeout(() => map.invalidateSize(), 100);
    return () => { map.remove(); mapInstance.current = null; };
  }, [view, isManager, settings, allPunches]); // eslint-disable-line

  // ---- Settings map: click-to-set shop location ----
  useEffect(() => {
    if (!showSettings || !settingsMapRef.current || settingsMapInstance.current || !settings) return;
    const start = settings.shop_lat != null ? [settings.shop_lat, settings.shop_lng] : [29.3759, 47.9774];
    const map = L.map(settingsMapRef.current).setView(start, settings.shop_lat != null ? 16 : 11);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { attribution: "&copy; OpenStreetMap contributors", maxZoom: 19 }).addTo(map);
    const icon = L.divIcon({ className: "", html: '<div style="background:#3F5B44;width:16px;height:16px;border-radius:50%;border:3px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,0.3);"></div>', iconSize: [16, 16] });
    const marker = L.marker(start, { icon, draggable: true }).addTo(map);
    shopMarkerRef.current = marker;

    map.on("click", (e) => { setPendingShopLoc({ lat: e.latlng.lat, lng: e.latlng.lng }); marker.setLatLng(e.latlng); });
    marker.on("dragend", () => { const pos = marker.getLatLng(); setPendingShopLoc({ lat: pos.lat, lng: pos.lng }); });

    settingsMapInstance.current = map;
    setTimeout(() => map.invalidateSize(), 100);
    return () => { map.remove(); settingsMapInstance.current = null; shopMarkerRef.current = null; };
  }, [showSettings, settings]);

  if (!settings) return <div style={{ padding: 24, color: C.inkSoft }}>Loading…</div>;

  return (
    <div style={{ maxWidth: 620, margin: "0 auto", padding: 20, width: "100%" }}>
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
                    <span style={{ marginLeft: "auto", ...pill(p.location_type === "shop" ? C.green : p.location_type === "manual" ? C.bg : C.amberSoft, p.location_type === "shop" ? C.leafDark : p.location_type === "manual" ? C.inkSoft : "#8C5B1E") }}>
                      <MapPin size={10} /> {p.location_type === "shop" ? "Shop" : p.location_type === "manual" ? "Manual" : "Field"}
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
                <select value={leaveDraft.type} onChange={(e) => { setLeaveDraft({ ...leaveDraft, type: e.target.value }); setLeaveError(""); }} style={{ ...inputStyle, fontFamily: mono, marginBottom: 10 }}>
                  {["Annual", "Sick", "Excuse", "Unpaid"].map((t) => <option key={t}>{t}</option>)}
                </select>
                <div style={{ display: "flex", gap: 10, marginBottom: 10 }}>
                  <div style={{ flex: 1 }}><div style={label}>From</div><input type="date" value={leaveDraft.from} onChange={(e) => setLeaveDraft({ ...leaveDraft, from: e.target.value })} style={inputStyle} /></div>
                  <div style={{ flex: 1 }}><div style={label}>To</div><input type="date" value={leaveDraft.to} onChange={(e) => setLeaveDraft({ ...leaveDraft, to: e.target.value })} style={inputStyle} /></div>
                </div>
                <div style={label}>Reason</div>
                <textarea value={leaveDraft.reason} onChange={(e) => setLeaveDraft({ ...leaveDraft, reason: e.target.value })} style={{ ...inputStyle, minHeight: 60, marginBottom: 12 }} placeholder="Brief reason…" />
                {leaveDraft.type === "Sick" && (
                  <div style={{ marginBottom: 12 }}>
                    <div style={label}>Medical certificate — required for sick leave</div>
                    <input type="file" accept="image/*,.pdf" onChange={(e) => { setMedicalFile(e.target.files[0] || null); setLeaveError(""); }} style={{ fontSize: 12.5 }} />
                    <div style={{ fontSize: 11.5, color: C.inkSoft, marginTop: 6, lineHeight: 1.5 }}>
                      Kuwait Labor Law (Article 69) requires a report from a doctor recognized by the employer, or a government health center, before sick leave is paid.
                    </div>
                  </div>
                )}
                {leaveError && <div style={{ fontSize: 12.5, color: C.red, marginBottom: 10 }}>{leaveError}</div>}
                <button onClick={submitLeave} disabled={uploadingLeave} style={btnPrimary}>{uploadingLeave ? "Submitting…" : "Submit request"}</button>
              </div>
            )}
            {myLeaves.length === 0 && !showLeaveForm && <div style={{ fontSize: 13, color: C.inkSoft }}>No requests yet.</div>}
            {myLeaves.map((l) => (
              <div key={l.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: `1px solid ${C.line}`, fontSize: 13 }}>
                <div>
                  <div style={{ fontWeight: 600 }}>{l.type} · {l.from_date}{l.to_date !== l.from_date ? ` → ${l.to_date}` : ""}</div>
                  <div style={{ color: C.inkSoft, fontSize: 12 }}>{l.reason}</div>
                  {l.medical_letter_path && <button onClick={() => viewMedicalLetter(l.medical_letter_path)} style={{ background: "none", border: "none", color: C.leaf, fontSize: 11.5, fontFamily: mono, padding: 0, cursor: "pointer" }}>View certificate ↗</button>}
                </div>
                <span style={pill(l.status === "approved" ? C.green : l.status === "rejected" ? C.redSoft : C.amberSoft, l.status === "approved" ? C.leafDark : l.status === "rejected" ? C.red : "#8C5B1E")}>{l.status}</span>
              </div>
            ))}
          </div>
        </>
      ) : (
        <>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 8 }}>
            <div style={{ fontSize: 18, fontWeight: 600 }}>Today's floor</div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button onClick={exportPunchesToExcel} style={{ ...btnGhost, display: "flex", alignItems: "center", gap: 6 }}><Download size={13} /> Export Excel</button>
              <button onClick={() => setShowManualAttendance((s) => !s)} style={{ ...btnGhost, display: "flex", alignItems: "center", gap: 6 }}><Clock3 size={13} /> Add attendance</button>
              <button onClick={() => setShowSettings((s) => !s)} style={{ ...btnGhost, display: "flex", alignItems: "center", gap: 6 }}><Settings size={13} /> Settings</button>
            </div>
          </div>

          {showManualAttendance && (
            <div style={{ background: C.paper, border: `1px solid ${C.line}`, borderRadius: 12, padding: 18, marginBottom: 18 }}>
              <div style={label}>Add attendance manually</div>
              <div style={{ fontSize: 12.5, color: C.inkSoft, marginBottom: 12, lineHeight: 1.5 }}>
                For a forgotten punch, a correction, or backfilling a day before someone started using the app.
                This counts the same as a real punch for payroll purposes.
              </div>
              <select value={manualDraft.employeeId} onChange={(e) => setManualDraft({ ...manualDraft, employeeId: e.target.value })} style={{ ...inputStyle, fontFamily: mono, marginBottom: 10 }}>
                <option value="">Select employee…</option>
                {employees.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
              </select>
              <div style={{ marginBottom: 10 }}>
                <div style={label}>Date</div>
                <input type="date" value={manualDraft.date} onChange={(e) => setManualDraft({ ...manualDraft, date: e.target.value })} style={inputStyle} />
              </div>
              <div style={{ display: "flex", gap: 10, marginBottom: 10 }}>
                <div style={{ flex: 1 }}>
                  <div style={label}>Punch in</div>
                  <input type="time" value={manualDraft.timeIn} onChange={(e) => setManualDraft({ ...manualDraft, timeIn: e.target.value })} style={inputStyle} />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={label}>Punch out (optional)</div>
                  <input type="time" value={manualDraft.timeOut} onChange={(e) => setManualDraft({ ...manualDraft, timeOut: e.target.value })} style={inputStyle} />
                </div>
              </div>
              <div style={{ marginBottom: 12 }}>
                <div style={label}>Note (optional)</div>
                <input value={manualDraft.note} onChange={(e) => setManualDraft({ ...manualDraft, note: e.target.value })} placeholder="e.g. forgot to punch in, corrected after review…" style={inputStyle} />
              </div>
              <button onClick={addManualAttendance} style={btnPrimary}>Save attendance</button>
              {manualMsg && <div style={{ fontSize: 12, color: C.inkSoft, marginTop: 10 }}>{manualMsg}</div>}
            </div>
          )}

          {showSettings && (
            <div style={{ background: C.paper, border: `1px solid ${C.line}`, borderRadius: 12, padding: 18, marginBottom: 18 }}>
              <div style={label}>Work location</div>
              <div style={{ fontSize: 12.5, color: C.inkSoft, marginBottom: 10, lineHeight: 1.5 }}>
                Search an address or click anywhere on the map to drop the pin. Drag it to fine-tune.
              </div>
              <input
                placeholder="Search an address in Kuwait, then press Enter…"
                style={{ ...inputStyle, marginBottom: 10 }}
                onKeyDown={(e) => { if (e.key === "Enter") searchAddress(e.target.value); }}
              />
              <div ref={settingsMapRef} style={{ height: 260, borderRadius: 10, overflow: "hidden", border: `1px solid ${C.line}` }} />
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 10, marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
                <div className="mono" style={{ fontFamily: mono, fontSize: 12, color: C.inkSoft }}>
                  {pendingShopLoc
                    ? `New: ${pendingShopLoc.lat.toFixed(5)}, ${pendingShopLoc.lng.toFixed(5)} (unsaved)`
                    : settings.shop_lat != null ? `Current: ${settings.shop_lat.toFixed(5)}, ${settings.shop_lng.toFixed(5)}` : "Not set yet"}
                </div>
                {pendingShopLoc && (
                  <a href={mapsLink(pendingShopLoc.lat, pendingShopLoc.lng)} target="_blank" rel="noreferrer" style={{ fontFamily: mono, fontSize: 12, color: C.leaf, display: "flex", alignItems: "center", gap: 4 }}>
                    Verify on Google Maps <ExternalLink size={11} />
                  </a>
                )}
              </div>
              <div style={{ display: "flex", gap: 8, marginBottom: 18 }}>
                <button onClick={saveShopLocationFromMap} disabled={!pendingShopLoc || busy} style={{ ...btnPrimary, opacity: pendingShopLoc ? 1 : 0.5 }}>Save this location</button>
                <button onClick={captureShopLocation} disabled={busy} style={{ ...btnGhost, display: "flex", alignItems: "center", gap: 6, whiteSpace: "nowrap" }}><Navigation size={12} /> Use my location</button>
              </div>

              <div style={{ display: "flex", gap: 10, marginBottom: 12 }}>
                <div style={{ flex: 1 }}><div style={label}>Shop radius (m)</div><input type="number" value={settings.radius_meters} onChange={(e) => updateSetting({ radius_meters: Number(e.target.value) })} style={inputStyle} /></div>
                <div style={{ flex: 1 }}><div style={label}>Grace (min)</div><input type="number" value={settings.grace_minutes} onChange={(e) => updateSetting({ grace_minutes: Number(e.target.value) })} style={inputStyle} /></div>
              </div>
              <div style={{ display: "flex", gap: 10, marginBottom: 12 }}>
                <div style={{ flex: 1 }}><div style={label}>Shift start</div><input type="time" value={settings.shift_start} onChange={(e) => updateSetting({ shift_start: e.target.value })} style={inputStyle} /></div>
                <div style={{ flex: 1 }}><div style={label}>Shift end</div><input type="time" value={settings.shift_end} onChange={(e) => updateSetting({ shift_end: e.target.value })} style={inputStyle} /></div>
              </div>
              <div style={{ marginBottom: 4 }}>
                <div style={label}>Weekly off day</div>
                <select value={settings.weekly_off} onChange={(e) => updateSetting({ weekly_off: Number(e.target.value) })} style={{ ...inputStyle, fontFamily: mono }}>
                  {WEEKDAY_NAMES.map((name, idx) => <option key={idx} value={idx}>{name}</option>)}
                </select>
              </div>
              <div style={{ marginTop: 12 }}>
                <div style={label}>Start counting attendance from</div>
                <input type="date" value={settings.tracking_start_date || todayStr()} onChange={(e) => updateSetting({ tracking_start_date: e.target.value })} style={inputStyle} />
                <div style={{ fontSize: 11.5, color: C.inkSoft, marginTop: 6, lineHeight: 1.5 }}>
                  Days before this date are never counted as absent or late — use this to skip the gap
                  between when someone actually started and when you began using the app.
                </div>
              </div>
              {gpsMsg && <div style={{ fontSize: 12, color: C.inkSoft, marginTop: 10 }}>{gpsMsg}</div>}

              <div style={{ borderTop: `1px solid ${C.line}`, marginTop: 18, paddingTop: 18 }}>
                <div style={{ ...label, display: "flex", alignItems: "center", gap: 6 }}><QrCode size={13} /> Punch-in QR code</div>
                <div style={{ fontSize: 12.5, color: C.inkSoft, marginBottom: 12, lineHeight: 1.5 }}>
                  Print this and stick it at the shop counter. It's a shortcut to open the app — GPS still verifies where they actually are.
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                  <div ref={qrCanvasRef} style={{ background: "#fff", padding: 10, border: `1px solid ${C.line}`, borderRadius: 8 }}>
                    <QRCodeCanvas value={punchUrl} size={110} bgColor="#ffffff" fgColor={C.ink} level="M" />
                  </div>
                  <button onClick={printQrCode} style={{ ...btnGhost, display: "flex", alignItems: "center", gap: 6 }}>
                    <Printer size={13} /> Print QR code
                  </button>
                </div>
              </div>
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
                  {last && (
                    <div style={{ fontSize: 11, color: C.inkSoft, marginTop: 4 }}>
                      {timeStr(new Date(last.ts))} · {last.location_type === "shop" ? "Shop" : last.location_type === "manual" ? "Manual entry" : "Field"}
                      {last.lat != null && (
                        <>
                          {" · "}
                          <a href={mapsLink(last.lat, last.lng)} target="_blank" rel="noreferrer" style={{ color: C.leaf }}>map ↗</a>
                        </>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>

          <div className="mono" style={{ fontSize: 15, fontWeight: 600, marginBottom: 10, fontFamily: "inherit" }}>Live map</div>
          <div style={{ background: C.paper, border: `1px solid ${C.line}`, borderRadius: 12, padding: 12, marginBottom: 18 }}>
            <div ref={mapRef} style={{ height: 280, borderRadius: 10, overflow: "hidden" }} />
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
                    {l.medical_letter_path && (
                      <button onClick={() => viewMedicalLetter(l.medical_letter_path)} style={{ background: "none", border: "none", color: C.leaf, fontSize: 12, fontFamily: mono, padding: 0, marginBottom: 10, display: "block", cursor: "pointer" }}>
                        View medical certificate ↗
                      </button>
                    )}
                    <div style={{ display: "flex", gap: 8 }}>
                      <button onClick={() => setLeaveStatus(l.id, "approved")} style={{ ...btnGhost, color: C.leafDark, borderColor: "#CFE0CF", display: "flex", alignItems: "center", gap: 5 }}><Check size={12} /> Approve</button>
                      <button onClick={() => setLeaveStatus(l.id, "rejected")} style={{ ...btnGhost, color: C.red, borderColor: "#E6C8C4", display: "flex", alignItems: "center", gap: 5 }}><X size={12} /> Reject</button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <div style={{ fontSize: 15, fontWeight: 600 }}>Warnings <span className="mono" style={{ fontFamily: mono, fontWeight: 400, fontSize: 11.5, color: C.inkSoft }}>— written record, per Article 37</span></div>
            <button onClick={() => setShowWarnForm((s) => !s)} style={btnGhost}>{showWarnForm ? "Cancel" : "+ Add"}</button>
          </div>
          {showWarnForm && (
            <div style={{ background: C.paper, border: `1px solid ${C.line}`, borderRadius: 10, padding: 14, marginBottom: 10 }}>
              <select value={warnDraft.employeeId} onChange={(e) => setWarnDraft({ ...warnDraft, employeeId: e.target.value })} style={{ ...inputStyle, fontFamily: mono, marginBottom: 10 }}>
                <option value="">Select employee…</option>
                {employees.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
              </select>
              <textarea value={warnDraft.note} onChange={(e) => setWarnDraft({ ...warnDraft, note: e.target.value })} placeholder="Reason for the warning…" style={{ ...inputStyle, minHeight: 60, marginBottom: 10 }} />
              <button onClick={addManualWarning} style={btnPrimary}>Add warning</button>
            </div>
          )}
          {recentWarnings.length === 0 ? <div style={{ fontSize: 13, color: C.inkSoft, marginBottom: 18 }}>No warnings on record.</div> : (
            <div style={{ background: C.paper, border: `1px solid ${C.line}`, borderRadius: 12, marginBottom: 18, overflow: "hidden" }}>
              {recentWarnings.map((w) => {
                const emp = employees.find((e) => e.id === w.employee_id);
                return (
                  <div key={w.id} style={{ padding: "12px 16px", borderBottom: `1px solid ${C.line}`, display: "flex", gap: 10, alignItems: "flex-start" }}>
                    <AlertTriangle size={14} color={C.amber} style={{ marginTop: 2, flexShrink: 0 }} />
                    <div>
                      <div style={{ fontSize: 13.5, fontWeight: 600 }}>{emp?.name} <span className="mono" style={{ fontFamily: mono, fontWeight: 400, color: C.inkSoft, fontSize: 11.5 }}>· {w.date}</span></div>
                      <div style={{ fontSize: 12.5, color: C.inkSoft }}>{w.note}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>This month's payroll</div>
          <div style={{ fontSize: 11.5, color: C.inkSoft, fontFamily: mono, marginBottom: 10, lineHeight: 1.6 }}>
            Lateness fines are capped at {MAX_DEDUCTION_DAYS} days' wage/month (Article 38). Absence is unpaid
            time, not a fine, so it's deducted directly with no cap. Sick leave follows the Article 69 pay
            scale. Tap a row to add a bonus or manual adjustment.
          </div>
          <div style={{ background: C.paper, border: `1px solid ${C.line}`, borderRadius: 12, overflow: "hidden" }}>
            {salarySummary.map(({ emp, absentCount, lateCount, lateDeduction, lateCapped, absentDeduction, highAbsenceRisk, sickDaysThisMonth, sickUnpaidDeduction, adjustment, note, netPay, annualBalance, sickUsedThisYear }) => (
              <div key={emp.id} style={{ padding: "13px 16px", borderBottom: `1px solid ${C.line}` }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer" }}
                  onClick={() => { setOpenPayrollId(openPayrollId === emp.id ? null : emp.id); setAdjustDraft({ amount: String(adjustment || ""), note: note || "" }); }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>{emp.name}</div>
                    <div className="mono" style={{ fontFamily: mono, fontSize: 12, color: C.leaf, marginTop: 2, fontWeight: 600 }}>
                      {annualBalance.toFixed(1)} annual leave days left
                    </div>
                    <div className="mono" style={{ fontFamily: mono, fontSize: 11.5, color: C.inkSoft, marginTop: 3 }}>
                      base {emp.salary} · {absentCount} absent (−{absentDeduction.toFixed(2)}) · {lateCount} late (−{lateDeduction.toFixed(2)}{lateCapped ? ", capped" : ""})
                      {sickDaysThisMonth > 0 && ` · ${sickDaysThisMonth} sick (−${sickUnpaidDeduction.toFixed(2)})`}
                      {adjustment !== 0 && (adjustment > 0 ? ` · +${adjustment.toFixed(2)} adj` : ` · ${adjustment.toFixed(2)} adj`)}
                    </div>
                    {highAbsenceRisk && (
                      <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 4, color: C.red, fontSize: 11 }}>
                        <AlertTriangle size={11} /> {absentCount} unexcused absences this month — review under Article 41
                      </div>
                    )}
                  </div>
                  <div className="mono" style={{ fontFamily: mono, fontSize: 14, fontWeight: 600 }}>KD {netPay.toFixed(2)}</div>
                </div>
                {openPayrollId === emp.id && (
                  <div style={{ background: C.bg, borderRadius: 8, padding: 12, marginTop: 10 }}>
                    <div style={label}>Adjustment (KD, use − for a deduction)</div>
                    <input type="number" step="0.1" value={adjustDraft.amount} onChange={(e) => setAdjustDraft({ ...adjustDraft, amount: e.target.value })} style={{ ...inputStyle, marginBottom: 8 }} />
                    <div style={label}>Note</div>
                    <input value={adjustDraft.note} onChange={(e) => setAdjustDraft({ ...adjustDraft, note: e.target.value })} placeholder="e.g. Eid bonus, uniform deduction…" style={{ ...inputStyle, marginBottom: 10 }} />
                    <button onClick={() => saveAdjustment(emp.id)} style={btnGhost}>Save adjustment</button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

