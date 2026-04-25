/** Mask a phone number for display: "917028588899" → "917•••••99" */
export function maskPhone(wa_id: string): string {
  if (!wa_id) return "";
  if (wa_id.length <= 6) return wa_id.replace(/./g, "•");
  return wa_id.slice(0, 3) + "•••••" + wa_id.slice(-2);
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
  return `+${displayPhone(c.wa_id, user)}`;
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
