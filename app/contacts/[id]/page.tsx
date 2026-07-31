import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import ContactActions from "./ContactActions";

export const dynamic = "force-dynamic";

export default async function ContactDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const contact = await prisma.contact.findUnique({
    where: { id },
    include: {
      steps: {
        include: { sequence: true },
        orderBy: { sendAt: "asc" },
      },
    },
  });

  if (!contact) notFound();

  return (
    <div className="flex flex-col gap-6 max-w-2xl">
      <div className="flex items-center gap-2">
        <Link href="/contacts" className="text-sm text-foreground/60 hover:text-foreground">
          Contacts
        </Link>
        <span className="text-foreground/40">/</span>
        <h1 className="text-2xl font-semibold tracking-tight">{contact.name}</h1>
      </div>

      <ContactActions contact={contact} />

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold text-foreground/60 uppercase tracking-wide">
          Timeline
        </h2>
        {contact.steps.length === 0 ? (
          <div className="rounded-lg border border-dashed border-black/15 dark:border-white/15 px-4 py-6 text-sm text-foreground/70">
            Not enrolled in any sequence yet.
          </div>
        ) : (
          <ul className="flex flex-col gap-2">
            {contact.steps.map((step) => (
              <li
                key={step.id}
                className="rounded-lg border border-black/10 dark:border-white/10 px-4 py-3 text-sm"
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium">
                    {step.sequence.name} — Step {step.stepNumber}
                  </span>
                  <span className="text-foreground/60">{step.status}</span>
                </div>
                <div className="text-foreground/60">{step.subject}</div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
