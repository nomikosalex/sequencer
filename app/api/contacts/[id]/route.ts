import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { setPipelineStage, PIPELINE_STAGES, type PipelineStage } from "@/lib/hubspotSync";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const contact = await prisma.contact.findUnique({ where: { id } });

  if (!contact) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(contact);
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json();
  const {
    name,
    email,
    company,
    linkedinUrl,
    title,
    leadScore,
    status,
    notes,
    pipelineStage,
  } = body;

  if (pipelineStage !== undefined && !PIPELINE_STAGES.includes(pipelineStage)) {
    return NextResponse.json({ error: "Invalid pipelineStage" }, { status: 400 });
  }

  try {
    const contact = await prisma.contact.update({
      where: { id },
      data: {
        ...(name !== undefined ? { name } : {}),
        ...(email !== undefined ? { email } : {}),
        ...(company !== undefined ? { company } : {}),
        ...(linkedinUrl !== undefined ? { linkedinUrl: linkedinUrl || null } : {}),
        ...(title !== undefined ? { title: title || null } : {}),
        ...(leadScore !== undefined ? { leadScore } : {}),
        ...(status !== undefined ? { status } : {}),
        ...(notes !== undefined ? { notes: notes || null } : {}),
      },
    });

    if (pipelineStage !== undefined) {
      await setPipelineStage(id, pipelineStage as PipelineStage);
    }

    return NextResponse.json(contact);
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError) {
      if (err.code === "P2025") {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }
      if (err.code === "P2002") {
        return NextResponse.json(
          { error: "A contact with this email already exists" },
          { status: 409 }
        );
      }
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
    await prisma.contact.delete({ where: { id } });
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
