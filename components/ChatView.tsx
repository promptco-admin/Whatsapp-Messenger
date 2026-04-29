"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { MessageBubble, type MessageRow } from "./MessageBubble";
import { TemplatePicker } from "./TemplatePicker";
import { QuickReplyManager, type QuickReply } from "./QuickReplyManager";
import { FollowupDialog } from "./FollowupDialog";
import { displayContactName, displayPhone, parseContactSource } from "@/lib/display";
import type { CurrentUser } from "@/lib/useCurrentUser";

type Contact = {
  id: number;
  wa_id: string;
  name: string | null;
  wa_profile_name: string | null;
  last_inbound_at: string | null;
  assigned_user_id: number | null;
  source_json: string | null;
};

type TeamUser = { id: number; name: string; role: string };

type Note = {
  id: number;
  body: string;
  created_at: string;
  author_name: string;
  user_id: number;
};

type ActivityEvent = {
  id: number;
  user_id: number | null;
  user_name: string | null;
  user_role: string | null;
  action: string;
  summary: string | null;
  created_at: string;
};

function withinWindow(lastInboundAt: string | null): boolean {
  if (!lastInboundAt) return false;
  const s = lastInboundAt.includes("T") ? lastInboundAt : lastInboundAt.replace(" ", "T") + "Z";
  const d = new Date(s).getTime();
  if (isNaN(d)) return false;
  return Date.now() - d < 24 * 60 * 60 * 1000;
}

