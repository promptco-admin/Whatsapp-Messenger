/** Mask a phone number for display: "917028588899" → "917•••••99" */
export function maskPhone(wa_id: string): string {
  if (!wa_id) return "";
  if (wa_id.length <= 6) return wa_id.replace(/./g, "•");
  return wa_id.slice(0, 3) + "•••••" + wa_id.slice(-2);
}

/**
 * Format a raw wa_id into a more scannable string with spaces.
 * Indian numbers (10 digits + 91 prefix) get the standard "+91 XXXXX XXXXX"
 * grouping. Other formats fall back to a generic "+CC XXX XXX XXXX" split.
 * Used as a fallback display when the contact has no name at all — much
 * easier to recognise at a glance than a wall of digits.
 */
export function formatPhonePretty(wa_id: string): string {
  if (!wa_id) return "";
  const digits = wa_id.replace(/[^0-9]/g, "");
  // Indian (most common in this app): +91 + 10 digits
  if (digits.length === 12 && digits.startsWith("91")) {
    return `+91 ${digits.slice(2, 7)} ${digits.slice(7)}`;
  }
  // Generic international fallback: country code (1-3 digits) + 7-12 subscriber digits.
  // Split subscriber half-way for readability.
  if (digits.length >= 8) {
    const cc = digits.length > 11 ? digits.slice(0, 3) : digits.length > 10 ? digits.slice(0, 2) : digits.slice(0, 1);
    const rest = digits.slice(cc.length);
    const half = Math.ceil(rest.length / 2);
    return `+${cc} ${rest.slice(0, half)} ${rest.slice(half)}`;
  }
  return `+${digits}`;
}

export type DisplayUser = {
  id: number;
  role: "admin" | "agent";
  phone_masking: number | boolean;
} | null;

/**
 * Display a phone number, applying the current user's masking preference.
 * Admins can still see raw numbers even if masking is on — they just toggle.
 */
export function displayPhone(wa_id: string, user: DisplayUser): string {
  if (!wa_id) return "";
  if (!user) return wa_id;
  if (user.phone_masking) return maskPhone(wa_id);
  return wa_id;
}

/**
 * Resolve a contact's display name using the agent's edited name if present,
 * else the WhatsApp profile name Meta delivered, else the masked/raw phone.
 *
 *   manual ("Ramesh — Solar customer")
 *     → wa profile ("Ramesh K.")
 *       → +<phone>
 */
export function displayContactName(
  c: { name?: string | null; wa_profile_name?: string | null; wa_id: string },
  user: DisplayUser,
): string {
  if (c.name && c.name.trim()) return c.name.trim();
  if (c.wa_profile_name && c.wa_profile_name.trim()) return c.wa_profile_name.trim();
  // Last-resort: format the raw phone with spaces so the chat list isn't a
  // wall of digits when 80% of contacts haven't replied yet (and therefore
  // have no profile name from Meta).
  if (user?.phone_masking) return `+${maskPhone(c.wa_id)}`;
  return formatPhonePretty(c.wa_id);
}

/** Click-to-WhatsApp ad referral, stored as JSON on contact.source_json. */
export type ContactSource = {
  source_type?: string | null;
  source_id?: string | null;
  source_url?: string | null;
  headline?: string | null;
  body?: string | null;
  media_type?: string | null;
  image_url?: string | null;
  video_url?: string | null;
  thumbnail_url?: string | null;
  ctwa_clid?: string | null;
  first_seen_at?: string | null;
};

/** Safely parse a contact.source_json value. Returns null if unset / invalid. */
export function parseContactSource(raw: string | null | undefined): ContactSource | null {
  if (!raw) return null;
  try {
    const j = JSON.parse(raw);
    if (j && typeof j === "object") return j as ContactSource;
  } catch {
    // fall through
  }
  return null;
}
