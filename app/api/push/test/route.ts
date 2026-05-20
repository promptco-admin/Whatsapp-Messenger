import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { sendPushToAll } from "@/lib/push";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    await requireUser();
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: e.status || 401 });
  }
  const result = await sendPushToAll({
    title: "Test notification",
    body: "Push is working — you'll get a ping on every new inbound.",
    url: "/",
    tag: "push-test",
  });
  return NextResponse.json(result);
}
