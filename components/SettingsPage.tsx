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
        {/* Click-tracking short links */}
        <ShortLinksSection />
        {/* QR code / wa.me link generator */}
        <QrGeneratorSection />
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
