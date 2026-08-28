"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

type ContactOption = {
  id: string;
  name: string;
  email: string;
  company: string;
};

export default function EnrollForm({
  sequenceId,
  contacts,
}: {
  sequenceId: string;
  contacts: ContactOption[];
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  // 0 means "start everyone at once"; anything else drips them across
  // sending days.
  const [perDay, setPerDay] = useState(0);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelected((prev) =>
      prev.size === contacts.length ? new Set() : new Set(contacts.map((c) => c.id))
    );
  }

  async function handleEnroll() {
    if (selected.size === 0) return;
    setSubmitting(true);
    setError(null);

    const res = await fetch("/api/sequences/enroll", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sequenceId,
        contactIds: Array.from(selected),
        ...(perDay > 0 ? { perDay } : {}),
      }),
    });

    setSubmitting(false);

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Something went wrong");
      return;
    }

    router.push(`/sequences/${sequenceId}`);
    router.refresh();
  }

  if (contacts.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-black/15 dark:border-white/15 px-4 py-6 text-sm text-foreground/70">
        No eligible contacts — everyone is already enrolled in this sequence, or you
        haven&apos;t added any contacts yet.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {error && (
        <div className="rounded-md bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300 px-3 py-2 text-sm">
          {error}
        </div>
      )}

      <div className="overflow-x-auto rounded-lg border border-black/10 dark:border-white/10">
        <table className="w-full text-sm">
          <thead className="bg-black/[.03] dark:bg-white/[.04] text-left text-foreground/60">
            <tr>
              <th className="px-4 py-2 w-8">
                <input
                  type="checkbox"
                  checked={selected.size === contacts.length}
                  onChange={toggleAll}
                />
              </th>
              <th className="px-4 py-2 font-medium">Name</th>
              <th className="px-4 py-2 font-medium">Company</th>
            </tr>
          </thead>
          <tbody>
            {contacts.map((c) => (
              <tr
                key={c.id}
                className="border-t border-black/10 dark:border-white/10 cursor-pointer hover:bg-black/[.02] dark:hover:bg-white/[.03]"
                onClick={() => toggle(c.id)}
              >
                <td className="px-4 py-2" onClick={(e) => e.stopPropagation()}>
                  <input
                    type="checkbox"
                    checked={selected.has(c.id)}
                    onChange={() => toggle(c.id)}
                  />
                </td>
                <td className="px-4 py-2">
                  <div className="font-medium">{c.name}</div>
                  <div className="text-foreground/60">{c.email}</div>
                </td>
                <td className="px-4 py-2">{c.company}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex flex-col gap-2 rounded-lg border border-black/10 dark:border-white/10 p-4">
        <label className="text-sm font-medium" htmlFor="perDay">
          Start per day
        </label>
        <div className="flex items-center gap-3">
          <select
            id="perDay"
            value={perDay}
            onChange={(e) => setPerDay(Number(e.target.value))}
            className="rounded-md border border-black/10 dark:border-white/10 bg-transparent px-3 py-1.5 text-sm"
          >
            <option value={0}>All at once</option>
            {[1, 2, 3, 5].map((n) => (
              <option key={n} value={n}>{n} per day</option>
            ))}
          </select>
          <span className="text-sm text-foreground/60">
            {perDay === 0
              ? "Everyone becomes due immediately, subject to the daily cap."
              : `${selected.size || 0} contacts spread over ~${Math.ceil((selected.size || 0) / perDay)} sending days. Sundays are skipped.`}
          </span>
        </div>
      </div>

      <div className="flex gap-2">
        <button
          onClick={handleEnroll}
          disabled={submitting || selected.size === 0}
          className="rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background hover:opacity-90 disabled:opacity-50"
        >
          {submitting ? "Enrolling…" : `Enroll ${selected.size || ""} contact${selected.size === 1 ? "" : "s"}`}
        </button>
        <Link
          href={`/sequences/${sequenceId}`}
          className="rounded-md border border-black/10 dark:border-white/10 px-4 py-2 text-sm font-medium hover:bg-black/[.04] dark:hover:bg-white/[.06]"
        >
          Cancel
        </Link>
      </div>
    </div>
  );
}
