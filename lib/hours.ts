/**
 * Phase 8: shared working-hours helper.
 *
 * A HoursConfig describes a weekly business-hours window in a specific
 * timezone. Used by:
 *   - auto-reply rules (auto_replies.hours_json)
 *   - away message (settings_kv 'away_message' -> hours_json)
 */
export type HoursConfig = {
  tz?: string;
  days?: number[]; // 0=Sun..6=Sat, matching JS Date.getDay()
  start?: string; // "HH:MM" 24h
  end?: string; // "HH:MM" 24h
};

/**
 * Is "now" inside the configured window?  Returns true if no config is set.
 * Inclusive start, exclusive end. Supports overnight windows (end < start).
 */
export function withinHoursConfig(raw: string | HoursConfig | null | undefined): boolean {
  if (!raw) return true;
  let cfg: HoursConfig;
  if (typeof raw === "string") {
    try {
      cfg = JSON.parse(raw);
    } catch {
      return true;
    }
  } else {
    cfg = raw;
  }
  if (!cfg || typeof cfg !== "object") return true;

  const tz = cfg.tz || "Asia/Kolkata";
  const now = new Date();
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = fmt.formatToParts(now);
  const weekdayStr = parts.find((p) => p.type === "weekday")?.value || "Mon";
  const hourStr = parts.find((p) => p.type === "hour")?.value || "00";
  const minStr = parts.find((p) => p.type === "minute")?.value || "00";
  const dayMap: Record<string, number> = {
    Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
  };
  const day = dayMap[weekdayStr] ?? now.getDay();
  const mins = Number(hourStr) * 60 + Number(minStr);

  if (Array.isArray(cfg.days) && cfg.days.length > 0 && !cfg.days.includes(day)) {
    return false;
  }

  const toMins = (s: string | undefined) => {
    if (!s) return null;
    const [h, m] = s.split(":").map(Number);
    if (isNaN(h) || isNaN(m)) return null;
    return h * 60 + m;
  };
  const start = toMins(cfg.start);
  const end = toMins(cfg.end);
  if (start == null || end == null) return true;
  if (end === start) return true;
  if (end > start) return mins >= start && mins < end;
  return mins >= start || mins < end; // overnight
}
