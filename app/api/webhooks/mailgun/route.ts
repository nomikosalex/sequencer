import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyMailgunSignature } from "@/lib/mailgun";
import { setPipelineStage } from "@/lib/hubspotSync";

type MailgunSignature = { timestamp: string; token: string; signature: string };

function normalizeMessageId(id: string): string {
  return id.replace(/^</, "").replace(/>$/, "");
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Mailgun can fire a `delivered` webhook within ~1s of the send call resolving,
// which can race our own /api/send write of `mailgunId` to the step row (that
// write only starts after Mailgun's API response comes back, and can take longer
// than expected on a cold serverless->DB connection). Unlike other event types,
// `delivered` webhooks are NOT retried by Mailgun on a non-200 response, so if we
// give up on the first miss, the delivered event is lost for good. Retry the
// lookup briefly instead of failing fast.
async function findStepByMessageId(messageId: string) {
  const attempts = 6;
  const delayMs = 500;
  for (let i = 0; i < attempts; i++) {
    const step = await prisma.sequenceStep.findFirst({
      where: { mailgunId: { contains: messageId } },
    });
    if (step) return step;
    if (i < attempts - 1) await sleep(delayMs);
  }
  return null;
}

async function skipRemainingSteps(contactId: string) {
  await prisma.sequenceStep.updateMany({
    where: { contactId, status: "pending" },
    data: { status: "skipped" },
  });
}

async function handleTrackingEvent(eventData: Record<string, unknown>) {
  const event = eventData.event as string | undefined;
  const message = eventData.message as { headers?: { "message-id"?: string } } | undefined;
  const rawMessageId = message?.headers?.["message-id"];
  if (!event || !rawMessageId) return;

  const messageId = normalizeMessageId(rawMessageId);

  const step = await findStepByMessageId(messageId);
  if (!step) return;

  switch (event) {
    case "delivered": {
      await prisma.sequenceStep.update({
        where: { id: step.id },
        data: { status: step.status === "sent" ? "delivered" : step.status },
      });
      break;
    }
    case "opened": {
      await prisma.sequenceStep.update({
        where: { id: step.id },
        data: {
          openedAt: step.openedAt ?? new Date(),
          status: ["sent", "delivered"].includes(step.status) ? "opened" : step.status,
        },
      });
      break;
    }
    case "clicked": {
      await prisma.sequenceStep.update({
        where: { id: step.id },
        data: { clickedAt: step.clickedAt ?? new Date() },
      });
      break;
    }
    case "complained":
    case "unsubscribed": {
      await prisma.contact.update({
        where: { id: step.contactId },
        data: { status: "unsubscribed" },
      });
      await skipRemainingSteps(step.contactId);
      break;
    }
    case "failed": {
      await prisma.sequenceStep.update({
        where: { id: step.id },
        data: { status: "failed" },
      });
      await prisma.contact.update({
        where: { id: step.contactId },
        data: { status: "bounced" },
      });
      await skipRemainingSteps(step.contactId);
      break;
    }
    default:
      break;
  }
}

async function handleInboundReply(inbound: Record<string, string>) {
  const sender = inbound.sender || inbound.from;
  if (!sender) return;

  const emailMatch = sender.match(/[^<\s]+@[^>\s]+/);
  const email = (emailMatch ? emailMatch[0] : sender).toLowerCase();

  const contact = await prisma.contact.findUnique({ where: { email } });
  if (!contact) return;

  const lastSentStep = await prisma.sequenceStep.findFirst({
    where: { contactId: contact.id, status: { in: ["sent", "delivered", "opened"] } },
    orderBy: { sentAt: "desc" },
  });

  if (lastSentStep) {
    await prisma.sequenceStep.update({
      where: { id: lastSentStep.id },
      data: { status: "replied", repliedAt: new Date() },
    });
  }

  await prisma.contact.update({
    where: { id: contact.id },
    data: { status: "replied" },
  });
  await skipRemainingSteps(contact.id);
  await setPipelineStage(contact.id, "replied");
}

export async function POST(request: NextRequest) {
  const contentType = request.headers.get("content-type") || "";
  let signature: MailgunSignature | null = null;
  let eventData: Record<string, unknown> | null = null;
  let inbound: Record<string, string> | null = null;

  if (contentType.includes("application/json")) {
    const body = await request.json();
    signature = body.signature;
    eventData = body["event-data"];
  } else {
    const form = await request.formData();
    signature = {
      timestamp: String(form.get("timestamp") ?? ""),
      token: String(form.get("token") ?? ""),
      signature: String(form.get("signature") ?? ""),
    };
    inbound = Object.fromEntries(
      Array.from(form.entries()).map(([k, v]) => [k, String(v)])
    );
  }

  if (!signature || !verifyMailgunSignature(signature)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  if (eventData) {
    await handleTrackingEvent(eventData);
  } else if (inbound) {
    await handleInboundReply(inbound);
  }

  return NextResponse.json({ ok: true });
}
