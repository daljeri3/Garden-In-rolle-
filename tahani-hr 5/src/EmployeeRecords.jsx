import React, { useState, useEffect, useMemo } from "react";
import { Search, Plus, X, User, Phone, Calendar, FileText, AlertTriangle, ChevronRight } from "lucide-react";
import { supabase } from "./supabaseClient";
import { C, mono, serif, pill, btnPrimary, inputStyle, selectStyle, label, daysUntil } from "./tokens";

const ROLES = ["Florist", "Sales Associate", "Delivery", "Manager", "Admin"];

function ExpiryBadge({ lbl, date }) {
  if (!date) return null;
  const d = daysUntil(date);
  let tone = { bg: C.green, fg: C.leafDark, text: date };
  if (d < 0) tone = { bg: C.redSoft, fg: C.red, text: "Expired" };
  else if (d <= 30) tone = { bg: C.amberSoft, fg: "#8C5B1E", text: `${d}d left` };
  return (
    <span style={pill(tone.bg, tone.fg)}>
      {d !== null && d <= 30 && <AlertTriangle size={11} strokeWidth={2.5} />}
      {lbl}: {tone.text}
    </span>
  );
}

function Field({ lbl, children }) {
  return <div style={{ marginBottom: 16 }}><div style={label}>{lbl}</div>{children}</div>;
}

