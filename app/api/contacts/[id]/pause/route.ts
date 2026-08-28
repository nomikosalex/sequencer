import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Pause one contact without touching their queue. The send route only picks up
// contacts with status "active", so flipping to "paused" holds their scheduled
// steps exactly where they are; resuming puts them back in line.
//
// Distinct from Stop, which cancels the steps rather than holding them, and
// from "unsubscribed"/"bounced", which describe what the recipient did rather
// than a decision you made.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const { paused } = body as { paused?: boolean };

  if (typeof paused !== "boolean") {
    return NextResponse.json({ error: "paused must be a boolean" }, { status: 400 });
  }

  const contact = await prisma.contact.findUnique({ where: { id } });
  if (!contact) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Only move between active and paused. A contact who replied, bounced or
  // unsubscribed must not be quietly reactivated by a pause toggle.
  if (paused && contact.status !== "active") {
    return NextResponse.json(
      { error: `Cannot pause a contact whose status is "${contact.status}"` },
      { status: 409 }
    );
  }
  if (!paused && contact.status !== "paused") {
    return NextResponse.json(
      { error: `Cannot resume a contact whose status is "${contact.status}"` },
      { status: 409 }
    );
  }

  const updated = await prisma.contact.update({
    where: { id },
    data: { status: paused ? "paused" : "active" },
  });

  const held = await prisma.sequenceStep.count({
    where: { contactId: id, status: "pending" },
  });

  return NextResponse.json({ status: updated.status, pendingSteps: held });
}
