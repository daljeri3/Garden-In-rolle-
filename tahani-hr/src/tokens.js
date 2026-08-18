export const C = {
  bg: "#F6F3EC", paper: "#FFFFFF", ink: "#2B2A24", inkSoft: "#6B6A5E",
  leaf: "#3F5B44", leafDark: "#2C4030", rose: "#C97D74", roseSoft: "#F1DDD8",
  line: "#E4DFD1", amber: "#B98A3E", amberSoft: "#F6E7D4",
  red: "#8C3A30", redSoft: "#F6DEDB", green: "#EAF0EA",
};
export const mono = "'IBM Plex Mono', monospace";
export const serif = "'Newsreader', Georgia, serif";

export function pill(bg, fg) {
  return {
    display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11.5,
    fontFamily: mono, padding: "3px 9px", borderRadius: 20, background: bg,
    color: fg, fontWeight: 600, letterSpacing: 0.2,
  };
}

export const btnPrimary = {
  background: C.leaf, color: "#fff", border: "none", borderRadius: 8,
  padding: "13px 0", fontSize: 14, fontWeight: 600, fontFamily: mono,
  display: "flex", alignItems: "center", justifyContent: "center", gap: 8, width: "100%",
};
export const btnGhost = {
  background: "none", border: `1px solid ${C.line}`, borderRadius: 8,
  padding: "10px 16px", fontSize: 12.5, fontFamily: mono, color: C.inkSoft,
};
export const inputStyle = {
  width: "100%", boxSizing: "border-box", border: `1px solid ${C.line}`, borderRadius: 6,
  padding: "9px 11px", fontSize: 14, fontFamily: serif, color: C.ink, background: C.paper, outline: "none",
};
export const selectStyle = { ...inputStyle, fontFamily: mono, fontSize: 13 };
export const label = {
  fontFamily: mono, fontSize: 10.5, letterSpacing: 0.8, textTransform: "uppercase",
  color: C.inkSoft, marginBottom: 6,
};

export function daysUntil(dateStr) {
  if (!dateStr) return null;
  return Math.ceil((new Date(dateStr) - new Date()) / (1000 * 60 * 60 * 24));
}
export function todayStr(d = new Date()) { return d.toISOString().slice(0, 10); }
export function timeStr(d = new Date()) { return d.toTimeString().slice(0, 5); }

export function haversine(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function getLocation() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) { reject(new Error("Geolocation not supported on this device")); return; }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      (err) => reject(err),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  });
}
