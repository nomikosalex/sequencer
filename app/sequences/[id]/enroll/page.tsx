import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import EnrollForm from "./EnrollForm";

export const dynamic = "force-dynamic";

export default async function EnrollPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const sequence = await prisma.sequence.findUnique({ where: { id } });
  if (!sequence) notFound();

  const enrolledContactIds = await prisma.sequenceStep.findMany({
    where: { sequenceId: id },
    select: { contactId: true },
    distinct: ["contactId"],
  });
  const excludeIds = enrolledContactIds.map((s) => s.contactId);

  const contacts = await prisma.contact.findMany({
    where: { id: { notIn: excludeIds } },
    orderBy: { name: "asc" },
    select: { id: true, name: true, email: true, company: true },
  });

  return (
    <div className="flex flex-col gap-6 max-w-2xl">
      <div className="flex items-center gap-2">
        <Link href={`/sequences/${id}`} className="text-sm text-foreground/60 hover:text-foreground">
          {sequence.name}
        </Link>
        <span className="text-foreground/40">/</span>
        <h1 className="text-2xl font-semibold tracking-tight">Enroll contacts</h1>
      </div>

      <EnrollForm sequenceId={id} contacts={contacts} />
    </div>
  );
}
