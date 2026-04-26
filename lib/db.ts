import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

let _db: Database.Database | null = null;

export function db(): Database.Database {
  if (_db) return _db;
  const dbPath = process.env.DATABASE_PATH || "./data/messenger.db";
  const absPath = path.isAbsolute(dbPath) ? dbPath : path.join(process.cwd(), dbPath);
  fs.mkdirSync(path.dirname(absPath), { recursive: true });
  const database = new Database(absPath);
  database.pragma("journal_mode = WAL");
  database.pragma("foreign_keys = ON");
  migrate(database);
  _db = database;
  return database;
}

function migrate(d: Database.Database) {
  d.exec(`
    CREATE TABLE IF NOT EXISTS contacts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      wa_id TEXT NOT NULL UNIQUE,
      name TEXT,
      tags TEXT DEFAULT '[]',
      custom_fields TEXT DEFAULT '{}',
      last_message_at TEXT,
      last_inbound_at TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      wa_message_id TEXT UNIQUE,
      contact_id INTEGER NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
      direction TEXT NOT NULL CHECK(direction IN ('inbound','outbound')),
      type TEXT NOT NULL,
      body TEXT,
      template_name TEXT,
      template_variables TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      error TEXT,
      read_at TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_messages_contact_created ON messages(contact_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_messages_wa_id ON messages(wa_message_id);

    CREATE TABLE IF NOT EXISTS broadcasts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      template_name TEXT NOT NULL,
      language TEXT NOT NULL,
      template_body TEXT,
      variable_mapping TEXT,
      header_json TEXT,
      segment_tag TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      total INTEGER NOT NULL DEFAULT 0,
      sent INTEGER NOT NULL DEFAULT 0,
      delivered INTEGER NOT NULL DEFAULT 0,
      read INTEGER NOT NULL DEFAULT 0,
      failed INTEGER NOT NULL DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      started_at TEXT,
      completed_at TEXT
    );

    CREATE TABLE IF NOT EXISTS broadcast_recipients (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      broadcast_id INTEGER NOT NULL REFERENCES broadcasts(id) ON DELETE CASCADE,
      contact_id INTEGER NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
      wa_message_id TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      error TEXT,
      sent_at TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_broadcast_recipients_broadcast ON broadcast_recipients(broadcast_id);
    CREATE INDEX IF NOT EXISTS idx_broadcast_recipients_wa_msg ON broadcast_recipients(wa_message_id);

    CREATE TABLE IF NOT EXISTS quick_replies (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      shortcut TEXT,
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_quick_replies_shortcut ON quick_replies(shortcut);

    CREATE TABLE IF NOT EXISTS sequences (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS sequence_steps (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sequence_id INTEGER NOT NULL REFERENCES sequences(id) ON DELETE CASCADE,
      order_index INTEGER NOT NULL,
      template_name TEXT NOT NULL,
      language TEXT NOT NULL,
      variable_mapping TEXT,
      header_json TEXT,
      delay_days INTEGER NOT NULL DEFAULT 0,
      delay_hours INTEGER NOT NULL DEFAULT 0,
      delay_minutes INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_sequence_steps_seq ON sequence_steps(sequence_id, order_index);

    CREATE TABLE IF NOT EXISTS sequence_enrollments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sequence_id INTEGER NOT NULL REFERENCES sequences(id) ON DELETE CASCADE,
      contact_id INTEGER NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
      current_step INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'active',
      next_run_at TEXT,
      enrolled_at TEXT DEFAULT CURRENT_TIMESTAMP,
      completed_at TEXT,
      last_error TEXT,
      UNIQUE(sequence_id, contact_id)
    );
    CREATE INDEX IF NOT EXISTS idx_seq_enroll_run ON sequence_enrollments(status, next_run_at);

    CREATE TABLE IF NOT EXISTS auto_replies (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      trigger_keyword TEXT NOT NULL,
      match_type TEXT NOT NULL DEFAULT 'contains',
      response_kind TEXT NOT NULL DEFAULT 'text',
      response_text TEXT,
      template_name TEXT,
      template_language TEXT,
      variable_mapping TEXT,
      cooldown_minutes INTEGER NOT NULL DEFAULT 60,
      active INTEGER NOT NULL DEFAULT 1,
      priority INTEGER NOT NULL DEFAULT 0,
      fire_count INTEGER NOT NULL DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_auto_replies_active ON auto_replies(active, priority);

    CREATE TABLE IF NOT EXISTS auto_reply_fires (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      rule_id INTEGER NOT NULL REFERENCES auto_replies(id) ON DELETE CASCADE,
      contact_id INTEGER NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
      fired_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_auto_reply_fires_lookup
      ON auto_reply_fires(rule_id, contact_id, fired_at);

    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      name TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'agent',
      active INTEGER NOT NULL DEFAULT 1,
      phone_masking INTEGER NOT NULL DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      expires_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

    CREATE TABLE IF NOT EXISTS contact_notes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      contact_id INTEGER NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      body TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_contact_notes_contact ON contact_notes(contact_id, created_at);
  `);

  const broadcastCols = d.prepare("PRAGMA table_info(broadcasts)").all() as Array<{ name: string }>;
  const bcCols = new Set(broadcastCols.map((c) => c.name));
  if (!bcCols.has("scheduled_for")) d.exec("ALTER TABLE broadcasts ADD COLUMN scheduled_for TEXT");

  const contactCols = d.prepare("PRAGMA table_info(contacts)").all() as Array<{ name: string }>;
  const colNames = new Set(contactCols.map((c) => c.name));
  if (!colNames.has("tags")) d.exec("ALTER TABLE contacts ADD COLUMN tags TEXT DEFAULT '[]'");
  if (!colNames.has("custom_fields"))
    d.exec("ALTER TABLE contacts ADD COLUMN custom_fields TEXT DEFAULT '{}'");
  if (!colNames.has("assigned_user_id"))
    d.exec("ALTER TABLE contacts ADD COLUMN assigned_user_id INTEGER");

  const msgCols = d.prepare("PRAGMA table_info(messages)").all() as Array<{ name: string }>;
  const msgColNames = new Set(msgCols.map((c) => c.name));
  if (!msgColNames.has("sent_by_user_id"))
    d.exec("ALTER TABLE messages ADD COLUMN sent_by_user_id INTEGER");
  // Phase 7a: media attachments. `media_id` is Meta's media id (for inbound +
  // outbound-by-id). `media_url` is a direct public https link (for outbound
  // template headers set with {link}). `media_mime` is e.g. 'image/jpeg'.
  if (!msgColNames.has("media_id"))
    d.exec("ALTER TABLE messages ADD COLUMN media_id TEXT");
  if (!msgColNames.has("media_mime"))
    d.exec("ALTER TABLE messages ADD COLUMN media_mime TEXT");
  if (!msgColNames.has("media_url"))
    d.exec("ALTER TABLE messages ADD COLUMN media_url TEXT");
  if (!msgColNames.has("media_filename"))
    d.exec("ALTER TABLE messages ADD COLUMN media_filename TEXT");

  // Phase 7a: opt-out / STOP compliance. Once a contact sends STOP (or any
  // configured opt-out keyword), `unsubscribed_at` is set and they are excluded
  // from broadcasts + sequences until manually cleared.
  if (!colNames.has("unsubscribed_at"))
    d.exec("ALTER TABLE contacts ADD COLUMN unsubscribed_at TEXT");

  // Phase 7a: working-hours filter on auto-replies. If `hours_json` is set, the
  // rule only fires within the given window. Shape:
  //   { tz: 'Asia/Kolkata', days: [1,2,3,4,5], start: '09:00', end: '18:00' }
  const arCols = d.prepare("PRAGMA table_info(auto_replies)").all() as Array<{ name: string }>;
  const arColNames = new Set(arCols.map((c) => c.name));
  if (!arColNames.has("hours_json"))
    d.exec("ALTER TABLE auto_replies ADD COLUMN hours_json TEXT");

  const bcCols2 = d.prepare("PRAGMA table_info(broadcasts)").all() as Array<{ name: string }>;
  const bcColNames2 = new Set(bcCols2.map((c) => c.name));
  if (!bcColNames2.has("created_by_user_id"))
    d.exec("ALTER TABLE broadcasts ADD COLUMN created_by_user_id INTEGER");

  // Phase 6a: click-to-WhatsApp ad attribution — first-touch source stored as JSON
  // on the contact. Shape: { source_type, source_id, source_url, headline, body,
  //   media_type, image_url, video_url, thumbnail_url, ctwa_clid, first_seen_at }
  const contactCols2 = d.prepare("PRAGMA table_info(contacts)").all() as Array<{ name: string }>;
  const contactColNames2 = new Set(contactCols2.map((c) => c.name));
  if (!contactColNames2.has("source_json"))
    d.exec("ALTER TABLE contacts ADD COLUMN source_json TEXT");

  // Phase 6c: drag-drop flow builder.
  // `flows.nodes_json` + `flows.edges_json` store the react-flow graph directly.
  // `trigger_type` is 'keyword' | 'new_contact' | 'from_ad' | 'manual'.
  // `trigger_config` is a JSON blob whose shape depends on trigger_type:
  //   keyword  → { match_type: 'contains'|'exact'|'starts_with', keyword: string }
  //   new_contact → {}
  //   from_ad  → { source_id?: string }     // optional: only trigger for a specific ad
  //   manual   → {}
  d.exec(`
    CREATE TABLE IF NOT EXISTS flows (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT,
      active INTEGER NOT NULL DEFAULT 0,
      trigger_type TEXT NOT NULL DEFAULT 'manual',
      trigger_config TEXT DEFAULT '{}',
      nodes_json TEXT DEFAULT '[]',
      edges_json TEXT DEFAULT '[]',
      created_by_user_id INTEGER,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_flows_active_trigger ON flows(active, trigger_type);

    CREATE TABLE IF NOT EXISTS flow_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      flow_id INTEGER NOT NULL REFERENCES flows(id) ON DELETE CASCADE,
      contact_id INTEGER NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
      current_node_id TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      variables TEXT DEFAULT '{}',
      waiting_for TEXT,
      next_run_at TEXT,
      last_error TEXT,
      started_at TEXT DEFAULT CURRENT_TIMESTAMP,
      completed_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_flow_runs_contact_status ON flow_runs(contact_id, status);
    CREATE INDEX IF NOT EXISTS idx_flow_runs_tick ON flow_runs(status, next_run_at);
    CREATE INDEX IF NOT EXISTS idx_flow_runs_waiting ON flow_runs(contact_id, waiting_for);
  `);

  // Phase 8: global key/value settings (away message, business-hours default, etc.)
  // Small, flat, rarely-written. Value is always a JSON string.
  d.exec(`
    CREATE TABLE IF NOT EXISTS settings_kv (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Phase 8: away-message fires log (so we only send the away reply once per
  // window per contact — same cooldown pattern as auto_reply_fires).
  d.exec(`
    CREATE TABLE IF NOT EXISTS away_message_fires (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      contact_id INTEGER NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
      fired_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_away_fires_contact ON away_message_fires(contact_id, fired_at);
  `);

  // Phase 8: click-tracking for template button URLs.
  //   short_links = one row per trackable destination (same URL can have many
  //     short_links if created in different broadcasts/templates).
  //   url_clicks  = one row per inbound hit on /r/<code>.
  d.exec(`
    CREATE TABLE IF NOT EXISTS short_links (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL UNIQUE,
      destination_url TEXT NOT NULL,
      label TEXT,
      broadcast_id INTEGER,
      template_name TEXT,
      created_by_user_id INTEGER,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_short_links_broadcast ON short_links(broadcast_id);

    CREATE TABLE IF NOT EXISTS url_clicks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      short_link_id INTEGER NOT NULL REFERENCES short_links(id) ON DELETE CASCADE,
      contact_id INTEGER,
      ip TEXT,
      user_agent TEXT,
      clicked_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_url_clicks_link ON url_clicks(short_link_id, clicked_at);
    CREATE INDEX IF NOT EXISTS idx_url_clicks_contact ON url_clicks(contact_id, clicked_at);
  `);

  // Phase 9: follow-up system.
  //
  // pipeline_stages = ordered list of lead-pipeline columns (New, Contacted,
  //   Quoted, Won, Lost, ...). order_index orders them; color is a hex for
  //   the kanban column. is_won/is_lost are terminal markers used for stats.
  //
  // followups = per-contact reminder. due_at is when to fire. If auto_send=1,
  //   the scheduler sends the configured message at due_at; otherwise it just
  //   surfaces in the dashboard as "due now". message_kind = 'text'|'template'.
  //   status = 'pending'|'done'|'snoozed'|'cancelled'|'failed'.
  //   completed_via = 'auto'|'manual' tracks who closed it.
  d.exec(`
    CREATE TABLE IF NOT EXISTS pipeline_stages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      order_index INTEGER NOT NULL DEFAULT 0,
      color TEXT DEFAULT '#94a3b8',
      is_won INTEGER NOT NULL DEFAULT 0,
      is_lost INTEGER NOT NULL DEFAULT 0,
      auto_followup_days INTEGER,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_pipeline_stages_order ON pipeline_stages(order_index);

    CREATE TABLE IF NOT EXISTS followups (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      contact_id INTEGER NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      note TEXT,
      due_at TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      auto_send INTEGER NOT NULL DEFAULT 0,
      message_kind TEXT,
      message_body TEXT,
      template_name TEXT,
      template_language TEXT,
      variable_mapping TEXT,
      assigned_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      completed_via TEXT,
      completed_at TEXT,
      last_error TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_followups_due ON followups(status, due_at);
    CREATE INDEX IF NOT EXISTS idx_followups_contact ON followups(contact_id, status);
    CREATE INDEX IF NOT EXISTS idx_followups_assignee ON followups(assigned_user_id, status, due_at);
  `);

  // Phase 9: pipeline_stage_id on contacts.
  const contactCols3 = d.prepare("PRAGMA table_info(contacts)").all() as Array<{ name: string }>;
  const contactColNames3 = new Set(contactCols3.map((c) => c.name));
  if (!contactColNames3.has("pipeline_stage_id"))
    d.exec("ALTER TABLE contacts ADD COLUMN pipeline_stage_id INTEGER");
  // Phase 10: WhatsApp profile name (separate from agent-edited `name`).
  // Captured from inbound webhook's `contacts[].profile.name`. Always refreshed
  // on every inbound — does NOT clobber the agent-editable `name` column.
  if (!contactColNames3.has("wa_profile_name"))
    d.exec("ALTER TABLE contacts ADD COLUMN wa_profile_name TEXT");
  if (!contactColNames3.has("wa_profile_updated_at"))
    d.exec("ALTER TABLE contacts ADD COLUMN wa_profile_updated_at TEXT");

  // Phase 10: media-header support on follow-ups. Templates whose HEADER is
  // IMAGE / VIDEO / DOCUMENT need an attached media id (or public URL) at send
  // time, otherwise Meta returns #132012 ("parameter format does not match").
  // We store the same shape broadcasts use: { type, media_id?, link?, filename? }.
  const followupCols = d.prepare("PRAGMA table_info(followups)").all() as Array<{ name: string }>;
  const followupColNames = new Set(followupCols.map((c) => c.name));
  if (!followupColNames.has("header_json"))
    d.exec("ALTER TABLE followups ADD COLUMN header_json TEXT");

  // Phase 11: webhook health log. One row per inbound webhook POST. Used by
  // Settings → Webhook status to surface "last received N minutes ago", event
  // counts, and signature-verification health. Auto-pruned to last 1000 rows
  // to keep the table small.
  d.exec(`
    CREATE TABLE IF NOT EXISTS webhook_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      received_at TEXT DEFAULT CURRENT_TIMESTAMP,
      kind TEXT NOT NULL,
      signature_ok INTEGER NOT NULL DEFAULT 1,
      message_count INTEGER NOT NULL DEFAULT 0,
      status_count INTEGER NOT NULL DEFAULT 0,
      error TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_webhook_events_received ON webhook_events(received_at DESC);
  `);

  // Phase 9: seed default stages on first boot if the table is empty.
  const stageCount = d
    .prepare("SELECT COUNT(*) as n FROM pipeline_stages")
    .get() as { n: number };
  if (stageCount.n === 0) {
    const seed = d.prepare(
      "INSERT INTO pipeline_stages (name, order_index, color, is_won, is_lost, auto_followup_days) VALUES (?, ?, ?, ?, ?, ?)",
    );
    seed.run("New lead", 0, "#3b82f6", 0, 0, 1);
    seed.run("Contacted", 1, "#8b5cf6", 0, 0, 3);
    seed.run("Quoted", 2, "#f59e0b", 0, 0, 5);
    seed.run("Negotiating", 3, "#ec4899", 0, 0, 3);
    seed.run("Won", 4, "#22c55e", 1, 0, null);
    seed.run("Lost", 5, "#94a3b8", 0, 1, null);
  }
}

// ---------------------------------------------------------------------------
// Phase 8: settings_kv helpers

export function getSetting<T = any>(key: string, fallback: T): T {
  const row = db().prepare("SELECT value FROM settings_kv WHERE key = ?").get(key) as
    | { value: string }
    | undefined;
  if (!row) return fallback;
  try {
    return JSON.parse(row.value) as T;
  } catch {
    return fallback;
  }
}

export function setSetting(key: string, value: any): void {
  const s = JSON.stringify(value);
  db()
    .prepare(
      `INSERT INTO settings_kv (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP`,
    )
    .run(key, s);
}

/**
 * Upsert a contact.
 *
 * Two columns, two sources:
 *  - `name` = user-given (CSV import, "new chat" dialog, contact edit). Only
 *    written when `source` is "agent". Never auto-filled from WhatsApp.
 *  - `wa_profile_name` = WhatsApp display name from the inbound webhook. Only
 *    written when `source` is "wa_profile". Always refreshed to the latest.
 *
 * The UI falls back from name → wa_profile_name → phone (see displayContactName).
 */
export function upsertContact(
  wa_id: string,
  name?: string | null,
  source: "agent" | "wa_profile" = "agent",
): number {
  const database = db();
  const existing = database
    .prepare("SELECT id, name, wa_profile_name FROM contacts WHERE wa_id = ?")
    .get(wa_id) as
    | { id: number; name: string | null; wa_profile_name: string | null }
    | undefined;
  const trimmed = name && name.trim() ? name.trim() : null;

  if (existing) {
    if (trimmed) {
      if (source === "wa_profile") {
        if (trimmed !== existing.wa_profile_name) {
          database
            .prepare(
              "UPDATE contacts SET wa_profile_name = ?, wa_profile_updated_at = CURRENT_TIMESTAMP WHERE id = ?",
            )
            .run(trimmed, existing.id);
        }
      } else if (trimmed !== existing.name) {
        database.prepare("UPDATE contacts SET name = ? WHERE id = ?").run(trimmed, existing.id);
      }
    }
    return existing.id;
  }

  const isWa = source === "wa_profile";
  const res = database
    .prepare(
      "INSERT INTO contacts (wa_id, name, wa_profile_name, wa_profile_updated_at) VALUES (?, ?, ?, ?)",
    )
    .run(
      wa_id,
      isWa ? null : trimmed,
      isWa ? trimmed : null,
      isWa && trimmed ? new Date().toISOString() : null,
    );
  return Number(res.lastInsertRowid);
}

export function touchContact(contactId: number, opts: { inbound?: boolean } = {}) {
  const now = new Date().toISOString();
  if (opts.inbound) {
    db().prepare("UPDATE contacts SET last_message_at = ?, last_inbound_at = ? WHERE id = ?").run(now, now, contactId);
  } else {
    db().prepare("UPDATE contacts SET last_message_at = ? WHERE id = ?").run(now, contactId);
  }
}
