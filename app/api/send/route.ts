import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/mailgun";
import { logStepSentToHubspot, setPipelineStage } from "@/lib/hubspotSync";

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const pendingSteps = await prisma.sequenceStep.findMany({
    where: {
      status: "pending",
      sendAt: { lte: new Date() },
      contact: { status: "active" },
    },
    include: { contact: true },
  });

  let sent = 0;
  let failed = 0;
  let skipped = 0;

  for (const step of pendingSteps) {
    // Atomically claim the step before sending, so a duplicate cron
    // invocation (Vercel cron delivery is best-effort, not exactly-once)
    // can't email the same person twice.
    const claim = await prisma.sequenceStep.updateMany({
      where: { id: step.id, status: "pending" },
      data: { status: "sending" },
    });
    if (claim.count === 0) {
      skipped++;
      continue;
    }

    try {
      const result = await sendEmail({
        to: step.contact.email,
        subject: step.subject,
        text: step.body,
      });

      await prisma.sequenceStep.update({
        where: { id: step.id },
        data: { status: "sent", sentAt: new Date(), mailgunId: result.id },
      });
      await logStepSentToHubspot(step, step.contact);
      if (step.contact.pipelineStage === "target") {
        await setPipelineStage(step.contact.id, "contacted");
      }
      sent++;
    } catch {
      await prisma.sequenceStep.update({
        where: { id: step.id },
        data: { status: "failed" },
      });
      failed++;
    }
  }

  return NextResponse.json({ checked: pendingSteps.length, sent, failed, skipped });
}
