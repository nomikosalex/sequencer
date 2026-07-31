import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { syncContactToHubspot } from "@/lib/hubspotSync";

type ImportRow = {
  name?: string;
  email?: string;
  company?: string;
  linkedinUrl?: string;
  title?: string;
};

export async function POST(request: NextRequest) {
  const body = await request.json();
  const rows: ImportRow[] = Array.isArray(body?.contacts) ? body.contacts : [];

  let created = 0;
  let skipped = 0;
  const errors: { row: number; email?: string; message: string }[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const name = row.name?.trim();
    const email = row.email?.trim();
    const company = row.company?.trim();

    if (!name || !email || !company) {
      errors.push({
        row: i + 1,
        email,
        message: "Missing required field (name, email, or company)",
      });
      continue;
    }

    try {
      const contact = await prisma.contact.create({
        data: {
          name,
          email,
          company,
          linkedinUrl: row.linkedinUrl?.trim() || null,
          title: row.title?.trim() || null,
        },
      });
      await syncContactToHubspot(contact);
      created++;
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === "P2002"
      ) {
        skipped++;
      } else {
        errors.push({ row: i + 1, email, message: "Failed to create contact" });
      }
    }
  }

  return NextResponse.json({ created, skipped, errors });
}
