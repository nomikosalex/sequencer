import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

type TemplateInput = {
  stepNumber: number;
  delayDays: number;
  subject: string;
  body: string;
};

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const sequence = await prisma.sequence.findUnique({
    where: { id },
    include: {
      templates: { orderBy: { stepNumber: "asc" } },
      steps: {
        include: { contact: true },
        orderBy: [{ contactId: "asc" }, { stepNumber: "asc" }],
      },
    },
  });

  if (!sequence) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(sequence);
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json();
  const { name, description, isActive, templates } = body as {
    name?: string;
    description?: string;
    isActive?: boolean;
    templates?: TemplateInput[];
  };

  try {
    const sequence = await prisma.$transaction(async (tx) => {
      if (templates) {
        await tx.sequenceTemplate.deleteMany({ where: { sequenceId: id } });
        await tx.sequenceTemplate.createMany({
          data: templates.map((t, idx) => ({
            sequenceId: id,
            stepNumber: idx + 1,
            delayDays: t.delayDays,
            subject: t.subject,
            body: t.body,
          })),
        });
      }

      return tx.sequence.update({
        where: { id },
        data: {
          ...(name !== undefined ? { name } : {}),
          ...(description !== undefined ? { description: description || null } : {}),
          ...(isActive !== undefined ? { isActive } : {}),
        },
        include: { templates: { orderBy: { stepNumber: "asc" } } },
      });
    });

    return NextResponse.json(sequence);
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2025"
    ) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    throw err;
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    await prisma.sequence.delete({ where: { id } });
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2025"
    ) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    throw err;
  }
}
