import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { syncContactToHubspot } from "@/lib/hubspotSync";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q");
  const status = searchParams.get("status");
  const company = searchParams.get("company");

  const where: Prisma.ContactWhereInput = {
    ...(status ? { status } : {}),
    ...(company ? { company: { equals: company, mode: "insensitive" } } : {}),
    ...(q
      ? {
          OR: [
            { name: { contains: q, mode: "insensitive" } },
            { email: { contains: q, mode: "insensitive" } },
            { company: { contains: q, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const contacts = await prisma.contact.findMany({
    where,
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(contacts);
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { name, email, company, linkedinUrl, title, leadScore, notes } = body;

  if (!name || !email || !company) {
    return NextResponse.json(
      { error: "name, email, and company are required" },
      { status: 400 }
    );
  }

  try {
    const contact = await prisma.contact.create({
      data: {
        name,
        email,
        company,
        linkedinUrl: linkedinUrl || null,
        title: title || null,
        leadScore: typeof leadScore === "number" ? leadScore : 0,
        notes: notes || null,
      },
    });
    await syncContactToHubspot(contact);
    return NextResponse.json(contact, { status: 201 });
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002"
    ) {
      return NextResponse.json(
        { error: "A contact with this email already exists" },
        { status: 409 }
      );
    }
    throw err;
  }
}