function timeAgo(iso: string): string {
  const s = iso.includes("T") ? iso : iso.replace(" ", "T") + "Z";
  const diff = Date.now() - new Date(s).getTime();
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

export function ChatView({
  contactId,
  onMessageSent,
  currentUser,
  onBack,
}: {
  contactId: number | null;
  onMessageSent: () => void;
  currentUser: CurrentUser | null;
  /** Mobile-only: tap-to-go-back arrow on the chat header. Hidden on desktop. */
  onBack?: () => void;
}) {
  const [contact, setContact] = useState<Contact | null>(null);
  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const [quickReplies, setQuickReplies] = useState<QuickReply[]>([]);
  const [showQRManager, setShowQRManager] = useState(false);
  const [qrMenuOpen, setQrMenuOpen] = useState(false);
  const [qrFilter, setQrFilter] = useState("");
  const [qrIndex, setQrIndex] = useState(0);
  const [team, setTeam] = useState<TeamUser[]>([]);
  const [notesOpen, setNotesOpen] = useState(false);
  const [notes, setNotes] = useState<Note[]>([]);
  const [activityOpen, setActivityOpen] = useState(false);
  const [activity, setActivity] = useState<ActivityEvent[]>([]);
  const [followupOpen, setFollowupOpen] = useState(false);
  const [newNote, setNewNote] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function load() {
    if (!contactId) return;
    const res = await fetch(`/api/conversations/${contactId}/messages`);
    if (!res.ok) return;
    const j = await res.json();
    setContact(j.contact);
    setMessages(j.messages);
  }

  async function loadQuickReplies() {
    const res = await fetch("/api/quick-replies", { cache: "no-store" });
    if (!res.ok) return;
    const j = await res.json();
    setQuickReplies(j.quick_replies || []);
  }

  async function loadTeam() {
    const res = await fetch("/api/users", { cache: "no-store" });
    if (!res.ok) return;
    const j = await res.json();
    setTeam(j.users || []);
  }

  async function loadNotes() {
    if (!contactId) return;
    const res = await fetch(`/api/contacts/${contactId}/notes`, { cache: "no-store" });
    if (!res.ok) return;
    const j = await res.json();
    setNotes(j.notes || []);
  }

  async function loadActivity() {
    if (!contactId) return;
    const res = await fetch(
      `/api/logs/activity?contact_id=${contactId}&limit=200`,
      { cache: "no-store" },
    );
    if (!res.ok) return;
    const j = await res.json();
    setActivity(j.activity || []);
  }

  useEffect(() => {
    load();
    loadNotes();
    if (activityOpen) loadActivity();
  }, [contactId]);

  useEffect(() => {
    if (activityOpen) loadActivity();
  }, [activityOpen, contactId]);

  useEffect(() => {
    loadQuickReplies();
    loadTeam();
  }, []);

  useEffect(() => {
    if (!contactId) return;
    const i = setInterval(load, 4000);
    return () => clearInterval(i);
  }, [contactId]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length]);

  useEffect(() => {
    if (text.startsWith("/") && !text.includes(" ") && !text.includes("\n")) {
      setQrMenuOpen(true);
      setQrFilter(text.slice(1).toLowerCase());
      setQrIndex(0);
    } else {
      setQrMenuOpen(false);
    }
  }, [text]);

  const filteredQR = useMemo(() => {
    if (!qrFilter) return quickReplies.slice(0, 8);
    return quickReplies
      .filter((qr) => {
        const s = (qr.shortcut || "").toLowerCase();
        const t = qr.title.toLowerCase();
        return s.includes(qrFilter) || t.includes(qrFilter);
      })
      .slice(0, 8);
  }, [quickReplies, qrFilter]);

  function applyQuickReply(qr: QuickReply) {
    setText(qr.body);
    setQrMenuOpen(false);
    setTimeout(() => inputRef.current?.focus(), 0);
  }

  async function handleAssign(userId: number | null) {
    if (!contactId) return;
    await fetch(`/api/contacts/${contactId}/assign`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: userId }),
    });
    await load();
    onMessageSent(); // refresh list to show new assignment label
  }

  async function addNote() {
    if (!contactId || !newNote.trim()) return;
    await fetch(`/api/contacts/${contactId}/notes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body: newNote.trim() }),
    });
    setNewNote("");
    loadNotes();
  }

  async function deleteNote(id: number) {
    if (!contactId) return;
    await fetch(`/api/contacts/${contactId}/notes/${id}`, { method: "DELETE" });
    loadNotes();
  }

  if (!contactId) {
    return (
      <div className="chat-bg flex h-full flex-1 items-center justify-center">
        <div className="max-w-md p-8 text-center">
          <div className="mb-2 text-2xl font-light text-wa-text">WhatsApp Business Messenger</div>
          <div className="text-sm text-wa-textMuted">
            Select a conversation on the left, or start a new chat to send a message or template to
            your customers.
          </div>
        </div>
      </div>
    );
  }

  const display = contact ? displayContactName(contact, currentUser) : "";
  const phoneDisplay = contact?.wa_id ? displayPhone(contact.wa_id, currentUser) : "";
  // If the agent has a manual name AND the WhatsApp profile name differs, surface it as context.
  const waProfileName =
    contact?.wa_profile_name &&
    contact.name &&
    contact.wa_profile_name.trim() !== contact.name.trim()
      ? contact.wa_profile_name.trim()
      : null;
  const canFreeForm = withinWindow(contact?.last_inbound_at ?? null);
  const source = parseContactSource(contact?.source_json ?? null);

  async function handleSendText() {
    if (!contact) return;
    const body = text.trim();
    if (!body) return;
    setSending(true);
    try {
      const res = await fetch("/api/messages/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wa_id: contact.wa_id, kind: "text", text: body }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        alert(`Send failed: ${j.error || res.statusText}`);
      } else {
        setText("");
      }
      await load();
      onMessageSent();
    } finally {
      setSending(false);
    }
  }

  async function handleSendTemplate(args: {
    template_name: string;
    language: string;
    variables: string[];
    rendered_body: string;
    header?: { type: "image" | "video" | "document"; media_id?: string; link?: string; filename?: string };
    buttons?: Array<{
      index: number;
      sub_type: "flow" | "url" | "quick_reply" | "copy_code";
      flow_token?: string;
      payload?: string;
      text?: string;
    }>;
  }) {
    if (!contact) return;
    const res = await fetch("/api/messages/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ wa_id: contact.wa_id, kind: "template", ...args }),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      alert(`Send failed: ${j.error || res.statusText}`);
    }
    await load();
    onMessageSent();
  }

  return (
    <div className="relative flex h-full flex-1 flex-row">
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-wa-border bg-wa-panel px-3 py-2 md:px-4 md:py-3">
          <div className="flex min-w-0 flex-1 items-center gap-2 md:gap-3">
            {onBack && (
              <button
                onClick={onBack}
                aria-label="Back to chat list"
                className="flex h-9 w-9 flex-none items-center justify-center rounded-full text-wa-text hover:bg-wa-panelDark md:hidden"
              >
                <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M15.7 5.3a1 1 0 0 1 0 1.4L10.4 12l5.3 5.3a1 1 0 0 1-1.4 1.4l-6-6a1 1 0 0 1 0-1.4l6-6a1 1 0 0 1 1.4 0z" />
                </svg>
              </button>
            )}
            <div className="flex h-9 w-9 flex-none items-center justify-center rounded-full bg-gradient-to-br from-wa-green to-wa-greenDark text-sm font-semibold text-white md:h-10 md:w-10">
              {display.slice(0, 2).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium text-wa-text">{display}</div>
              <div className="truncate text-[11px] text-wa-textMuted">
                {phoneDisplay}
                {waProfileName && (
                  <span
                    className="ml-2 hidden rounded bg-wa-panelDark px-1.5 py-0.5 text-[10px] text-wa-textMuted sm:inline"
                    title="Name on the customer's WhatsApp profile"
                  >
                    WA: {waProfileName}
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={contact?.assigned_user_id ?? ""}
              onChange={(e) =>
                handleAssign(e.target.value === "" ? null : Number(e.target.value))
              }
              className="rounded border border-wa-border bg-white px-2 py-1 text-xs"
              title="Assign this conversation"
            >
              <option value="">Unassigned</option>
              {team.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                  {currentUser && t.id === currentUser.id ? " (me)" : ""}
                </option>
              ))}
            </select>
            <button
              onClick={() => {
                setNotesOpen((o) => !o);
                if (activityOpen) setActivityOpen(false);
              }}
              className={`rounded border px-2 py-1 text-xs ${
                notesOpen
                  ? "border-wa-greenDark bg-wa-greenDark text-white"
                  : "border-wa-border bg-white"
              }`}
              title="Internal notes"
            >
              Notes{notes.length > 0 ? ` (${notes.length})` : ""}
            </button>
            <button
              onClick={() => {
                setActivityOpen((o) => !o);
                if (notesOpen) setNotesOpen(false);
              }}
              className={`rounded border px-2 py-1 text-xs ${
                activityOpen
                  ? "border-wa-greenDark bg-wa-greenDark text-white"
                  : "border-wa-border bg-white"
              }`}
              title="Activity timeline for this contact"
            >
              Activity
            </button>
            <button
              onClick={() => setFollowupOpen(true)}
              className="rounded border border-wa-border bg-white px-2 py-1 text-xs hover:bg-wa-panel"
              title="Add a follow-up task for this contact"
            >
              + Follow-up
            </button>
            <div className="text-[11px] text-wa-textMuted">
              {canFreeForm ? (
                <span className="rounded-full bg-green-100 px-2 py-1 text-green-800">
                  24h open
                </span>
              ) : (
                <span className="rounded-full bg-amber-100 px-2 py-1 text-amber-800">
                  Template only
                </span>
              )}
            </div>
          </div>
        </div>

        {source && (
          <div className="flex items-start gap-2 border-b border-amber-200 bg-amber-50 px-4 py-2 text-xs">
            <span className="flex-none text-base leading-none">📣</span>
            <div className="min-w-0 flex-1 text-amber-900">
              <div>
                <b>From ad</b>
                {source.headline ? (
                  <>
                    : <span className="font-medium">{source.headline}</span>
                  </>
                ) : null}
                {source.source_id && (
                  <span className="ml-1 text-amber-700">· {source.source_id}</span>
                )}
              </div>
              {source.body && (
                <div className="mt-0.5 line-clamp-2 text-amber-800/90">{source.body}</div>
              )}
              {source.source_url && (
                <a
                  href={source.source_url}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-0.5 inline-block text-amber-700 underline hover:text-amber-900"
                >
                  View ad ↗
                </a>
              )}
            </div>
            {source.thumbnail_url && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={source.thumbnail_url}
                alt=""
                className="h-10 w-10 flex-none rounded object-cover"
              />
            )}
          </div>
        )}

        <div ref={scrollRef} className="chat-bg scroll-thin flex-1 space-y-2 overflow-y-auto px-6 py-4">
          {messages.length === 0 && (
            <div className="mt-10 text-center text-sm text-wa-textMuted">
              No messages yet. Send a template to start the conversation.
            </div>
          )}
          {messages.map((m) => (
            <MessageBubble key={m.id} msg={m} onAnnotated={load} />
          ))}
        </div>

        <div className="relative border-t border-wa-border bg-wa-panel">
          {qrMenuOpen && filteredQR.length > 0 && (
            <div className="absolute bottom-full left-0 right-0 z-10 mb-1 max-h-64 overflow-y-auto rounded-t-lg border border-wa-border bg-white shadow-lg">
              <div className="border-b border-wa-border bg-wa-panel px-3 py-1.5 text-[10px] font-medium uppercase tracking-wide text-wa-textMuted">
                Quick replies · ↑↓ to pick · Enter/Tab to insert · Esc to close
              </div>
              {filteredQR.map((qr, i) => (
                <button
                  key={qr.id}
                  onMouseEnter={() => setQrIndex(i)}
                  onClick={() => applyQuickReply(qr)}
                  className={`block w-full px-3 py-2 text-left hover:bg-wa-panel ${
                    i === qrIndex ? "bg-wa-panel" : ""
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-medium">{qr.title}</div>
                    {qr.shortcut && (
                      <code className="rounded bg-wa-bubbleOut px-1.5 py-0.5 text-[10px] text-green-900">
                        /{qr.shortcut}
                      </code>
                    )}
                  </div>
                  <div className="truncate text-xs text-wa-textMuted">{qr.body}</div>
                </button>
              ))}
            </div>
          )}

          <div className="flex items-center gap-2 px-4 py-3">
            <button
              onClick={() => setShowTemplates(true)}
              className="rounded-full bg-wa-greenDark px-3 py-2 text-xs font-medium text-white hover:bg-wa-green"
              title="Send an approved template"
            >
              Templates
            </button>
            <button
              onClick={() => setShowQRManager(true)}
              className="rounded-full bg-white px-3 py-2 text-xs font-medium text-wa-text hover:bg-wa-panelDark"
              title="Manage quick replies"
            >
              Quick replies
            </button>
            <input
              ref={inputRef}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (qrMenuOpen && filteredQR.length > 0) {
                  if (e.key === "ArrowDown") {
                    e.preventDefault();
                    setQrIndex((i) => Math.min(i + 1, filteredQR.length - 1));
                    return;
                  }
                  if (e.key === "ArrowUp") {
                    e.preventDefault();
                    setQrIndex((i) => Math.max(i - 1, 0));
                    return;
                  }
                  if (e.key === "Enter" || e.key === "Tab") {
                    e.preventDefault();
                    applyQuickReply(filteredQR[qrIndex]);
                    return;
                  }
                  if (e.key === "Escape") {
                    e.preventDefault();
                    setQrMenuOpen(false);
                    return;
                  }
                }
                if (e.key === "Enter" && !e.shiftKey && canFreeForm) {
                  e.preventDefault();
                  handleSendText();
                }
              }}
              disabled={!canFreeForm || sending}
              placeholder={
                canFreeForm
                  ? "Type a message  (try / for a quick reply)"
                  : "Free-form replies require a customer message within the last 24h — send a template instead"
              }
              className="flex-1 rounded-full bg-white px-4 py-2 text-sm outline-none disabled:cursor-not-allowed disabled:bg-wa-panelDark disabled:text-wa-textMuted"
            />
            <button
              onClick={handleSendText}
              disabled={!canFreeForm || sending || !text.trim()}
              className="rounded-full bg-wa-greenDark px-4 py-2 text-sm font-medium text-white hover:bg-wa-green disabled:opacity-50"
            >
              {sending ? "…" : "Send"}
            </button>
          </div>
        </div>

        <TemplatePicker
          open={showTemplates}
          onClose={() => setShowTemplates(false)}
          onSend={handleSendTemplate}
        />
        <QuickReplyManager
          open={showQRManager}
          onClose={() => setShowQRManager(false)}
          onChanged={loadQuickReplies}
        />
        <FollowupDialog
          open={followupOpen}
          onClose={() => setFollowupOpen(false)}
          onSaved={() => {}}
          contact={contact ? { id: contact.id, name: contact.name, wa_id: contact.wa_id } : null}
        />
      </div>

      {notesOpen && (
        <aside className="absolute inset-y-0 right-0 z-30 w-full max-w-sm flex-none border-l border-wa-border bg-wa-panel shadow-lg md:static md:w-80 md:shadow-none">
          <div className="flex items-center justify-between border-b border-wa-border bg-white px-4 py-3">
            <div className="text-sm font-medium">Internal notes</div>
            <button
              onClick={() => setNotesOpen(false)}
              className="text-xs text-wa-textMuted hover:text-wa-text"
            >
              Close
            </button>
          </div>
          <div className="border-b border-wa-border bg-white p-3">
            <textarea
              value={newNote}
              onChange={(e) => setNewNote(e.target.value)}
              placeholder="Add a note for your team (not visible to the customer)"
              className="w-full resize-none rounded border border-wa-border p-2 text-xs outline-none focus:border-wa-greenDark"
              rows={3}
            />
            <button
              onClick={addNote}
              disabled={!newNote.trim()}
              className="mt-2 w-full rounded bg-wa-greenDark py-1.5 text-xs font-medium text-white hover:bg-wa-green disabled:opacity-50"
            >
              Save note
            </button>
          </div>
          <div className="scroll-thin max-h-[calc(100%-180px)] overflow-y-auto p-3">
            {notes.length === 0 && (
              <div className="py-6 text-center text-xs text-wa-textMuted">
                No notes yet.
              </div>
            )}
            {notes.map((n) => (
              <div key={n.id} className="mb-2 rounded bg-white p-3 shadow-sm">
                <div className="mb-1 flex items-center justify-between text-[10px] text-wa-textMuted">
                  <div>
                    <b>{n.author_name}</b> · {timeAgo(n.created_at)}
                  </div>
                  {currentUser &&
                    (currentUser.id === n.user_id || currentUser.role === "admin") && (
                      <button
                        onClick={() => deleteNote(n.id)}
                        className="text-red-600 hover:underline"
                      >
                        Delete
                      </button>
                    )}
                </div>
                <div className="whitespace-pre-wrap text-xs text-wa-text">{n.body}</div>
              </div>
            ))}
          </div>
        </aside>
      )}

      {activityOpen && (
        <aside className="absolute inset-y-0 right-0 z-30 w-full max-w-sm flex-none border-l border-wa-border bg-wa-panel shadow-lg md:static md:w-80 md:shadow-none">
          <div className="flex items-center justify-between border-b border-wa-border bg-white px-4 py-3">
            <div className="text-sm font-medium">Activity timeline</div>
            <button
              onClick={() => setActivityOpen(false)}
              className="text-xs text-wa-textMuted hover:text-wa-text"
            >
              Close
            </button>
          </div>
          <div className="scroll-thin h-[calc(100%-49px)] overflow-y-auto p-3">
            {activity.length === 0 ? (
              <div className="py-6 text-center text-xs text-wa-textMuted">
                No activity logged for this contact yet.
              </div>
            ) : (
              <ol className="relative ml-3 border-l border-wa-border">
                {activity.map((a) => (
                  <li key={a.id} className="mb-3 ml-4">
                    <div className="absolute -left-1.5 mt-1 h-3 w-3 rounded-full border border-wa-greenDark bg-white" />
                    <div className="rounded bg-white p-2 shadow-sm">
                      <div className="mb-0.5 flex items-center justify-between text-[10px] text-wa-textMuted">
                        <span className="font-mono">{a.action}</span>
                        <span>{timeAgo(a.created_at)}</span>
                      </div>
                      <div className="text-xs text-wa-text">
                        {a.summary || <span className="italic">(no summary)</span>}
                      </div>
                      <div className="mt-0.5 text-[10px] text-wa-textMuted">
                        {a.user_name ? (
                          <>
                            by <b>{a.user_name}</b>
                          </>
                        ) : (
                          <span className="rounded bg-wa-panelDark px-1 text-[9px]">system</span>
                        )}
                      </div>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </aside>
      )}
    </div>
  );
}
