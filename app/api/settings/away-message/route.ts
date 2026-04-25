import { NextResponse } from "next/server";
import { getSetting, setSetting } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import type { AwayMessageConfig } from "@/lib/away-runner";

export const dynamic = "force-dynamic";

const DEFAULT: AwayMessageConfig = {
  enabled: false,
  text:
    "Hi {{name}} 👋 Thanks for reaching out — we're currently outside business hours. Our team will reply as soon as we're back (typically within a few hours). For urgent enquiries please call during working hours.",
  cooldown_minutes: 360,
  hours: {
    tz: "Asia/Kolkata",
    days: [1, 2, 3, 4, 5, 6],
    start: "09:00",
    end: "19:00",
  },
};

export async function GET() {
  try {
    await requireUser();
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: e.status || 401 });
  }
  const cfg = getSetting<AwayMessageConfig>("away_message", DEFAULT);
  return NextResponse.json({ config: { ...DEFAULT, ...cfg } });
}

export async function PUT(req: Request) {
  try {
    await requireUser();
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: e.status || 401 });
  }
  const body = (await req.json()) as AwayMessageConfig;
  const cfg: AwayMessageConfig = {
    enabled: !!body.enabled,
    text: String(body.text ?? "").slice(0, 4000),
    cooldown_minutes: Math.max(1, Math.min(10080, Number(body.cooldown_minutes ?? 360))),
    hours: {
      tz: String(body.hours?.tz || "Asia/Kolkata"),
      days: Array.isArray(body.hours?.days)
        ? body.hours!.days!.filter((d) => Number.isInteger(d) && d >= 0 && d <= 6)
        : DEFAULT.hours!.days,
      start: String(body.hours?.start || "09:00"),
      end: String(body.hours?.end || "19:00"),
    },
  };
  setSetting("away_message", cfg);
  return NextResponse.json({ ok: true, config: cfg });
}
