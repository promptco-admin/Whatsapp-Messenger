import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { db, upsertContact, touchContact } from "@/lib/db";
import { runKeywordReplies } from "@/lib/auto-reply-runner";
import { handleInboundForFlows } from "@/lib/flow-runner";
import { runAwayMessage } from "@/lib/away-runner";
import { logError as auditLogError } from "@/lib/audit";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");
  const expected = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;
  const ok = mode === "subscribe" && !!token && token === expected && !!challenge;
  // Log verification attempts so Settings → Webhook status can show the most
  // recent handshake.
  try {
    db()
      .prepare(
        "INSERT INTO webhook_events (kind, signature_ok, error) VALUES (?, ?, ?)",
      )
      .run(
        ok ? "verify_ok" : "verify_failed",
        1,
        ok ? null : `mode=${mode || ""} token_match=${token === expected}`,
      );
  } catch {}
  if (ok) return new NextResponse(challenge, { status: 200 });
  return new NextResponse("forbidden", { status: 403 });
}

export async function POST(req: Request) {
  const raw = await req.text();

  // Health-log accumulators — written once at the end so a single row
  // captures the whole event regardless of which paths fire.
  let signatureOk = 1;
  let messageCount = 0;
  let statusCount = 0;
  let logKind = "unknown";
  let logError: string | null = null;

  const appSecret = process.env.WHATSAPP_APP_SECRET;
  if (appSecret) {
    const sigHeader = req.headers.get("x-hub-signature-256") || "";
    const expected = "sha256=" + crypto.createHmac("sha256", appSecret).update(raw).digest("hex");
    const ok =
      sigHeader.length === expected.length &&
      crypto.timingSafeEqual(Buffer.from(sigHeader), Buffer.from(expected));
    if (!ok) {
      try {
        db()
          .prepare(
            "INSERT INTO webhook_events (kind, signature_ok, error) VALUES (?, 0, ?)",
          )
          .run("invalid_signature", "X-Hub-Signature-256 mismatch");
      } catch {}
      auditLogError({
        source: "webhook.signature",
        message: "X-Hub-Signature-256 mismatch — Meta verification failed",
      });
      return new NextResponse("invalid signature", { status: 401 });
    }
  }

  let payload: any;
  try {
    payload = JSON.parse(raw);
  } catch {
    try {
      db()
        .prepare(
          "INSERT INTO webhook_events (kind, signature_ok, error) VALUES (?, ?, ?)",
        )
        .run("invalid_json", signatureOk, "JSON parse error");
    } catch {}
    auditLogError({
      source: "webhook.parse",
      message: "Invalid JSON in webhook payload",
      context: { length: raw.length },
    });
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  try {
    for (const entry of payload.entry || []) {
      for (const change of entry.changes || []) {
        const value = change.value || {};
        const contactsMeta: Record<string, string> = {};
        for (const c of value.contacts || []) {
          contactsMeta[c.wa_id] = c.profile?.name || "";
        }

        for (const msg of value.messages || []) {
          messageCount++;
          logKind = "message";
          const waId = msg.from;
          const name = contactsMeta[waId] || null;
          // Detect "first inbound ever" BEFORE upsert/touch — that's when a
          // new-contact or from-ad flow should fire.
          const existingRow = db()
            .prepare("SELECT id, last_inbound_at FROM contacts WHERE wa_id = ?")
            .get(waId) as { id: number; last_inbound_at: string | null } | undefined;
          const isFirstInbound = !existingRow || !existingRow.last_inbound_at;
          const contactId = upsertContact(waId, name, "wa_profile");

          // Phase 6a: click-to-WhatsApp ad attribution.
          // Meta attaches `msg.referral` on the first inbound from an ad click.
          // We preserve first-touch: only write if contact has no source yet.
          if (msg.referral) {
            try {
              const existing = db()
                .prepare("SELECT source_json, tags FROM contacts WHERE id = ?")
                .get(contactId) as { source_json: string | null; tags: string | null } | undefined;
              if (existing && !existing.source_json) {
                const r = msg.referral;
                const source = {
                  source_type: r.source_type || "ad",
                  source_id: r.source_id || null,
                  source_url: r.source_url || null,
                  headline: r.headline || null,
                  body: r.body || null,
                  media_type: r.media_type || null,
                  image_url: r.image_url || null,
                  video_url: r.video_url || null,
                  thumbnail_url: r.thumbnail_url || null,
                  ctwa_clid: r.ctwa_clid || null,
                  first_seen_at: new Date().toISOString(),
                };
                let tags: string[] = [];
                try {
                  tags = JSON.parse(existing.tags || "[]");
                } catch {
                  tags = [];
                }
                if (!tags.includes("from-ad")) tags.push("from-ad");
                db()
                  .prepare("UPDATE contacts SET source_json = ?, tags = ? WHERE id = ?")
                  .run(JSON.stringify(source), JSON.stringify(tags), contactId);
              }
            } catch (e) {
              console.error("[webhook] referral store error", e);
            }
          }

          const type = msg.type as string;
          let body: string | null = null;
          let mediaId: string | null = null;
          let mediaMime: string | null = null;
          let mediaFilename: string | null = null;
          if (type === "text") body = msg.text?.body ?? null;
          else if (type === "image") {
            body = msg.image?.caption || "";
            mediaId = msg.image?.id ?? null;
            mediaMime = msg.image?.mime_type ?? null;
          } else if (type === "document") {
            body = msg.document?.caption || "";
            mediaId = msg.document?.id ?? null;
            mediaMime = msg.document?.mime_type ?? null;
            mediaFilename = msg.document?.filename ?? null;
          } else if (type === "audio") {
            body = "";
            mediaId = msg.audio?.id ?? null;
            mediaMime = msg.audio?.mime_type ?? null;
          } else if (type === "video") {
            body = msg.video?.caption || "";
            mediaId = msg.video?.id ?? null;
            mediaMime = msg.video?.mime_type ?? null;
          } else if (type === "sticker") {
            body = "";
            mediaId = msg.sticker?.id ?? null;
            mediaMime = msg.sticker?.mime_type ?? null;
          } else if (type === "button") {
            body = msg.button?.text || msg.button?.payload || "[button reply]";
          } else if (type === "interactive") {
            const itype = msg.interactive?.type;
            const br = msg.interactive?.button_reply;
            const lr = msg.interactive?.list_reply;
            const nfm = msg.interactive?.nfm_reply;
            if (itype === "button_reply" || br) {
              body = br?.title || br?.id || "[button reply]";
            } else if (itype === "list_reply" || lr) {
              body = lr?.title || lr?.id || "[list reply]";
              if (lr?.description) body += ` — ${lr.description}`;
            } else if (itype === "nfm_reply" || nfm) {
              // WhatsApp Flow submission — nfm_reply.response_json is a stringified
              // JSON map of the form field answers. Pretty-print as key: value lines.
              let pretty = "";
              try {
                const parsed = JSON.parse(nfm?.response_json || "{}");
                pretty = Object.entries(parsed)
                  .filter(([k]) => !k.startsWith("flow_token"))
                  .map(
                    ([k, v]) =>
                      `${k}: ${typeof v === "object" ? JSON.stringify(v) : v}`,
                  )
                  .join("\n");
              } catch {
                // fall through to fallback below
              }
              body =
                pretty ||
                nfm?.body ||
                (nfm?.name ? `Flow submitted: ${nfm.name}` : "[flow reply]");
            } else {
              body = `[interactive:${itype || "unknown"}]`;
            }
          } else if (type === "reaction") {
            const emoji = msg.reaction?.emoji;
            body = emoji ? `Reacted ${emoji}` : "Removed reaction";
          } else if (type === "location") {
            const loc = msg.location || {};
            const parts: string[] = ["📍 Location"];
            if (loc.name) parts.push(loc.name);
            if (loc.address) parts.push(loc.address);
            if (loc.latitude != null && loc.longitude != null) {
              parts.push(`(${loc.latitude}, ${loc.longitude})`);
            }
            body = parts.join(" — ");
          } else if (type === "contacts") {
            const contacts = msg.contacts || [];
            body = contacts
              .map((c: any) => {
                const n = c.name?.formatted_name || c.name?.first_name || "contact";
                const phone = c.phones?.[0]?.phone || c.phones?.[0]?.wa_id || "";
                return phone ? `👤 ${n} — ${phone}` : `👤 ${n}`;
              })
              .join("\n") || "[shared contact]";
          } else if (type === "order") {
            const order = msg.order || {};
            const items = (order.product_items || []).length;
            body = `🛒 Order — ${items} item${items === 1 ? "" : "s"}${
              order.text ? `\n${order.text}` : ""
            }`;
          } else if (type === "system") {
            body = msg.system?.body || "[system message]";
          } else if (type === "unsupported") {
            // Meta couldn't forward the original format (view-once media, polls,
            // payments, newer WhatsApp features, etc.). Surface the error title
            // if they gave us one, so you can at least see what was attempted.
            const errTitle = msg.errors?.[0]?.title || msg.errors?.[0]?.message;
            body = errTitle
              ? `[unsupported: ${errTitle}]`
              : "[unsupported — sender used a message type this app can't receive]";
          } else body = `[${type}]`;

          const allowed = ["text", "image", "document", "audio", "video", "sticker"];
          const storedType = allowed.includes(type) ? type : "other";

          let isNewMessage = true;
          try {
            db()
              .prepare(
                `INSERT INTO messages (wa_message_id, contact_id, direction, type, body, status, media_id, media_mime, media_filename)
                 VALUES (?, ?, 'inbound', ?, ?, 'delivered', ?, ?, ?)`,
              )
              .run(msg.id, contactId, storedType, body, mediaId, mediaMime, mediaFilename);
            touchContact(contactId, { inbound: true });
          } catch (e: any) {
            if (String(e?.message || "").includes("UNIQUE")) {
              // Duplicate webhook delivery — don't re-fire auto-replies.
              isNewMessage = false;
            } else {
              throw e;
            }
          }

          // Phase 7a: STOP / opt-out compliance.
          // If the inbound is a bare opt-out keyword, mark the contact unsubscribed
          // and short-circuit — don't fire auto-replies or flows.
          // We also mark START / UNSTOP as opt-in (clears the flag).
          const optOutWords = ["stop", "unsubscribe", "stopall", "cancel", "end", "quit"];
          const optInWords = ["start", "unstop", "yes", "subscribe"];
          const normalized = (body || "").trim().toLowerCase();
          let suppressAutomation = false;
          if (isNewMessage && ["text", "button", "interactive"].includes(type)) {
            if (optOutWords.includes(normalized)) {
              const now = new Date().toISOString();
              db()
                .prepare("UPDATE contacts SET unsubscribed_at = ? WHERE id = ?")
                .run(now, contactId);
              suppressAutomation = true;
              console.log(`[webhook] contact #${contactId} opted out via "${normalized}"`);
            } else if (optInWords.includes(normalized)) {
              db()
                .prepare("UPDATE contacts SET unsubscribed_at = NULL WHERE id = ?")
                .run(contactId);
              console.log(`[webhook] contact #${contactId} opted back in via "${normalized}"`);
            }
          }

          // Fire keyword auto-replies for new inbound text-like messages.
          // Text bodies and captions are the only useful triggers; skip pure media.
          if (
            isNewMessage &&
            body &&
            !suppressAutomation &&
            ["text", "button", "interactive"].includes(type)
          ) {
            runKeywordReplies(contactId, body).catch((e) =>
              console.error("[webhook] auto-reply error", e),
            );
          }

          // Phase 8: away-message (out-of-hours ack). Fires only when the
          // configured business-hours window is CLOSED, respects cooldown.
          // Runs for text-like inbounds only.
          if (
            isNewMessage &&
            body &&
            !suppressAutomation &&
            ["text", "button", "interactive"].includes(type)
          ) {
            runAwayMessage(contactId, body).catch((e) =>
              console.error("[webhook] away-message error", e),
            );
          }

          // Phase 6c: advance flow runs + fire flow triggers.
          // Runs even for media messages so ask_question can capture them.
          // Opted-out contacts are skipped.
          if (isNewMessage && !suppressAutomation) {
            handleInboundForFlows(contactId, body || "", isFirstInbound).catch((e) =>
              console.error("[webhook] flow error", e),
            );
          }
        }

        for (const st of value.statuses || []) {
          statusCount++;
          if (logKind === "unknown") logKind = "status";
          const mapped =
            st.status === "sent" || st.status === "delivered" || st.status === "read" || st.status === "failed"
              ? st.status
              : null;
          if (!mapped) continue;
          const err = st.errors?.[0]?.title || st.errors?.[0]?.message || null;
          const upd = db()
            .prepare("UPDATE messages SET status = ?, error = COALESCE(?, error) WHERE wa_message_id = ?")
            .run(mapped, err, st.id);

          // If we don't already have this message in our DB, it was sent from
          // another tool (Meta Business Manager UI, a different agent's app, etc.).
          // Create a ghost row so it shows up in the conversation history.
          // Meta's status webhook only carries the wa_message_id + recipient — not
          // the body — so we record a placeholder and rely on subsequent
          // delivered/read events updating the same row via wa_message_id.
          if (upd.changes === 0 && st.recipient_id) {
            const recipientWaId = String(st.recipient_id).replace(/[^0-9]/g, "");
            if (recipientWaId.length >= 8) {
              try {
                const contactId = upsertContact(recipientWaId, null);
                // Pull what little metadata the status webhook gives us.
                // Meta does NOT echo template name or body — only the
                // pricing/conversation category (marketing / utility /
                // authentication / service / referral_conversion).
                const category =
                  st.pricing?.category ||
                  st.conversation?.origin?.type ||
                  null;
                const placeholder = category
                  ? `[Sent from another tool — ${category} template, body not captured]`
                  : "[Sent from another tool — body not captured by webhook]";
                db()
                  .prepare(
                    `INSERT OR IGNORE INTO messages
                       (wa_message_id, contact_id, direction, type, body, status, error)
                     VALUES (?, ?, 'outbound', 'external', ?, ?, ?)`,
                  )
                  .run(st.id, contactId, placeholder, mapped, err);
                touchContact(contactId);
              } catch (e) {
                console.error("[webhook] ghost-message insert failed", e);
              }
            }
          }

          const recipient = db()
            .prepare(
              "SELECT id, broadcast_id, status FROM broadcast_recipients WHERE wa_message_id = ?",
            )
            .get(st.id) as { id: number; broadcast_id: number; status: string } | undefined;
          if (recipient) {
            const prev = recipient.status;
            db()
              .prepare("UPDATE broadcast_recipients SET status = ? WHERE id = ?")
              .run(mapped, recipient.id);
            if (mapped === "delivered" && prev !== "delivered" && prev !== "read") {
              db()
                .prepare("UPDATE broadcasts SET delivered = delivered + 1 WHERE id = ?")
                .run(recipient.broadcast_id);
            } else if (mapped === "read" && prev !== "read") {
              db()
                .prepare("UPDATE broadcasts SET read = read + 1 WHERE id = ?")
                .run(recipient.broadcast_id);
            } else if (mapped === "failed" && prev !== "failed") {
              db()
                .prepare("UPDATE broadcasts SET failed = failed + 1 WHERE id = ?")
                .run(recipient.broadcast_id);
            }
          }
        }
      }
    }
  } catch (e: any) {
    console.error("webhook error", e);
    logError = e?.message || String(e);
    auditLogError({
      source: "webhook.handler",
      message: e?.message || String(e),
      context: { messageCount, statusCount },
    });
  }

  // Persist health-log row + auto-prune to last 1000.
  try {
    db()
      .prepare(
        `INSERT INTO webhook_events (kind, signature_ok, message_count, status_count, error)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .run(logKind, signatureOk, messageCount, statusCount, logError);
    db()
      .prepare(
        `DELETE FROM webhook_events
          WHERE id IN (
            SELECT id FROM webhook_events ORDER BY id DESC LIMIT -1 OFFSET 1000
          )`,
      )
      .run();
  } catch {}

  return NextResponse.json({ ok: true });
}
