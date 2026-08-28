import { NextRequest, NextResponse } from "next/server";
import { isSendingPaused, setSendingPaused } from "@/lib/sequenceControl";

export async function GET() {
  return NextResponse.json({ paused: await isSendingPaused() });
}

// Emergency stop for everything, regardless of which sequences are active.
export async function PATCH(request: NextRequest) {
  const body = await request.json();
  const { paused } = body as { paused?: boolean };

  if (typeof paused !== "boolean") {
    return NextResponse.json({ error: "paused must be a boolean" }, { status: 400 });
  }

  await setSendingPaused(paused);
  return NextResponse.json({ paused });
}
