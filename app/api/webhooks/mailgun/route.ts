import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyMailgunSignature } from "@/lib/mailgun";
import { setPipelineStage } from "@/lib/hubspotSync";

type MailgunSignature = { timestamp: string; token: string; signature: string };

function normalizeMessageId(id: string): string {
  return id.replace(/^</, "").replace(/>$/, "");
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

  const step = await prisma.sequenceStep.findFirst({
    where: { mailgunId: { contains: messageId } },
  });
  if (!step) return;

  switch (event) {
    case "delivered": {
      await prisma.sequenceStep.update({
        where: { id: step.id },
        data: { status: "sent" },
      });
      break;
    }
    case "opened": {
      await prisma.sequenceStep.update({
        where: { id: step.id },
        data: {
          openedAt: step.openedAt ?? new Date(),
          status: step.status === "sent" ? "opened" : step.status,
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
    where: { contactId: contact.id, status: { in: ["sent", "opened"] } },
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
