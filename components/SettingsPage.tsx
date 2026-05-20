"use client";

import { useEffect, useState } from "react";
import { useCurrentUser, type CurrentUser } from "@/lib/useCurrentUser";

type TeamUser = {
  id: number;
  email: string;
  name: string;
  role: "admin" | "agent";
  active: number;
  phone_masking: number;
  created_at: string;
};

export function SettingsPage() {
  const { user, refresh } = useCurrentUser();
  const [users, setUsers] = useState<TeamUser[]>([]);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);

  async function loadUsers() {
    const res = await fetch("/api/users", { cache: "no-store" });
    if (!res.ok) return;
    const j = await res.json();
    setUsers(j.users || []);
  }

  useEffect(() => {
    loadUsers();
  }, []);

  if (!user) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-wa-textMuted">
        Loading…
      </div>
    );
  }

  async function togglePhoneMasking() {
    if (!user) return;
    await fetch(`/api/users/${user.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone_masking: !user.phone_masking }),
    });
    refresh();
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  }

  return (
    <div className="flex h-full w-full flex-col overflow-y-auto bg-white">
      <div className="border-b border-wa-border bg-wa-panel px-6 py-4">
        <div className="text-lg font-medium">Settings</div>
        <div className="text-xs text-wa-textMuted">Your profile and team management</div>
      </div>

      <div className="mx-auto w-full max-w-3xl space-y-6 p-6">
        {/* Profile */}
        <section className="rounded-lg border border-wa-border bg-white p-5">
          <div className="mb-3 text-sm font-medium">Your account</div>
          <div className="space-y-2 text-sm">
            <div>
              <span className="text-wa-textMuted">Name:</span> {user.name}
            </div>
            <div>
              <span className="text-wa-textMuted">Email:</span> {user.email}
            </div>
            <div>
              <span className="text-wa-textMuted">Role:</span>{" "}
              <span className="rounded bg-wa-panel px-2 py-0.5 text-xs">{user.role}</span>
            </div>
            <div className="flex items-center gap-2 pt-1">
              <label className="flex cursor-pointer items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={!!user.phone_masking}
                  onChange={togglePhoneMasking}
                />
                <span>Mask phone numbers in my view</span>
              </label>
            </div>
          </div>
          <div className="mt-4 flex gap-2">
            <button
              onClick={() => setPasswordOpen(true)}
              className="rounded bg-wa-panelDark px-3 py-1.5 text-xs hover:bg-wa-border"
            >
              Change password
            </button>
            <button
              onClick={logout}
              className="rounded bg-red-50 px-3 py-1.5 text-xs text-red-700 hover:bg-red-100"
            >
              Log out
            </button>
          </div>
        </section>

        {/* Team management (visible to all, but actions gated to admins) */}
        <section className="rounded-lg border border-wa-border bg-white p-5">
          <div className="mb-3 flex items-center justify-between">
            <div className="text-sm font-medium">Team</div>
            {user.role === "admin" && (
              <button
                onClick={() => setInviteOpen(true)}
                className="rounded bg-wa-greenDark px-3 py-1.5 text-xs font-medium text-white hover:bg-wa-green"
              >
                + Add user
              </button>
            )}
          </div>
          <div className="-mx-3 overflow-x-auto md:mx-0">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="text-left text-xs text-wa-textMuted">
                <th className="border-b border-wa-border py-2 px-3">Name</th>
                <th className="border-b border-wa-border py-2 px-3">Email</th>
                <th className="border-b border-wa-border py-2 px-3">Role</th>
                <th className="border-b border-wa-border py-2 px-3 text-center">Mask phones</th>
                <th className="border-b border-wa-border py-2"></th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td className="border-b border-wa-border py-2">
                    {u.name}
                    {u.id === user.id && (
                      <span className="ml-1 text-[10px] text-wa-textMuted">(you)</span>
                    )}
                  </td>
                  <td className="border-b border-wa-border py-2 text-xs">{u.email}</td>
                  <td className="border-b border-wa-border py-2">
                    <span className="rounded bg-wa-panel px-2 py-0.5 text-xs">{u.role}</span>
                  </td>
                  <td className="border-b border-wa-border py-2 text-center">
                    {/* Admin can flip masking for any user; an agent can only flip their own. */}
                    <label
                      className={
                        user.role === "admin" || u.id === user.id
                          ? "inline-flex cursor-pointer items-center"
                          : "inline-flex items-center opacity-50"
                      }
                      title={
                        user.role === "admin"
                          ? "Toggle phone-number masking for this user"
                          : u.id === user.id
                            ? "Toggle phone-number masking for yourself"
                            : "Only an admin can change this"
                      }
                    >
                      <input
                        type="checkbox"
                        disabled={user.role !== "admin" && u.id !== user.id}
                        checked={!!u.phone_masking}
                        onChange={async (e) => {
                          const next = e.target.checked ? 1 : 0;
                          await fetch(`/api/users/${u.id}`, {
                            method: "PATCH",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ phone_masking: next }),
                          });
                          loadUsers();
                          if (u.id === user.id) refresh();
                        }}
                      />
                    </label>
                  </td>
                  <td className="border-b border-wa-border py-2 text-right">
                    {user.role === "admin" && u.id !== user.id && (
                      <button
                        onClick={async () => {
                          if (!confirm(`Deactivate ${u.name}?`)) return;
                          await fetch(`/api/users/${u.id}`, { method: "DELETE" });
                          loadUsers();
                        }}
                        className="text-xs text-red-600 hover:underline"
                      >
                        Deactivate
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
          {user.role === "admin" && (
            <div className="mt-2 text-[10px] text-wa-textMuted">
              As admin you can flip <b>Mask phones</b> for any agent. Agents can still toggle their
              own preference, but admins override to enforce a team-wide policy.
            </div>
          )}
        </section>

        {/* Webhook health (admin only) */}
        {user.role === "admin" && <WebhookStatusSection />}
        {/* Out-of-hours away message */}
        <AwayMessageSection />
        {/* Ad → Agent routing (admin only) */}
        {user.role === "admin" && <AdRoutingSection />}
        {/* Click-tracking short links */}
        <ShortLinksSection />
        {/* QR code / wa.me link generator */}
        <QrGeneratorSection />
        {/* Per-source tracked QRs (product / technician / generic) */}
        <TrackedQrSourcesSection currentUser={user} />
        {/* Browser push notifications */}
        <PushNotificationsSection />
      </div>

      <InviteUserDialog
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        onCreated={loadUsers}
      />
      <ChangePasswordDialog
        open={passwordOpen}
        onClose={() => setPasswordOpen(false)}
        user={user}
      />
    </div>
  );
}

/**
 * QR code + wa.me deep-link generator.
 * Builds a https://wa.me/<number>?text=<prefilled> link and renders a QR for it
 * using the free api.qrserver.com service (no extra dependency).
 */
function QrGeneratorSection() {
  const [phone, setPhone] = useState("");
  const [prefilled, setPrefilled] = useState("Hi! I'd like to know more.");
  const digits = phone.replace(/[^0-9]/g, "");
  const valid = digits.length >= 8;
  const link = valid
    ? `https://wa.me/${digits}${prefilled ? `?text=${encodeURIComponent(prefilled)}` : ""}`
    : "";
  const qrUrl = valid
    ? `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(link)}`
    : "";

  async function copy() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
    } catch {}
  }

  return (
    <section className="rounded-lg border border-wa-border bg-white p-5">
      <div className="mb-1 text-sm font-medium">Click-to-chat QR & wa.me link</div>
      <div className="mb-4 text-xs text-wa-textMuted">
        Generate a <code>wa.me/&lt;number&gt;</code> link with a pre-filled message — share
        it or print the QR on leaflets, posters, vehicle wraps. Customers scan and start a
        WhatsApp chat with you instantly.
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-wa-textMuted">
              WhatsApp number (with country code, no +)
            </label>
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="919876543210"
              className="w-full rounded border border-wa-border px-3 py-2 text-sm"
            />
            <div className="mt-1 text-[10px] text-wa-textMuted">
              India numbers start with <code>91</code>, e.g. <code>919876543210</code>.
            </div>
          </div>
          <div>
            <label className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-wa-textMuted">
              Pre-filled message (optional)
            </label>
            <textarea
              value={prefilled}
              onChange={(e) => setPrefilled(e.target.value)}
              rows={3}
              placeholder="Hi! I'd like to know more about your water purifiers."
              className="w-full rounded border border-wa-border px-3 py-2 text-sm"
            />
          </div>
          {valid && (
            <div>
              <label className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-wa-textMuted">
                Shareable link
              </label>
              <div className="flex gap-2">
                <input
                  readOnly
                  value={link}
                  className="flex-1 rounded border border-wa-border bg-wa-panel/30 px-2 py-1.5 text-xs"
                />
                <button
                  onClick={copy}
                  className="rounded bg-wa-greenDark px-3 py-1.5 text-xs font-medium text-white hover:bg-wa-green"
                >
                  Copy
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="flex flex-col items-center justify-center gap-2">
          {valid ? (
            <>
              <img
                src={qrUrl}
                alt="QR code"
                width={220}
                height={220}
                className="rounded border border-wa-border bg-white p-2"
              />
              <a
                href={qrUrl}
                download={`whatsapp-qr-${digits}.png`}
                className="text-xs text-wa-greenDark hover:underline"
              >
                Download QR (PNG)
              </a>
              <a
                href={link}
                target="_blank"
                rel="noreferrer"
                className="text-xs text-wa-textMuted hover:underline"
              >
                Test in WhatsApp →
              </a>
            </>
          ) : (
            <div className="flex h-[220px] w-[220px] items-center justify-center rounded border border-dashed border-wa-border text-center text-xs text-wa-textMuted">
              Enter a number to generate QR
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function InviteUserDialog({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"admin" | "agent">("agent");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) {
      setName("");
      setEmail("");
      setPassword("");
      setRole("agent");
      setErr(null);
    }
  }, [open]);

  if (!open) return null;

  async function submit() {
    setErr(null);
    setBusy(true);
    try {
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password, role }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErr(j.error || "Failed");
        return;
      }
      onCreated();
      onClose();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-lg bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 text-base font-medium">Add user</div>
        <div className="space-y-3">
          <input
            placeholder="Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded border border-wa-border px-3 py-2 text-sm outline-none focus:border-wa-greenDark"
          />
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded border border-wa-border px-3 py-2 text-sm outline-none focus:border-wa-greenDark"
          />
          <input
            type="password"
            placeholder="Password (min 8 chars)"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded border border-wa-border px-3 py-2 text-sm outline-none focus:border-wa-greenDark"
          />
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as any)}
            className="w-full rounded border border-wa-border px-3 py-2 text-sm outline-none"
          >
            <option value="agent">Agent</option>
            <option value="admin">Admin</option>
          </select>
          {err && <div className="rounded bg-red-50 p-2 text-xs text-red-700">{err}</div>}
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded px-3 py-1.5 text-xs text-wa-textMuted hover:bg-wa-panel"
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={busy}
            className="rounded bg-wa-greenDark px-3 py-1.5 text-xs font-medium text-white hover:bg-wa-green disabled:opacity-50"
          >
            {busy ? "…" : "Create"}
          </button>
        </div>
      </div>
    </div>
  );
}

