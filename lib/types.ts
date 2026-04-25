export type Contact = {
  id: number;
  wa_id: string;
  /** Agent-editable display name (set via UI, CSV import, or first inbound). */
  name: string | null;
  /** Latest WhatsApp profile name pulled from inbound webhook. May differ from `name`. */
  wa_profile_name?: string | null;
  wa_profile_updated_at?: string | null;
  tags: string[];
  custom_fields: Record<string, string>;
  last_message_at: string | null;
  last_inbound_at: string | null;
  created_at?: string | null;
  pipeline_stage_id?: number | null;
  assigned_user_id?: number | null;
  unsubscribed_at?: string | null;
};

export type Broadcast = {
  id: number;
  name: string;
  template_name: string;
  language: string;
  segment_tag: string | null;
  status: "pending" | "scheduled" | "running" | "completed" | "failed";
  total: number;
  sent: number;
  delivered: number;
  read: number;
  failed: number;
  scheduled_for: string | null;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
};

export type Sequence = {
  id: number;
  name: string;
  description: string | null;
  active: number;
  created_at: string;
};

export type SequenceStep = {
  id: number;
  sequence_id: number;
  order_index: number;
  template_name: string;
  language: string;
  variable_mapping: string | null;
  header_json: string | null;
  delay_days: number;
  delay_hours: number;
  delay_minutes: number;
};

export type SequenceEnrollment = {
  id: number;
  sequence_id: number;
  contact_id: number;
  current_step: number;
  status: "active" | "completed" | "paused" | "failed";
  next_run_at: string | null;
  enrolled_at: string;
  completed_at: string | null;
  last_error: string | null;
};

export type VariableMapping = {
  source: "static" | "name" | "wa_id" | "custom_field";
  value: string;
};

export type Message = {
  id: number;
  wa_message_id: string | null;
  contact_id: number;
  direction: "inbound" | "outbound";
  type: "text" | "template" | "image" | "document" | "audio" | "video" | "sticker" | "other";
  body: string | null;
  template_name: string | null;
  template_variables: string | null;
  status: "pending" | "sent" | "delivered" | "read" | "failed";
  error: string | null;
  created_at: string;
};

export type TemplateComponent = {
  type: "HEADER" | "BODY" | "FOOTER" | "BUTTONS";
  format?: "TEXT" | "IMAGE" | "VIDEO" | "DOCUMENT";
  text?: string;
  buttons?: Array<{ type: string; text: string }>;
};

export type Template = {
  name: string;
  language: string;
  status: string;
  category: string;
  components: TemplateComponent[];
};

export type ConversationSummary = Contact & {
  last_message_preview: string | null;
  last_message_direction: "inbound" | "outbound" | null;
  unread_count: number;
};
