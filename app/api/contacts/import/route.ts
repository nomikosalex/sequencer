import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { syncContactToHubspot } from "@/lib/hubspotSync";
import { timezoneForCity } from "@/lib/timezone";

type ImportRow = {
  name?: string;
  email?: string;
  company?: string;
  linkedinUrl?: string;
  title?: string;
  customLine?: string;
  city?: string;
  timezone?: string;
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
      const city = row.city?.trim() || null;
      const contact = await prisma.contact.create({
        data: {
          name,
          email,
          company,
          linkedinUrl: row.linkedinUrl?.trim() || null,
          title: row.title?.trim() || null,
          customLine: row.customLine?.trim() || null,
          city,
          // An explicit timezone column wins; otherwise derive it from the city
          // so the target-list export works without extra columns.
          timezone: row.timezone?.trim() || timezoneForCity(city),
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