function ChangePasswordDialog({
  open,
  onClose,
  user,
}: {
  open: boolean;
  onClose: () => void;
  user: CurrentUser;
}) {
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) {
      setPassword("");
      setErr(null);
    }
  }, [open]);

  if (!open) return null;

  async function submit() {
    setErr(null);
    setBusy(true);
    try {
      const res = await fetch(`/api/users/${user.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErr(j.error || "Failed");
        return;
      }
      onClose();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-lg bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 text-base font-medium">Change password</div>
        <input
          type="password"
          placeholder="New password (min 8 chars)"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full rounded border border-wa-border px-3 py-2 text-sm outline-none focus:border-wa-greenDark"
        />
        {err && <div className="mt-2 rounded bg-red-50 p-2 text-xs text-red-700">{err}</div>}
        <div className="mt-4 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded px-3 py-1.5 text-xs text-wa-textMuted hover:bg-wa-panel"
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={busy}
            className="rounded bg-wa-greenDark px-3 py-1.5 text-xs font-medium text-white hover:bg-wa-green disabled:opacity-50"
          >
            {busy ? "…" : "Update"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Phase 8: Out-of-hours away message

type AwayConfig = {
  enabled: boolean;
  text: string;
  cooldown_minutes: number;
  hours: {
    tz: string;
    days: number[];
    start: string;
    end: string;
  };
};

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function AwayMessageSection() {
  const [cfg, setCfg] = useState<AwayConfig | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState("");

  useEffect(() => {
    fetch("/api/settings/away-message")
      .then((r) => r.json())
      .then((j) => setCfg(j.config))
      .catch(() => {});
  }, []);

  async function save() {
    if (!cfg) return;
    setSaving(true);
    setSavedMsg("");
    try {
      const res = await fetch("/api/settings/away-message", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(cfg),
      });
      const j = await res.json();
      if (res.ok) {
        setCfg(j.config);
        setSavedMsg("Saved");
        setTimeout(() => setSavedMsg(""), 1500);
      } else {
        setSavedMsg(`Error: ${j.error || "save failed"}`);
      }
    } finally {
      setSaving(false);
    }
  }

  function toggleDay(d: number) {
    if (!cfg) return;
    const has = cfg.hours.days.includes(d);
    setCfg({
      ...cfg,
      hours: {
        ...cfg.hours,
        days: has
          ? cfg.hours.days.filter((x) => x !== d)
          : [...cfg.hours.days, d].sort((a, b) => a - b),
      },
    });
  }

  if (!cfg) {
    return (
      <section className="rounded-lg border border-wa-border bg-white p-5">
        <div className="text-sm text-wa-textMuted">Loading away message…</div>
      </section>
    );
  }

  return (
    <section className="rounded-lg border border-wa-border bg-white p-5">
      <div className="mb-1 flex items-center justify-between">
        <div className="text-sm font-medium">Out-of-hours away message</div>
        <label className="flex items-center gap-2 text-xs">
          <input
            type="checkbox"
            checked={cfg.enabled}
            onChange={(e) => setCfg({ ...cfg, enabled: e.target.checked })}
          />
          Enabled
        </label>
      </div>
      <div className="mb-4 text-xs text-wa-textMuted">
        When a customer messages you OUTSIDE the hours below, send this automatic reply
        once per cooldown period. Supports <code>{"{{name}}"}</code> and{" "}
        <code>{"{{phone}}"}</code>.
      </div>

      <div className="space-y-3">
        <div>
          <label className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-wa-textMuted">
            Message text
          </label>
          <textarea
            value={cfg.text}
            onChange={(e) => setCfg({ ...cfg, text: e.target.value })}
            rows={4}
            className="w-full rounded border border-wa-border px-3 py-2 text-sm"
          />
        </div>

        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <div>
            <label className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-wa-textMuted">
              Timezone
            </label>
            <input
              value={cfg.hours.tz}
              onChange={(e) =>
                setCfg({ ...cfg, hours: { ...cfg.hours, tz: e.target.value } })
              }
              className="w-full rounded border border-wa-border px-2 py-1.5 text-xs"
              placeholder="Asia/Kolkata"
            />
          </div>
          <div>
            <label className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-wa-textMuted">
              Open from
            </label>
            <input
              type="time"
              value={cfg.hours.start}
              onChange={(e) =>
                setCfg({ ...cfg, hours: { ...cfg.hours, start: e.target.value } })
              }
              className="w-full rounded border border-wa-border px-2 py-1.5 text-xs"
            />
          </div>
          <div>
            <label className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-wa-textMuted">
              Open until
            </label>
            <input
              type="time"
              value={cfg.hours.end}
              onChange={(e) =>
                setCfg({ ...cfg, hours: { ...cfg.hours, end: e.target.value } })
              }
              className="w-full rounded border border-wa-border px-2 py-1.5 text-xs"
            />
          </div>
          <div>
            <label className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-wa-textMuted">
              Cooldown (minutes)
            </label>
            <input
              type="number"
              min={1}
              max={10080}
              value={cfg.cooldown_minutes}
              onChange={(e) =>
                setCfg({ ...cfg, cooldown_minutes: Number(e.target.value) })
              }
              className="w-full rounded border border-wa-border px-2 py-1.5 text-xs"
            />
          </div>
        </div>

        <div>
          <label className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-wa-textMuted">
            Open days
          </label>
          <div className="flex gap-1">
            {DAY_LABELS.map((lbl, idx) => {
              const on = cfg.hours.days.includes(idx);
              return (
                <button
                  key={idx}
                  type="button"
                  onClick={() => toggleDay(idx)}
                  className={`rounded border px-2 py-1 text-xs ${
                    on
                      ? "border-wa-greenDark bg-wa-greenDark text-white"
                      : "border-wa-border bg-white text-wa-textMuted"
                  }`}
                >
                  {lbl}
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex items-center gap-3 pt-2">
          <button
            onClick={save}
            disabled={saving}
            className="rounded bg-wa-greenDark px-4 py-1.5 text-xs font-medium text-white hover:bg-wa-green disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save"}
          </button>
          <span className="text-xs text-wa-textMuted">{savedMsg}</span>
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Phase 8: Click-tracking short links

type ShortLinkRow = {
  id: number;
  code: string;
  destination_url: string;
  label: string | null;
  broadcast_id: number | null;
  template_name: string | null;
  created_at: string;
  clicks: number;
  unique_clicks: number;
};

function ShortLinksSection() {
  const [links, setLinks] = useState<ShortLinkRow[]>([]);
  const [url, setUrl] = useState("");
  const [label, setLabel] = useState("");
  const [creating, setCreating] = useState(false);
  const [err, setErr] = useState("");
  const [base, setBase] = useState("");

  useEffect(() => {
    setBase(`${window.location.protocol}//${window.location.host}`);
    load();
  }, []);

  async function load() {
    const res = await fetch("/api/short-links", { cache: "no-store" });
    if (!res.ok) return;
    const j = await res.json();
    setLinks(j.links || []);
  }

  async function create() {
    setErr("");
    setCreating(true);
    try {
      const res = await fetch("/api/short-links", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          destination_url: url,
          label: label || null,
        }),
      });
      const j = await res.json();
      if (!res.ok) {
        setErr(j.error || "failed");
        return;
      }
      setUrl("");
      setLabel("");
      load();
    } finally {
      setCreating(false);
    }
  }

  return (
    <section className="rounded-lg border border-wa-border bg-white p-5">
      <div className="mb-1 text-sm font-medium">Click-tracking short links</div>
      <div className="mb-4 text-xs text-wa-textMuted">
        Wrap any URL in a short link, paste it into a template URL button or broadcast,
        and see who clicked. Append <code>?c={"{{1}}"}</code> and map the contact id
        into the first template variable to attribute clicks per customer.
      </div>

      <div className="mb-4 grid gap-2 md:grid-cols-[1fr_180px_auto]">
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://your-landing-page.com/offer"
          className="rounded border border-wa-border px-3 py-1.5 text-sm"
        />
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="Label (e.g. Diwali 2026)"
          className="rounded border border-wa-border px-3 py-1.5 text-sm"
        />
        <button
          onClick={create}
          disabled={creating || !url.trim()}
          className="rounded bg-wa-greenDark px-4 py-1.5 text-xs font-medium text-white hover:bg-wa-green disabled:opacity-50"
        >
          {creating ? "Creating…" : "Create"}
        </button>
      </div>
      {err && <div className="mb-3 rounded bg-red-50 p-2 text-xs text-red-700">{err}</div>}

      {links.length === 0 ? (
        <div className="text-xs text-wa-textMuted">No short links yet.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-wa-border text-left text-wa-textMuted">
                <th className="py-2 pr-2">Short link</th>
                <th className="py-2 pr-2">Destination</th>
                <th className="py-2 pr-2">Label</th>
                <th className="py-2 pr-2 text-right">Clicks</th>
                <th className="py-2 pr-2 text-right">Unique</th>
              </tr>
            </thead>
            <tbody>
              {links.map((l) => {
                const shortUrl = `${base}/r/${l.code}`;
                return (
                  <tr key={l.id} className="border-b border-wa-border/50">
                    <td className="py-2 pr-2">
                      <button
                        onClick={() =>
                          navigator.clipboard.writeText(shortUrl).catch(() => {})
                        }
                        className="text-wa-greenDark hover:underline"
                        title="Click to copy"
                      >
                        /r/{l.code}
                      </button>
                    </td>
                    <td
                      className="py-2 pr-2 max-w-[300px] truncate text-wa-textMuted"
                      title={l.destination_url}
                    >
                      {l.destination_url}
                    </td>
                    <td className="py-2 pr-2">{l.label || "—"}</td>
                    <td className="py-2 pr-2 text-right font-medium">{l.clicks}</td>
                    <td className="py-2 pr-2 text-right">{l.unique_clicks}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

// -------------------------- Webhook health section --------------------------

type WebhookStatus = {
  env: {
    has_phone_id: boolean;
    has_token: boolean;
    has_app_secret: boolean;
    has_verify_token: boolean;
    has_waba_id: boolean;
  };
  health: "healthy" | "stale" | "warning" | "down";
  last_event:
    | {
        id: number;
        received_at: string;
        kind: string;
        signature_ok: number;
        message_count: number;
        status_count: number;
        error: string | null;
      }
    | null;
  last_verify_at: string | null;
  last_signature_failure_at: string | null;
  counts: {
    last_1h: number;
    last_24h: number;
    last_7d: number;
    sig_failures_24h: number;
  };
  recent: Array<{
    id: number;
    received_at: string;
    kind: string;
    signature_ok: number;
    message_count: number;
    status_count: number;
    error: string | null;
  }>;
  public_url: string | null;
};

function timeAgoFromSqlTs(ts: string | null | undefined): string {
  if (!ts) return "never";
  const iso = ts.includes("T") ? ts : ts.replace(" ", "T") + "Z";
  const d = new Date(iso).getTime();
  if (isNaN(d)) return "never";
  const diff = Date.now() - d;
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

function WebhookStatusSection() {
  const [data, setData] = useState<WebhookStatus | null>(null);
  const [showRecent, setShowRecent] = useState(false);

  async function load() {
    const res = await fetch("/api/webhook/status", { cache: "no-store" });
    if (!res.ok) return;
    const j = await res.json();
    setData(j);
  }

  useEffect(() => {
    load();
    const t = setInterval(load, 15_000);
    return () => clearInterval(t);
  }, []);

  if (!data) {
    return (
      <section className="rounded-lg border border-wa-border bg-white p-5">
        <div className="text-sm font-medium">Webhook status</div>
        <div className="mt-2 text-xs text-wa-textMuted">Loading…</div>
      </section>
    );
  }

  const healthStyle: Record<string, string> = {
    healthy: "bg-green-100 text-green-800",
    stale: "bg-amber-100 text-amber-800",
    warning: "bg-red-100 text-red-700",
    down: "bg-red-100 text-red-700",
  };
  const healthLabel: Record<string, string> = {
    healthy: "✓ Healthy",
    stale: "⚠ Stale (no events recently)",
    warning: "⚠ Signature failures detected",
    down: "✕ No events received yet",
  };

  const env = data.env;
  const allEnv =
    env.has_phone_id && env.has_token && env.has_app_secret && env.has_verify_token;

  return (
    <section className="rounded-lg border border-wa-border bg-white p-5">
      <div className="mb-3 flex items-center justify-between">
        <div className="text-sm font-medium">Webhook status</div>
        <span className={`rounded px-2 py-0.5 text-xs ${healthStyle[data.health]}`}>
          {healthLabel[data.health]}
        </span>
      </div>

      {/* Env config */}
      <div className="mb-4 grid grid-cols-2 gap-2 text-xs sm:grid-cols-5">
        <EnvChip label="WABA ID" ok={env.has_waba_id} />
        <EnvChip label="Phone number ID" ok={env.has_phone_id} />
        <EnvChip label="Access token" ok={env.has_token} />
        <EnvChip label="App secret (HMAC)" ok={env.has_app_secret} />
        <EnvChip label="Verify token" ok={env.has_verify_token} />
      </div>
      {!allEnv && (
        <div className="mb-3 rounded bg-amber-50 p-2 text-[11px] text-amber-900">
          One or more env vars are missing. Set them in <code>.env.local</code> (dev) or your
          host&apos;s environment-variable panel (production), then restart the server.
        </div>
      )}

      {/* Counts */}
      <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <CountTile label="Last 1 hour" value={data.counts.last_1h} />
        <CountTile label="Last 24 hours" value={data.counts.last_24h} />
        <CountTile label="Last 7 days" value={data.counts.last_7d} />
        <CountTile
          label="Signature fails (24h)"
          value={data.counts.sig_failures_24h}
          tone={data.counts.sig_failures_24h > 0 ? "red" : "default"}
        />
      </div>

      {/* Last event details */}
      <div className="grid gap-2 text-xs sm:grid-cols-2">
        <Detail label="Last event">
          {data.last_event ? (
            <span>
              {timeAgoFromSqlTs(data.last_event.received_at)} ·{" "}
              <span className="rounded bg-wa-panel px-1 py-0.5 text-[10px]">
                {data.last_event.kind}
              </span>
              {data.last_event.message_count > 0 && (
                <span className="ml-1 text-wa-textMuted">
                  ({data.last_event.message_count} msg)
                </span>
              )}
              {data.last_event.status_count > 0 && (
                <span className="ml-1 text-wa-textMuted">
                  ({data.last_event.status_count} status)
                </span>
              )}
            </span>
          ) : (
            <span className="text-wa-textMuted">No events received yet</span>
          )}
        </Detail>
        <Detail label="Last verify handshake">
          <span className={data.last_verify_at ? "text-green-700" : "text-wa-textMuted"}>
            {timeAgoFromSqlTs(data.last_verify_at)}
          </span>
        </Detail>
        <Detail label="Last signature failure">
          <span
            className={
              data.last_signature_failure_at ? "text-red-700" : "text-wa-textMuted"
            }
          >
            {timeAgoFromSqlTs(data.last_signature_failure_at)}
          </span>
        </Detail>
        <Detail label="Webhook URL (this app)">
          <code className="break-all rounded bg-wa-panel px-1 py-0.5">
            {data.public_url || "—"}
          </code>
        </Detail>
      </div>

      <div className="mt-4 flex items-center gap-2">
        <button
          onClick={load}
          className="rounded border border-wa-border bg-white px-3 py-1 text-xs hover:bg-wa-panel"
        >
          Refresh
        </button>
        <button
          onClick={() => setShowRecent((s) => !s)}
          className="rounded border border-wa-border bg-white px-3 py-1 text-xs hover:bg-wa-panel"
        >
          {showRecent ? "Hide" : "Show"} recent events ({data.recent.length})
        </button>
        <a
          href="https://developers.facebook.com/apps/"
          target="_blank"
          rel="noreferrer"
          className="ml-auto text-xs text-wa-greenDark hover:underline"
        >
          Open Meta App Dashboard ↗
        </a>
      </div>

      {showRecent && (
        <div className="scroll-thin mt-3 max-h-60 overflow-y-auto rounded border border-wa-border">
          <table className="w-full text-[11px]">
            <thead className="bg-wa-panel text-wa-textMuted">
              <tr>
                <th className="px-2 py-1 text-left">When</th>
                <th className="px-2 py-1 text-left">Kind</th>
                <th className="px-2 py-1 text-right">Msg</th>
                <th className="px-2 py-1 text-right">Status</th>
                <th className="px-2 py-1">Sig</th>
                <th className="px-2 py-1 text-left">Error</th>
              </tr>
            </thead>
            <tbody>
              {data.recent.map((e) => (
                <tr key={e.id} className="border-t border-wa-border">
                  <td className="px-2 py-1 text-wa-textMuted">
                    {timeAgoFromSqlTs(e.received_at)}
                  </td>
                  <td className="px-2 py-1">{e.kind}</td>
                  <td className="px-2 py-1 text-right">{e.message_count || ""}</td>
                  <td className="px-2 py-1 text-right">{e.status_count || ""}</td>
                  <td className="px-2 py-1 text-center">
                    {e.signature_ok ? (
                      <span className="text-green-700">✓</span>
                    ) : (
                      <span className="text-red-700">✗</span>
                    )}
                  </td>
                  <td className="px-2 py-1 text-red-700">{e.error || ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-3 text-[10px] text-wa-textMuted">
        Configure this URL in <b>Meta → WhatsApp → Configuration → Callback URL</b> with the same
        verify token. If running on ngrok, the URL changes every restart unless you have a paid
        plan with a fixed subdomain.
      </div>
    </section>
  );
}

function EnvChip({ label, ok }: { label: string; ok: boolean }) {
  return (
    <div
      className={`rounded border px-2 py-1 text-[11px] ${
        ok ? "border-green-200 bg-green-50 text-green-800" : "border-red-200 bg-red-50 text-red-700"
      }`}
    >
      <span className="mr-1">{ok ? "✓" : "✕"}</span>
      {label}
    </div>
  );
}

function CountTile({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: number;
  tone?: "default" | "red";
}) {
  return (
    <div className="rounded border border-wa-border bg-white p-3">
      <div className="text-[10px] uppercase tracking-wide text-wa-textMuted">{label}</div>
      <div
        className={`text-xl font-semibold ${tone === "red" ? "text-red-600" : "text-wa-text"}`}
      >
        {value.toLocaleString()}
      </div>
    </div>
  );
}

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-wa-textMuted">{label}</div>
      <div className="mt-0.5">{children}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Ad → Agent routing
// Match Click-to-WhatsApp ads (Meta sends `referral.source_id` on the first
// inbound) to a specific agent. The webhook auto-assigns the contact on
// first-touch, never overwriting a manual assignment.

type AdRoutingRule = {
  id: string;
  source_id: string;
  user_id: number;
  label: string | null;
};

type AgentOption = { id: number; name: string; email: string };
type RecentAd = { source_id: string; headline: string | null; count: number };

function AdRoutingSection() {
  const [rules, setRules] = useState<AdRoutingRule[]>([]);
  const [agents, setAgents] = useState<AgentOption[]>([]);
  const [recent, setRecent] = useState<RecentAd[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState("");
  const [err, setErr] = useState("");

  // Add-rule form
  const [sourceId, setSourceId] = useState("");
  const [label, setLabel] = useState("");
  const [userId, setUserId] = useState<number | "">("");

  async function load() {
    setLoading(true);
    try {
      const [r1, r2] = await Promise.all([
        fetch("/api/settings/ad-routing", { cache: "no-store" }).then((r) => r.json()),
        fetch("/api/settings/ad-routing/recent", { cache: "no-store" }).then((r) => r.json()),
      ]);
      setRules(Array.isArray(r1.rules) ? r1.rules : []);
      setAgents(Array.isArray(r1.users) ? r1.users : []);
      setRecent(Array.isArray(r2.ads) ? r2.ads : []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function save(next: AdRoutingRule[]) {
    setSaving(true);
    setSavedMsg("");
    setErr("");
    try {
      const res = await fetch("/api/settings/ad-routing", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rules: next }),
      });
      const j = await res.json();
      if (!res.ok) {
        setErr(j.error || "Save failed");
        return false;
      }
      setRules(Array.isArray(j.rules) ? j.rules : []);
      setSavedMsg("Saved");
      setTimeout(() => setSavedMsg(""), 1500);
      return true;
    } finally {
      setSaving(false);
    }
  }

  async function addRule() {
    setErr("");
    const sid = sourceId.trim();
    if (!sid) {
      setErr("Pick or paste an ad ID first.");
      return;
    }
    if (!userId || typeof userId !== "number") {
      setErr("Pick an agent.");
      return;
    }
    if (rules.some((r) => r.source_id === sid)) {
      setErr("A rule for this ad already exists — remove it first to change the agent.");
      return;
    }
    const next: AdRoutingRule[] = [
      ...rules,
      {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        source_id: sid,
        user_id: userId,
        label: label.trim() || null,
      },
    ];
    const ok = await save(next);
    if (ok) {
      setSourceId("");
      setLabel("");
      setUserId("");
    }
  }

  async function removeRule(id: string) {
    if (!confirm("Remove this routing rule?")) return;
    await save(rules.filter((r) => r.id !== id));
  }

  function agentName(uid: number): string {
    return agents.find((a) => a.id === uid)?.name || `User #${uid}`;
  }

  function adLabel(sid: string): string {
    const m = recent.find((a) => a.source_id === sid);
    if (m?.headline) return m.headline;
    return sid;
  }

  // Recent ads not yet covered by a rule.
  const ruledIds = new Set(rules.map((r) => r.source_id));
  const suggestable = recent.filter((a) => !ruledIds.has(a.source_id));

  return (
    <section className="rounded-lg border border-wa-border bg-white p-5">
      <div className="mb-1 text-sm font-medium">Ad → Agent routing</div>
      <div className="mb-4 text-xs text-wa-textMuted">
        When a customer messages you by clicking a Click-to-WhatsApp ad, auto-assign their
        chat to a specific agent. Only applies on the first inbound from that ad — manual
        re-assignments are never overwritten.
      </div>

      {loading ? (
        <div className="text-xs text-wa-textMuted">Loading…</div>
      ) : (
        <>
          {/* Existing rules */}
          {rules.length === 0 ? (
            <div className="mb-4 rounded border border-dashed border-wa-border p-3 text-xs text-wa-textMuted">
              No routing rules yet. Add one below.
            </div>
          ) : (
            <div className="mb-4 overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-wa-border text-left text-wa-textMuted">
                    <th className="py-2 pr-2">Ad</th>
                    <th className="py-2 pr-2">Label</th>
                    <th className="py-2 pr-2">Assign to</th>
                    <th className="py-2 pr-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {rules.map((r) => (
                    <tr key={r.id} className="border-b border-wa-border/50">
                      <td
                        className="py-2 pr-2 max-w-[260px] truncate"
                        title={`source_id: ${r.source_id}`}
                      >
                        {adLabel(r.source_id)}
                        <div className="text-[10px] text-wa-textMuted">{r.source_id}</div>
                      </td>
                      <td className="py-2 pr-2 text-wa-textMuted">{r.label || "—"}</td>
                      <td className="py-2 pr-2">{agentName(r.user_id)}</td>
                      <td className="py-2 pr-2 text-right">
                        <button
                          onClick={() => removeRule(r.id)}
                          disabled={saving}
                          className="text-xs text-red-600 hover:underline disabled:opacity-50"
                        >
                          Remove
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Add new rule */}
          <div className="rounded border border-wa-border bg-wa-panel/30 p-3">
            <div className="mb-2 text-xs font-medium">Add a rule</div>
            <div className="grid gap-2 md:grid-cols-[1fr_1fr_180px_auto]">
              <div>
                <label className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-wa-textMuted">
                  Ad
                </label>
                {suggestable.length > 0 ? (
                  <select
                    value={sourceId}
                    onChange={(e) => setSourceId(e.target.value)}
                    className="w-full rounded border border-wa-border bg-white px-2 py-1.5 text-xs"
                  >
                    <option value="">— Pick a recent ad or paste below —</option>
                    {suggestable.map((a) => (
                      <option key={a.source_id} value={a.source_id}>
                        {(a.headline || a.source_id) +
                          ` (${a.count} contact${a.count === 1 ? "" : "s"})`}
                      </option>
                    ))}
                  </select>
                ) : null}
                <input
                  value={sourceId}
                  onChange={(e) => setSourceId(e.target.value)}
                  placeholder="Or paste Meta ad source_id"
                  className="mt-1 w-full rounded border border-wa-border px-2 py-1.5 text-xs"
                />
              </div>
              <div>
                <label className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-wa-textMuted">
                  Label (optional)
                </label>
                <input
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  placeholder="e.g. Diwali RO offer"
                  className="w-full rounded border border-wa-border px-2 py-1.5 text-xs"
                />
              </div>
              <div>
                <label className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-wa-textMuted">
                  Assign to
                </label>
                <select
                  value={userId}
                  onChange={(e) =>
                    setUserId(e.target.value ? Number(e.target.value) : "")
                  }
                  className="w-full rounded border border-wa-border bg-white px-2 py-1.5 text-xs"
                >
                  <option value="">— Pick agent —</option>
                  {agents.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex items-end">
                <button
                  onClick={addRule}
                  disabled={saving}
                  className="w-full rounded bg-wa-greenDark px-4 py-1.5 text-xs font-medium text-white hover:bg-wa-green disabled:opacity-50 md:w-auto"
                >
                  {saving ? "…" : "Add rule"}
                </button>
              </div>
            </div>
            {err && (
              <div className="mt-2 rounded bg-red-50 p-2 text-[11px] text-red-700">{err}</div>
            )}
            {savedMsg && (
              <div className="mt-2 text-[11px] text-wa-textMuted">{savedMsg}</div>
            )}
            <div className="mt-2 text-[10px] text-wa-textMuted">
              Don&apos;t see your ad in the dropdown? You&apos;ll see it after at least one
              customer has clicked it and messaged you. Until then, paste the Meta ad ID
              directly.
            </div>
          </div>
        </>
      )}
    </section>
  );
}


// ---------------------------------------------------------------------------
// Phase 13: Saved / tracked QR sources (per-product, per-technician, generic).
// Each row generates a wa.me link that includes a [CODE] marker. When the
// customer sends the prefilled message, the webhook detects the code and
// auto-applies the tag + assignment.

type QrSource = {
  id: number;
  label: string;
  kind: "product" | "technician" | "generic";
  short_code: string;
  prefill_text: string;
  auto_tag: string | null;
  auto_assign_user_id: number | null;
  product_id: number | null;
  assignee_name: string | null;
  product_name: string | null;
  scan_count: number;
  last_scanned_at: string | null;
};

type ProductLite = { id: number; name: string };

function TrackedQrSourcesSection({ currentUser }: { currentUser: CurrentUser }) {
  const [sources, setSources] = useState<QrSource[]>([]);
  const [team, setTeam] = useState<TeamUser[]>([]);
  const [products, setProducts] = useState<ProductLite[]>([]);
  const [phone, setPhone] = useState("");
  const [editing, setEditing] = useState<Partial<QrSource> | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    const r = await fetch("/api/qr-sources", { cache: "no-store" });
    if (r.ok) {
      const j = await r.json();
      setSources(j.sources || []);
    }
  }
  async function loadTeam() {
    const r = await fetch("/api/users", { cache: "no-store" });
    if (r.ok) {
      const j = await r.json();
      setTeam(j.users || []);
    }
  }
  async function loadProducts() {
    const r = await fetch("/api/products", { cache: "no-store" });
    if (r.ok) {
      const j = await r.json();
      setProducts((j.products || []).map((p: any) => ({ id: p.id, name: p.name })));
    }
  }

  useEffect(() => {
    load();
    loadTeam();
    loadProducts();
  }, []);

  function startNew(kind: QrSource["kind"]) {
    const defaults: Record<QrSource["kind"], { label: string; prefill: string; tag: string | null }> = {
      product: {
        label: "Product enquiry",
        prefill: "Hi, I'm interested in this product.",
        tag: "product-enquiry",
      },
      technician: {
        label: `${currentUser.name}'s field card`,
        prefill: `Hi, I met ${currentUser.name} today.`,
        tag: "field-lead",
      },
      generic: {
        label: "General enquiry",
        prefill: "Hi, please tell me more.",
        tag: null,
      },
    };
    setEditing({
      kind,
      label: defaults[kind].label,
      prefill_text: defaults[kind].prefill,
      auto_tag: defaults[kind].tag,
      auto_assign_user_id: kind === "technician" ? currentUser.id : null,
    });
  }

  async function save() {
    if (!editing) return;
    setBusy(true);
    try {
      const url = editing.id ? `/api/qr-sources/${editing.id}` : "/api/qr-sources";
      const method = editing.id ? "PATCH" : "POST";
      const r = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          label: editing.label,
          kind: editing.kind,
          prefill_text: editing.prefill_text,
          auto_tag: editing.auto_tag || null,
          auto_assign_user_id: editing.auto_assign_user_id || null,
          product_id: editing.product_id || null,
        }),
      });
      if (r.ok) {
        setEditing(null);
        load();
      }
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: number) {
    if (!confirm("Delete this QR source? The codes printed on materials will stop tracking.")) return;
    await fetch(`/api/qr-sources/${id}`, { method: "DELETE" });
    load();
  }

  function linkFor(src: QrSource): string {
    const digits = phone.replace(/[^0-9]/g, "");
    const msg = `${src.prefill_text} [${src.short_code}]`;
    return digits.length >= 8
      ? `https://wa.me/${digits}?text=${encodeURIComponent(msg)}`
      : `wa.me/<your-number>?text=${encodeURIComponent(msg)}`;
  }

  function qrUrl(src: QrSource): string {
    return `https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(linkFor(src))}`;
  }

  return (
    <section className="rounded-lg border border-wa-border bg-white p-5">
      <div className="mb-1 text-sm font-medium">Tracked QR codes (per product / technician)</div>
      <div className="mb-4 text-xs text-wa-textMuted">
        Generate QRs that auto-tag and auto-assign incoming chats. Each prefilled
        message contains a hidden code like <code>[A1B2C]</code> so we can attribute
        the lead even if the customer edits the message.
      </div>

      <div className="mb-4">
        <label className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-wa-textMuted">
          Your WhatsApp number (with country code, no +) — used by every QR below
        </label>
        <input
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="919876543210"
          className="w-full max-w-xs rounded border border-wa-border px-3 py-2 text-sm"
        />
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        <button
          onClick={() => startNew("product")}
          className="rounded bg-wa-greenDark px-3 py-1.5 text-xs font-medium text-white hover:bg-wa-green"
        >
          + Product QR
        </button>
        <button
          onClick={() => startNew("technician")}
          className="rounded border border-wa-border bg-white px-3 py-1.5 text-xs hover:bg-wa-panel"
        >
          + Field / technician QR
        </button>
        <button
          onClick={() => startNew("generic")}
          className="rounded border border-wa-border bg-white px-3 py-1.5 text-xs hover:bg-wa-panel"
        >
          + Generic QR
        </button>
      </div>

      {sources.length === 0 && (
        <div className="rounded border border-dashed border-wa-border p-6 text-center text-xs text-wa-textMuted">
          No tracked QR codes yet. Create one above.
        </div>
      )}

      <div className="space-y-3">
        {sources.map((s) => (
          <div key={s.id} className="flex flex-wrap items-start gap-4 rounded border border-wa-border p-3">
            <img
              src={qrUrl(s)}
              alt={`QR ${s.short_code}`}
              width={120}
              height={120}
              className="flex-none rounded border border-wa-border bg-white p-1"
            />
            <div className="min-w-0 flex-1">
              <div className="mb-1 flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium">{s.label}</span>
                <span className="rounded bg-wa-panel px-1.5 py-0.5 text-[10px] text-wa-textMuted">
                  {s.kind}
                </span>
                <code className="rounded bg-wa-bubbleOut px-1.5 py-0.5 text-[10px] text-green-900">
                  [{s.short_code}]
                </code>
                <span className="text-[10px] text-wa-textMuted">
                  {s.scan_count} scan{s.scan_count === 1 ? "" : "s"}
                </span>
              </div>
              <div className="mb-1 line-clamp-2 text-xs text-wa-textMuted">{s.prefill_text}</div>
              <div className="mb-2 flex flex-wrap gap-1 text-[10px] text-wa-textMuted">
                {s.auto_tag && <span className="rounded bg-wa-panel px-1.5 py-0.5">#{s.auto_tag}</span>}
                {s.assignee_name && (
                  <span className="rounded bg-wa-panel px-1.5 py-0.5">→ {s.assignee_name}</span>
                )}
                {s.product_name && (
                  <span className="rounded bg-wa-panel px-1.5 py-0.5">📦 {s.product_name}</span>
                )}
              </div>
              <div className="flex flex-wrap gap-2 text-[11px]">
                <a
                  href={qrUrl(s)}
                  download={`qr-${s.short_code}.png`}
                  className="text-wa-greenDark hover:underline"
                >
                  ⬇ Download QR
                </a>
                <button
                  onClick={() => navigator.clipboard.writeText(linkFor(s))}
                  className="text-wa-greenDark hover:underline"
                >
                  📋 Copy link
                </button>
                <button onClick={() => setEditing(s)} className="text-wa-textMuted hover:underline">
                  Edit
                </button>
                <button
                  onClick={() => remove(s.id)}
                  className="text-red-600 hover:underline"
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {editing && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
          onClick={() => setEditing(null)}
        >
          <div
            className="w-full max-w-md rounded-lg bg-white p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 text-base font-medium">
              {editing.id ? "Edit QR source" : `New ${editing.kind} QR`}
            </div>
            <div className="space-y-3">
              <input
                value={editing.label || ""}
                onChange={(e) => setEditing({ ...editing, label: e.target.value })}
                placeholder="Label (e.g. RO Purifier ad — Pune)"
                className="w-full rounded border border-wa-border px-3 py-2 text-sm"
              />
              <textarea
                value={editing.prefill_text || ""}
                onChange={(e) => setEditing({ ...editing, prefill_text: e.target.value })}
                rows={3}
                placeholder="Prefilled message"
                className="w-full rounded border border-wa-border px-3 py-2 text-sm"
              />
              <input
                value={editing.auto_tag || ""}
                onChange={(e) => setEditing({ ...editing, auto_tag: e.target.value })}
                placeholder="Auto-tag (optional, e.g. field-lead-ramesh)"
                className="w-full rounded border border-wa-border px-3 py-2 text-sm"
              />
              <select
                value={editing.auto_assign_user_id || ""}
                onChange={(e) =>
                  setEditing({
                    ...editing,
                    auto_assign_user_id: e.target.value ? Number(e.target.value) : null,
                  })
                }
                className="w-full rounded border border-wa-border bg-white px-3 py-2 text-sm"
              >
                <option value="">— don't auto-assign —</option>
                {team
                  .filter((t) => t.active)
                  .map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
              </select>
              {editing.kind === "product" && (
                <select
                  value={editing.product_id || ""}
                  onChange={(e) =>
                    setEditing({
                      ...editing,
                      product_id: e.target.value ? Number(e.target.value) : null,
                    })
                  }
                  className="w-full rounded border border-wa-border bg-white px-3 py-2 text-sm"
                >
                  <option value="">— link to product (optional) —</option>
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              )}
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => setEditing(null)}
                className="rounded px-3 py-1.5 text-xs text-wa-textMuted hover:bg-wa-panel"
              >
                Cancel
              </button>
              <button
                onClick={save}
                disabled={busy || !editing.label?.trim() || !editing.prefill_text?.trim()}
                className="rounded bg-wa-greenDark px-3 py-1.5 text-xs font-medium text-white hover:bg-wa-green disabled:opacity-50"
              >
                {busy ? "…" : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Phase 13: Browser push notifications.
//
// Renders a subscribe/unsubscribe toggle. Permission flow:
//   1. User clicks Enable → Notification.requestPermission()
//   2. If granted → ServiceWorkerRegistration.pushManager.subscribe(...)
//   3. POST the resulting subscription JSON to /api/push/subscribe.
//
// We store the endpoint in localStorage so the UI knows the current state
// across reloads (until the user clears site data).

function PushNotificationsSection() {
  const [supported, setSupported] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission>("default");
  const [subscribed, setSubscribed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [info, setInfo] = useState<string | null>(null);

  useEffect(() => {
    const ok =
      typeof window !== "undefined" &&
      "serviceWorker" in navigator &&
      "PushManager" in window;
    setSupported(ok);
    if (ok && typeof Notification !== "undefined") setPermission(Notification.permission);
    if (ok) {
      navigator.serviceWorker.ready.then(async (reg) => {
        const sub = await reg.pushManager.getSubscription();
        setSubscribed(!!sub);
      });
    }
  }, []);

  function urlBase64ToUint8Array(b64: string) {
    const padding = "=".repeat((4 - (b64.length % 4)) % 4);
    const base64 = (b64 + padding).replace(/-/g, "+").replace(/_/g, "/");
    const raw = atob(base64);
    const out = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
    return out;
  }

  async function enable() {
    setBusy(true);
    setInfo(null);
    try {
      const perm = await Notification.requestPermission();
      setPermission(perm);
      if (perm !== "granted") {
        setInfo("Notifications were blocked. Enable them in your browser settings.");
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      if (!pub) {
        setInfo("VAPID public key missing from server env. Restart the dev server.");
        return;
      }
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(pub),
      });
      const res = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subscription: sub.toJSON() }),
      });
      if (res.ok) {
        setSubscribed(true);
        setInfo("Enabled. We'll ping this browser on every new inbound.");
      }
    } catch (e: any) {
      setInfo(`Failed: ${e?.message || e}`);
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    setInfo(null);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await fetch("/api/push/subscribe", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        });
        await sub.unsubscribe();
      }
      setSubscribed(false);
      setInfo("Disabled. You won't get push notifications on this browser anymore.");
    } finally {
      setBusy(false);
    }
  }

  async function sendTest() {
    setBusy(true);
    try {
      const r = await fetch("/api/push/test", { method: "POST" });
      const j = await r.json();
      setInfo(
        r.ok ? `Test sent (${j.sent} delivered, ${j.pruned} dead subs pruned).` : `Failed: ${j.error}`,
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-lg border border-wa-border bg-white p-5">
      <div className="mb-1 text-sm font-medium">Browser push notifications</div>
      <div className="mb-4 text-xs text-wa-textMuted">
        Get a desktop / mobile notification every time a customer messages you,
        even when the app tab is in the background. Subscribe per device — your
        laptop, your phone, your office desktop each opt in separately.
      </div>

      {!supported && (
        <div className="rounded bg-amber-50 p-2 text-xs text-amber-800">
          This browser doesn&apos;t support web push. Try Chrome, Edge, or Firefox.
        </div>
      )}

      {supported && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-xs">
            <span className="text-wa-textMuted">Permission:</span>
            <span className="rounded bg-wa-panel px-2 py-0.5 font-medium">{permission}</span>
            <span className="text-wa-textMuted">·</span>
            <span className="text-wa-textMuted">Subscribed:</span>
            <span className={`rounded px-2 py-0.5 font-medium ${subscribed ? "bg-green-100 text-green-800" : "bg-wa-panel"}`}>
              {subscribed ? "yes" : "no"}
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            {!subscribed ? (
              <button
                onClick={enable}
                disabled={busy}
                className="rounded bg-wa-greenDark px-3 py-1.5 text-xs font-medium text-white hover:bg-wa-green disabled:opacity-50"
              >
                {busy ? "…" : "🔔 Enable notifications on this browser"}
              </button>
            ) : (
              <>
                <button
                  onClick={sendTest}
                  disabled={busy}
                  className="rounded bg-wa-greenDark px-3 py-1.5 text-xs font-medium text-white hover:bg-wa-green disabled:opacity-50"
                >
                  Send test ping
                </button>
                <button
                  onClick={disable}
                  disabled={busy}
                  className="rounded border border-wa-border bg-white px-3 py-1.5 text-xs hover:bg-wa-panel disabled:opacity-50"
                >
                  Disable on this browser
                </button>
              </>
            )}
          </div>
          {info && <div className="rounded bg-wa-panel px-3 py-2 text-xs text-wa-text">{info}</div>}
        </div>
      )}
    </section>
  );
}
