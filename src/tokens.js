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

export function mapsLink(lat, lng) {
  return `https://www.google.com/maps?q=${lat},${lng}`;
}

export function currentMonthStr(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export const WEEKDAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

// Kuwait Labor Law Article 70: 30 days paid annual leave per year, accrued
// at 2.5 days per month of service (the standard prorated reading of "leave
// for the fraction of the year in proportion with actual service").
export function annualLeaveAccrued(contractStart, asOf = new Date()) {
  if (!contractStart) return 0;
  const start = new Date(contractStart);
  if (start > asOf) return 0;
  const months = (asOf.getFullYear() - start.getFullYear()) * 12 + (asOf.getMonth() - start.getMonth()) + (asOf.getDate() >= start.getDate() ? 1 : 0);
  return Math.max(0, Math.round(Math.min(months, 12) * 2.5 * 10) / 10);
}

// Kuwait Labor Law Article 69: sick leave pay tiers per calendar year,
// requires a medical report. daysUsedBeforeThis = sick days already
// approved this year before the days being evaluated now.
export function sickPayTier(daysUsedBeforeThis, daysInThisRequest) {
  const tiers = [
    { limit: 15, rate: 1 },
    { limit: 10, rate: 0.75 },
    { limit: 10, rate: 0.5 },
    { limit: 10, rate: 0.25 },
    { limit: 30, rate: 0 },
  ];
  let remaining = daysInThisRequest;
  let used = daysUsedBeforeThis;
  let payableDayEquivalent = 0; // in units of full-pay days
  for (const tier of tiers) {
    if (remaining <= 0) break;
    const tierRemaining = Math.max(0, tier.limit - Math.max(0, used - (tier.limit - tier.limit)));
    // how much of `used` falls before this tier ends
    const tierFloor = tiers.slice(0, tiers.indexOf(tier)).reduce((s, t) => s + t.limit, 0);
    const tierCeil = tierFloor + tier.limit;
    const daysLeftInTier = Math.max(0, tierCeil - Math.max(used, tierFloor));
    const take = Math.min(remaining, daysLeftInTier);
    payableDayEquivalent += take * tier.rate;
    remaining -= take;
    used += take;
  }
  return payableDayEquivalent; // e.g. 3 days at 75% = 2.25
}

// Kuwait Labor Law Article 51: end-of-service indemnity ("gratuity").
// 15 days' basic wage per year for the first 5 years, then a full month's
// wage per year after that, capped at 1.5 years' total wage.
// Article 53: on resignation (not termination), the amount is scaled down
// by years of service — nothing under 3 years, up to full at 10+.
export function endOfServiceCalc(salary, contractStart, asOf = new Date()) {
  if (!contractStart || !salary) return null;
  const start = new Date(contractStart);
  const msPerYear = 365.25 * 24 * 60 * 60 * 1000;
  const yearsOfService = Math.max(0, (asOf - start) / msPerYear);
  const dailyWage = salary / 26;

  const first5 = Math.min(yearsOfService, 5);
  const beyond5 = Math.max(0, yearsOfService - 5);
  const fullIndemnityRaw = first5 * 15 * dailyWage + beyond5 * 30 * dailyWage;
  const cap = salary * 18; // 1.5 years' wage
  const capped = fullIndemnityRaw > cap;
  const fullIndemnity = Math.min(fullIndemnityRaw, cap);

  let resignationRate = 0, resignationTierLabel = "Under 3 years — no gratuity on resignation";
  if (yearsOfService >= 10) { resignationRate = 1; resignationTierLabel = "10+ years — full amount, same as termination"; }
  else if (yearsOfService >= 5) { resignationRate = 2 / 3; resignationTierLabel = "5–10 years — two-thirds"; }
  else if (yearsOfService >= 3) { resignationRate = 0.5; resignationTierLabel = "3–5 years — half"; }

  return {
    yearsOfService, dailyWage, fullIndemnity, capped,
    terminationPayout: fullIndemnity, // termination without cause = full amount
    resignationPayout: fullIndemnity * resignationRate,
    resignationRate, resignationTierLabel,
  };
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