export default function EmployeeRecords() {
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState(null);
  const [editing, setEditing] = useState(null);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    const { data, error } = await supabase.from("employees").select("*").order("name");
    if (error) setError(error.message);
    else setEmployees(data.map(rowToEmp));
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  function rowToEmp(r) {
    return {
      id: r.id, name: r.name, role: r.role, phone: r.phone || "",
      email: r.email || "", isManager: !!r.is_manager,
      civilId: r.civil_id || "", civilIdExpiry: r.civil_id_expiry || "",
      visaExpiry: r.visa_expiry || "", contractStart: r.contract_start || "",
      contractType: r.contract_type || "Full-time", salary: r.salary ?? "", notes: r.notes || "",
    };
  }
  function empToRow(e) {
    return {
      name: e.name, role: e.role, phone: e.phone || null, email: e.email || null,
      is_manager: !!e.isManager, civil_id: e.civilId || null,
      civil_id_expiry: e.civilIdExpiry || null, visa_expiry: e.visaExpiry || null,
      contract_start: e.contractStart || null, contract_type: e.contractType,
      salary: e.salary === "" ? 0 : Number(e.salary), notes: e.notes || null,
    };
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return employees;
    return employees.filter((e) => e.name.toLowerCase().includes(q) || e.role.toLowerCase().includes(q));
  }, [employees, query]);

  const selected = employees.find((e) => e.id === selectedId);

  function startNew() {
    setEditing({
      id: null, name: "", role: ROLES[0], phone: "", email: "", isManager: false,
      civilId: "", civilIdExpiry: "", visaExpiry: "", contractStart: new Date().toISOString().slice(0, 10),
      contractType: "Full-time", salary: "", notes: "",
    });
  }

  async function saveEdit() {
    if (!editing.name.trim()) return;
    setError("");
    if (editing.id) {
      const { error } = await supabase.from("employees").update(empToRow(editing)).eq("id", editing.id);
      if (error) { setError(error.message); return; }
    } else {
      const { data, error } = await supabase.from("employees").insert(empToRow(editing)).select().single();
      if (error) { setError(error.message); return; }
      setSelectedId(data.id);
    }
    setEditing(null);
    load();
  }

  async function removeEmployee(id) {
    await supabase.from("employees").delete().eq("id", id);
    setSelectedId(null);
    load();
  }

  return (
    <div style={{ display: "flex", flex: 1, minHeight: 0 }}>
      <div style={{ width: 320, borderRight: `1px solid ${C.line}`, background: C.paper, display: "flex", flexDirection: "column" }}>
        <div style={{ padding: 16, borderBottom: `1px solid ${C.line}` }}>
          <div style={{ position: "relative", marginBottom: 10 }}>
            <Search size={15} color={C.inkSoft} style={{ position: "absolute", left: 10, top: 11 }} />
            <input placeholder="Search staff…" value={query} onChange={(e) => setQuery(e.target.value)} style={{ ...inputStyle, paddingLeft: 32, fontSize: 13.5 }} />
          </div>
          <button onClick={startNew} style={{ ...btnPrimary, padding: "9px 0" }}><Plus size={14} /> Add employee</button>
        </div>
        <div style={{ overflowY: "auto", flex: 1 }}>
          {loading && <div style={{ padding: 20, color: C.inkSoft, fontSize: 13 }}>Loading…</div>}
          {error && <div style={{ padding: 16, color: C.red, fontSize: 12.5 }}>{error}</div>}
          {filtered.map((e) => {
            const flagged = [e.civilIdExpiry, e.visaExpiry].some((d) => { const dd = daysUntil(d); return dd !== null && dd <= 30; });
            return (
              <div key={e.id} onClick={() => { setSelectedId(e.id); setEditing(null); }}
                style={{ padding: "13px 16px", borderBottom: `1px solid ${C.line}`, cursor: "pointer", background: selectedId === e.id ? C.roseSoft : "transparent", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div>
                  <div style={{ fontSize: 14.5, fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}>
                    {e.name}{flagged && <AlertTriangle size={12} color="#B98A3E" />}
                  </div>
                  <div style={{ fontFamily: mono, fontSize: 11, color: C.inkSoft, marginTop: 2 }}>{e.role}</div>
                </div>
                <ChevronRight size={15} color={C.inkSoft} />
              </div>
            );
          })}
        </div>
        <div style={{ padding: "10px 16px", borderTop: `1px solid ${C.line}`, fontFamily: mono, fontSize: 10.5, color: C.inkSoft }}>
          {employees.length} total staff
        </div>
      </div>

      <div style={{ flex: 1, padding: 32, overflowY: "auto" }}>
        {editing ? (
          <EditForm editing={editing} setEditing={setEditing} onSave={saveEdit} onCancel={() => setEditing(null)} />
        ) : selected ? (
          <DetailView e={selected} onEdit={() => setEditing(selected)} onDelete={() => removeEmployee(selected.id)} />
        ) : (
          <div style={{ height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", color: C.inkSoft, gap: 8 }}>
            <User size={32} strokeWidth={1.3} />
            <div style={{ fontSize: 14.5 }}>Select a staff member to view their record</div>
          </div>
        )}
      </div>
    </div>
  );
}

function DetailView({ e, onEdit, onDelete }) {
  return (
    <div style={{ maxWidth: 560 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
        <div>
          <div style={{ fontSize: 24, fontWeight: 600 }}>{e.name}</div>
          <div style={{ fontFamily: mono, fontSize: 12, color: C.rose, letterSpacing: 0.5, marginTop: 2 }}>{e.role.toUpperCase()}</div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={onEdit} style={{ border: `1px solid ${C.line}`, background: C.paper, borderRadius: 6, padding: "7px 14px", fontSize: 12.5, fontFamily: mono }}>Edit</button>
          <button onClick={onDelete} style={{ border: `1px solid #E6C8C4`, background: "#FBF1EF", borderRadius: 6, padding: "7px 14px", fontSize: 12.5, fontFamily: mono, color: C.red }}>Remove</button>
        </div>
      </div>
      <div style={{ display: "flex", gap: 8, margin: "18px 0", flexWrap: "wrap" }}>
        <ExpiryBadge lbl="Civil ID" date={e.civilIdExpiry} />
        {e.visaExpiry && <ExpiryBadge lbl="Visa" date={e.visaExpiry} />}
      </div>
      <div style={{ background: C.paper, border: `1px solid ${C.line}`, borderRadius: 10, padding: 24 }}>
        <Row icon={<Phone size={14} />} lbl="Login email" value={e.email || "Not set — can't sign in yet"} />
        <Row icon={<Phone size={14} />} lbl="Access level" value={e.isManager ? "Manager" : "Staff"} />
        <Row icon={<Phone size={14} />} lbl="Phone" value={e.phone || "—"} />
        <Row icon={<FileText size={14} />} lbl="Civil ID number" value={e.civilId || "—"} />
        <Row icon={<Calendar size={14} />} lbl="Contract start" value={e.contractStart || "—"} />
        <Row icon={<FileText size={14} />} lbl="Contract type" value={e.contractType || "—"} />
        <Row icon={<FileText size={14} />} lbl="Monthly salary" value={e.salary !== "" ? `KD ${e.salary}` : "—"} />
      </div>
      {e.notes && (
        <div style={{ marginTop: 20 }}>
          <div style={label}>Notes</div>
          <div style={{ fontSize: 14.5, lineHeight: 1.6, fontStyle: "italic", color: C.inkSoft }}>{e.notes}</div>
        </div>
      )}
    </div>
  );
}

function Row({ icon, lbl, value }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 0", borderBottom: `1px solid ${C.line}` }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, color: C.inkSoft, fontSize: 12.5 }}>{icon}{lbl}</div>
      <div style={{ fontSize: 14.5 }}>{value}</div>
    </div>
  );
}

function EditForm({ editing, setEditing, onSave, onCancel }) {
  const set = (k) => (v) => setEditing({ ...editing, [k]: v });
  return (
    <div style={{ maxWidth: 480 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <div style={{ fontSize: 20, fontWeight: 600 }}>{editing.id ? "Edit staff record" : "New staff record"}</div>
        <button onClick={onCancel} style={{ background: "none", border: "none", color: C.inkSoft }}><X size={18} /></button>
      </div>
      <Field lbl="Full name"><input style={inputStyle} value={editing.name} onChange={(e) => set("name")(e.target.value)} placeholder="e.g. Sara Al-Fahad" /></Field>
      <div style={{ display: "flex", gap: 12 }}>
        <div style={{ flex: 1 }}><Field lbl="Role"><select style={selectStyle} value={editing.role} onChange={(e) => set("role")(e.target.value)}>{ROLES.map((r) => <option key={r}>{r}</option>)}</select></Field></div>
        <div style={{ flex: 1 }}><Field lbl="Contract type"><select style={selectStyle} value={editing.contractType} onChange={(e) => set("contractType")(e.target.value)}>{["Full-time", "Part-time", "Temporary"].map((r) => <option key={r}>{r}</option>)}</select></Field></div>
      </div>
      <Field lbl="Login email">
        <input style={inputStyle} value={editing.email} onChange={(e) => set("email")(e.target.value)} placeholder="must match their Supabase login exactly" />
      </Field>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
        <input type="checkbox" id="isManager" checked={editing.isManager} onChange={(e) => set("isManager")(e.target.checked)} />
        <label htmlFor="isManager" style={{ fontSize: 13.5 }}>Give this person manager access (can see everyone, approve leave, edit records)</label>
      </div>
      <Field lbl="Phone"><input style={inputStyle} value={editing.phone} onChange={(e) => set("phone")(e.target.value)} placeholder="+965 ..." /></Field>
      <div style={{ display: "flex", gap: 12 }}>
        <div style={{ flex: 1 }}><Field lbl="Civil ID number"><input style={inputStyle} value={editing.civilId} onChange={(e) => set("civilId")(e.target.value)} /></Field></div>
        <div style={{ flex: 1 }}><Field lbl="Civil ID expiry"><input type="date" style={inputStyle} value={editing.civilIdExpiry} onChange={(e) => set("civilIdExpiry")(e.target.value)} /></Field></div>
      </div>
      <Field lbl="Visa / residency expiry (if applicable)"><input type="date" style={inputStyle} value={editing.visaExpiry} onChange={(e) => set("visaExpiry")(e.target.value)} /></Field>
      <div style={{ display: "flex", gap: 12 }}>
        <div style={{ flex: 1 }}><Field lbl="Contract start date"><input type="date" style={inputStyle} value={editing.contractStart} onChange={(e) => set("contractStart")(e.target.value)} /></Field></div>
        <div style={{ flex: 1 }}><Field lbl="Monthly salary (KD)"><input style={inputStyle} value={editing.salary} onChange={(e) => set("salary")(e.target.value)} placeholder="e.g. 250" /></Field></div>
      </div>
      <Field lbl="Notes"><textarea style={{ ...inputStyle, minHeight: 70, resize: "vertical" }} value={editing.notes} onChange={(e) => set("notes")(e.target.value)} placeholder="Anything worth remembering…" /></Field>
      <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
        <button onClick={onSave} style={{ background: C.leaf, color: "#fff", border: "none", borderRadius: 6, padding: "10px 20px", fontSize: 13.5, fontWeight: 600, fontFamily: mono }}>Save record</button>
        <button onClick={onCancel} style={{ background: "none", border: `1px solid ${C.line}`, borderRadius: 6, padding: "10px 20px", fontSize: 13.5, fontFamily: mono, color: C.inkSoft }}>Cancel</button>
      </div>
    </div>
  );
}
