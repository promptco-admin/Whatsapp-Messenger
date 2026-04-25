# WhatsApp Business Messenger

A WhatsApp-lookalike web messenger for the **WhatsApp Business Cloud API**. Send approved message templates, reply within the 24-hour customer service window, and receive messages via webhooks.

Stack: Next.js 14 (App Router) · TypeScript · Tailwind · SQLite (`better-sqlite3`).

## Features

- WhatsApp-style two-pane UI (chat list + chat view)
- **Send approved templates** with variable-fill & live preview (pulled live from Meta Business)
- **Free-form text replies** (automatically locked outside the 24h window, per Meta policy)
- **Webhook receiver** for incoming messages + delivery/read status updates
- Status ticks (sent / delivered / read / failed)
- New-chat dialog to start conversations with any customer
- Persistent SQLite storage
- Signature verification on incoming webhooks (HMAC-SHA256)

## Prerequisites

From Meta Business / developers.facebook.com, you'll need:

1. A Meta App with the **WhatsApp** product added.
2. **Phone Number ID** and **WhatsApp Business Account ID** (from WhatsApp > API Setup).
3. A **System User Access Token** with `whatsapp_business_messaging` + `whatsapp_business_management` permissions (or the temporary token during testing).
4. **App Secret** (App > Settings > Basic).
5. At least one **approved message template** in Meta Business Manager > WhatsApp Manager > Message Templates.

## Setup

```bash
# 1. Install deps
npm install

# 2. Configure env
cp .env.example .env.local
# then edit .env.local and fill in your values

# 3. Run dev server
npm run dev
```

Open http://localhost:3000.

### Environment variables

| Var | What |
|---|---|
| `WHATSAPP_ACCESS_TOKEN` | Permanent system user token |
| `WHATSAPP_PHONE_NUMBER_ID` | The sender phone number ID |
| `WHATSAPP_BUSINESS_ACCOUNT_ID` | WABA ID (used to list templates) |
| `WHATSAPP_API_VERSION` | e.g. `v21.0` |
| `WHATSAPP_WEBHOOK_VERIFY_TOKEN` | Any random string; must match what you configure in Meta Dashboard |
| `WHATSAPP_APP_SECRET` | Meta App Secret, used to verify webhook signatures |
| `DATABASE_PATH` | Path to SQLite file (default `./data/messenger.db`) |

## Receiving messages — configure the webhook

1. Expose your local server publicly (for local dev):
   ```bash
   ngrok http 3000
   ```
2. In Meta App Dashboard > WhatsApp > Configuration > **Webhook**:
   - **Callback URL**: `https://<your-host>/api/webhook`
   - **Verify token**: same value as `WHATSAPP_WEBHOOK_VERIFY_TOKEN` in your env
   - Click **Verify and save**
3. Subscribe to webhook fields: `messages` (required). Optionally `message_template_status_update`.

Once verified, inbound customer messages and delivery/read receipts will flow into the app.

## Sending messages

- **Template send** (works any time): click **Templates** in the composer, pick an approved template, fill variables, preview, and send.
- **Free-form text** (only within the 24h customer service window): once a customer has messaged you, type in the composer and hit Send/Enter. The composer disables itself automatically outside the window — this is a Meta policy, not an app bug.

## Deployment

SQLite requires a **persistent disk**, so Vercel serverless **will not work** out of the box. Use one of these:

### Railway

1. Create a new project from this repo.
2. Add env vars from `.env.example`.
3. Add a **persistent volume** mounted at `/data`, set `DATABASE_PATH=/data/messenger.db`.
4. Deploy. Set your webhook URL in Meta Dashboard to `https://<railway-domain>/api/webhook`.

### Render

1. New **Web Service** from this repo. Build: `npm install && npm run build`. Start: `npm start`.
2. Add a **Disk** mounted at `/data` (1 GB is plenty), set `DATABASE_PATH=/data/messenger.db`.
3. Fill env vars. Update webhook URL in Meta Dashboard.

### Fly.io

1. `fly launch` (choose "No" to Postgres).
2. `fly volumes create data --size 1`.
3. In `fly.toml`, mount the volume at `/data` and set `DATABASE_PATH=/data/messenger.db`.
4. `fly secrets set WHATSAPP_ACCESS_TOKEN=... WHATSAPP_PHONE_NUMBER_ID=... ...`.
5. `fly deploy`. Update webhook URL.

### Prefer Postgres?
Swap `lib/db.ts` for a Postgres driver (e.g. `pg` or `@neondatabase/serverless`) and the same schema works. Once on Postgres you can deploy to Vercel.

## Project structure

```
app/
  layout.tsx, page.tsx, globals.css
  api/
    conversations/route.ts            GET list / POST create contact
    conversations/[id]/messages/route.ts  GET thread + mark read
    messages/send/route.ts            POST send text or template
    templates/route.ts                GET approved templates from Meta
    webhook/route.ts                  GET verify, POST receive events
components/
  ChatList.tsx, ChatView.tsx, MessageBubble.tsx
  TemplatePicker.tsx, NewChatDialog.tsx
lib/
  db.ts, whatsapp.ts, types.ts
```

## Notes & caveats

- Template sending currently supports **text body variables** (`{{1}}`, `{{2}}`, …). Header media (image/video/document) and URL button variables aren't wired up in the UI yet — easy to extend in `components/TemplatePicker.tsx` + `app/api/messages/send/route.ts`.
- The poll interval (4–5s) is a simple approach; swap for SSE or websockets if you need instant updates.
- Make sure the customer's phone number is in **E.164-style digits only** (country code + number, no `+` or spaces), e.g. `14155550123`.
- Test phone numbers (from Meta's WhatsApp API Setup screen) only allow sending to pre-verified recipients. Move to a production number to message any customer.
