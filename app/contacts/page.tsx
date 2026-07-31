import Link from "next/link";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import LeadScoreBadge from "@/app/components/LeadScoreBadge";

export const dynamic = "force-dynamic";

const STATUS_STYLES: Record<string, string> = {
  active: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300",
  replied: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300",
  bounced: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
  completed: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
  unsubscribed: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
};

function StatusBadge({ status }: { status: string }) {
  const style = STATUS_STYLES[status] ?? STATUS_STYLES.completed;
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${style}`}>
      {status}
    </span>
  );
}

export default async function ContactsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; company?: string }>;
}) {
  const { q, status, company } = await searchParams;

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

  const [contacts, companies] = await Promise.all([
    prisma.contact.findMany({ where, orderBy: { createdAt: "desc" } }),
    prisma.contact.findMany({
      select: { company: true },
      distinct: ["company"],
      orderBy: { company: "asc" },
    }),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Contacts</h1>
        <div className="flex gap-2">
          <Link
            href="/contacts/import"
            className="rounded-md border border-black/10 dark:border-white/10 px-3 py-1.5 text-sm font-medium hover:bg-black/[.04] dark:hover:bg-white/[.06]"
          >
            Import CSV
          </Link>
          <Link
            href="/contacts/new"
            className="rounded-md bg-foreground px-3 py-1.5 text-sm font-medium text-background hover:opacity-90"
          >
            Add contact
          </Link>
        </div>
      </div>

      <form method="get" className="flex flex-wrap gap-2">
        <input
          type="text"
          name="q"
          defaultValue={q}
          placeholder="Search name, email, company…"
          className="rounded-md border border-black/10 dark:border-white/10 bg-transparent px-3 py-1.5 text-sm min-w-[220px]"
        />
        <select
          name="status"
          defaultValue={status ?? ""}
          className="rounded-md border border-black/10 dark:border-white/10 bg-transparent px-3 py-1.5 text-sm"
        >
          <option value="">All statuses</option>
          <option value="active">Active</option>
          <option value="replied">Replied</option>
          <option value="bounced">Bounced</option>
          <option value="completed">Completed</option>
          <option value="unsubscribed">Unsubscribed</option>
        </select>
        <select
          name="company"
          defaultValue={company ?? ""}
          className="rounded-md border border-black/10 dark:border-white/10 bg-transparent px-3 py-1.5 text-sm"
        >
          <option value="">All companies</option>
          {companies.map((c) => (
            <option key={c.company} value={c.company}>
              {c.company}
            </option>
          ))}
        </select>
        <button
          type="submit"
          className="rounded-md border border-black/10 dark:border-white/10 px-3 py-1.5 text-sm font-medium hover:bg-black/[.04] dark:hover:bg-white/[.06]"
        >
          Filter
        </button>
        {(q || status || company) && (
          <Link
            href="/contacts"
            className="rounded-md px-3 py-1.5 text-sm text-foreground/60 hover:text-foreground"
          >
            Clear
          </Link>
        )}
      </form>

      {contacts.length === 0 ? (
        <div className="rounded-lg border border-dashed border-black/15 dark:border-white/15 px-4 py-6 text-sm text-foreground/70">
          No contacts match. {" "}
          <Link href="/contacts/new" className="underline">
            Add one
          </Link>
          .
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-black/10 dark:border-white/10">
          <table className="w-full text-sm">
            <thead className="bg-black/[.03] dark:bg-white/[.04] text-left text-foreground/60">
              <tr>
                <th className="px-4 py-2 font-medium">Name</th>
                <th className="px-4 py-2 font-medium">Company</th>
                <th className="px-4 py-2 font-medium">Title</th>
                <th className="px-4 py-2 font-medium">Score</th>
                <th className="px-4 py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {contacts.map((contact) => (
                <tr
                  key={contact.id}
                  className="border-t border-black/10 dark:border-white/10 hover:bg-black/[.02] dark:hover:bg-white/[.03]"
                >
                  <td className="px-4 py-2">
                    <Link href={`/contacts/${contact.id}`} className="font-medium hover:underline">
                      {contact.name}
                    </Link>
                    <div className="text-foreground/60">{contact.email}</div>
                  </td>
                  <td className="px-4 py-2">{contact.company}</td>
                  <td className="px-4 py-2 text-foreground/70">{contact.title ?? "—"}</td>
                  <td className="px-4 py-2">
                    <LeadScoreBadge score={contact.leadScore} />
                  </td>
                  <td className="px-4 py-2">
                    <StatusBadge status={contact.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
