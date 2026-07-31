import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type TemplateInput = {
  stepNumber: number;
  delayDays: number;
  subject: string;
  body: string;
};

export async function GET() {
  const sequences = await prisma.sequence.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      templates: { orderBy: { stepNumber: "asc" } },
      _count: { select: { steps: true } },
    },
  });

  return NextResponse.json(sequences);
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { name, description, templates } = body as {
    name?: string;
    description?: string;
    templates?: TemplateInput[];
  };

  if (!name) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }

  if (!Array.isArray(templates) || templates.length === 0) {
    return NextResponse.json(
      { error: "At least one template step is required" },
      { status: 400 }
    );
  }

  for (const t of templates) {
    if (!t.subject || !t.body || typeof t.delayDays !== "number") {
      return NextResponse.json(
        { error: "Each step needs a subject, body, and delayDays" },
        { status: 400 }
      );
    }
  }

  const sequence = await prisma.sequence.create({
    data: {
      name,
      description: description || null,
      templates: {
        create: templates.map((t, idx) => ({
          stepNumber: idx + 1,
          delayDays: t.delayDays,
          subject: t.subject,
          body: t.body,
        })),
      },
    },
    include: { templates: { orderBy: { stepNumber: "asc" } } },
  });

  return NextResponse.json(sequence, { status: 201 });
}
