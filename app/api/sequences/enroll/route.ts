import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { renderTemplate } from "@/lib/variables";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { sequenceId, contactIds } = body as {
    sequenceId?: string;
    contactIds?: string[];
  };

  if (!sequenceId || !Array.isArray(contactIds) || contactIds.length === 0) {
    return NextResponse.json(
      { error: "sequenceId and contactIds are required" },
      { status: 400 }
    );
  }

  const sequence = await prisma.sequence.findUnique({
    where: { id: sequenceId },
    include: { templates: { orderBy: { stepNumber: "asc" } } },
  });

  if (!sequence) {
    return NextResponse.json({ error: "Sequence not found" }, { status: 404 });
  }
  if (sequence.templates.length === 0) {
    return NextResponse.json(
      { error: "Sequence has no steps to enroll into" },
      { status: 400 }
    );
  }

  const contacts = await prisma.contact.findMany({
    where: { id: { in: contactIds } },
  });
  const contactById = new Map(contacts.map((c) => [c.id, c]));

  const existingSteps = await prisma.sequenceStep.findMany({
    where: { sequenceId, contactId: { in: contactIds } },
    select: { contactId: true },
    distinct: ["contactId"],
  });
  const alreadyEnrolled = new Set(existingSteps.map((s) => s.contactId));

  // Rendering happens once, here, and is frozen into the step rows — so a
  // contact missing its personalisation line would silently ship a generic
  // email, and fixing the template afterwards would not repair it. Refuse the
  // enrollment instead. Gated on the template actually using the variable, so
  // sequences that do not personalise still enroll normally.
  const needsCustomLine = sequence.templates.some((t) =>
    /\{\{customLine\}\}/.test(`${t.subject}${t.body}`)
  );

  let enrolled = 0;
  const skipped: { contactId: string; reason: string }[] = [];
  const now = Date.now();

  for (const contactId of contactIds) {
    const contact = contactById.get(contactId);
    if (!contact) {
      skipped.push({ contactId, reason: "Contact not found" });
      continue;
    }
    if (alreadyEnrolled.has(contactId)) {
      skipped.push({ contactId, reason: "Already enrolled in this sequence" });
      continue;
    }
    if (needsCustomLine && !contact.customLine?.trim()) {
      skipped.push({
        contactId,
        reason: "Missing customLine — personalisation would render blank",
      });
      continue;
    }

    let cumulativeDays = 0;
    const stepsData = sequence.templates.map((t) => {
      cumulativeDays += t.delayDays;
      const sendAt = new Date(now + cumulativeDays * 24 * 60 * 60 * 1000);
      return {
        contactId,
        sequenceId,
        stepNumber: t.stepNumber,
        subject: renderTemplate(t.subject, contact),
        body: renderTemplate(t.body, contact),
        sendAt,
      };
    });

    await prisma.sequenceStep.createMany({ data: stepsData });
    enrolled++;
  }

  return NextResponse.json({ enrolled, skipped });
}
