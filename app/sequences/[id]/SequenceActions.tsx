"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Sequence } from "@prisma/client";

export default function SequenceActions({ sequence }: { sequence: Sequence }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggleActive() {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/sequences/${sequence.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !sequence.isActive }),
    });
    setBusy(false);
    if (!res.ok) {
      setError("Failed to update sequence");
      return;
    }
    router.refresh();
  }

  async function handleDelete() {
    if (!confirm(`Delete "${sequence.name}"? This removes all enrolled steps too.`)) return;
    setBusy(true);
    const res = await fetch(`/api/sequences/${sequence.id}`, { method: "DELETE" });
    setBusy(false);
    if (res.ok) {
      router.push("/sequences");
      router.refresh();
    } else {
      setError("Failed to delete sequence");
    }
  }

  return (
    <div className="flex flex-col gap-2">
      {error && (
        <div className="rounded-md bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300 px-3 py-2 text-sm">
          {error}
        </div>
      )}
      <div className="flex gap-2">
        <button
          onClick={toggleActive}
          disabled={busy}
          className="rounded-md border border-black/10 dark:border-white/10 px-3 py-1.5 text-sm font-medium hover:bg-black/[.04] dark:hover:bg-white/[.06] disabled:opacity-50"
        >
          {sequence.isActive ? "Deactivate" : "Activate"}
        </button>
        <button
          onClick={handleDelete}
          disabled={busy}
          className="rounded-md border border-red-200 dark:border-red-900/50 px-3 py-1.5 text-sm font-medium text-red-700 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-50"
        >
          Delete
        </button>
      </div>
    </div>
  );
}
