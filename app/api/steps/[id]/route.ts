import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isSendingDay, windowStartUtc } from "@/lib/schedule";
import { DEFAULT_TIMEZONE } from "@/lib/timezone";

// Reschedule one queued email to a specific day.
//
// The interface is a date, not a timestamp, on purpose: the send route only
// sends inside the recipient's 07:00-10:00 window, so an exact time would be a
// lie. Picking a day and letting the window decide the hour is what actually
// happens, so that is what the API accepts.
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const { date } = body as { date?: string };

  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json(
      { error: "date must be YYYY-MM-DD" },
      { status: 400 }
    );
  }

  const step = await prisma.sequenceStep.findUnique({
    where: { id },
    include: { contact: true },
  });
  if (!step) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (step.status !== "pending") {
    return NextResponse.json(
      { error: `Only pending steps can be rescheduled; this one is "${step.status}"` },
      { status: 409 }
    );
  }

  const timeZone = step.contact.timezone || DEFAULT_TIMEZONE;

  // Anchor at midday so the chosen calendar day survives the conversion into
  // the contact's zone regardless of which side of UTC they sit on.
  const anchor = new Date(`${date}T12:00:00Z`);
  if (Number.isNaN(anchor.getTime())) {
    return NextResponse.json({ error: "Unparseable date" }, { status: 400 });
  }

  if (!isSendingDay(anchor, timeZone)) {
    const weekday = new Intl.DateTimeFormat("en-US", { weekday: "long", timeZone }).format(anchor);
    return NextResponse.json(
      { error: `${weekday} is not a sending day. Pick another date.` },
      { status: 400 }
    );
  }

  const sendAt = windowStartUtc(anchor, timeZone);
  await prisma.sequenceStep.update({ where: { id }, data: { sendAt } });

  return NextResponse.json({
    id,
    sendAt: sendAt.toISOString(),
    timeZone,
    localDate: new Intl.DateTimeFormat("en-CA", { timeZone }).format(sendAt),
  });
}
