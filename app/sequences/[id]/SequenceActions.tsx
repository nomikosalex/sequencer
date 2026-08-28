"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Sequence } from "@prisma/client";

export default function SequenceActions({
  sequence,
  pendingCount = 0,
}: {
  sequence: Sequence;
  pendingCount?: number;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function togglePaused() {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/sequences/${sequence.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !sequence.isActive }),
    });
    setBusy(false);
    if (!res.ok) {
      setError("Couldn't change the sequence. Try again.");
      return;
    }
    router.refresh();
  }

  async function handleStop() {
    if (
      !confirm(
        `Stop "${sequence.name}"? This cancels ${pendingCount} scheduled ` +
          `${pendingCount === 1 ? "email" : "emails"} permanently. ` +
          `To hold them instead, use Pause.`
      )
    )
      return;
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/sequences/${sequence.id}/stop`, { method: "POST" });
    setBusy(false);
    if (!res.ok) {
      setError("Couldn't stop the sequence. Try again.");
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
      {!sequence.isActive && pendingCount > 0 && (
        <div className="rounded-md bg-amber-100 dark:bg-amber-900/30 text-amber-900 dark:text-amber-200 px-3 py-2 text-sm">
          Paused — {pendingCount} scheduled{" "}
          {pendingCount === 1 ? "email is" : "emails are"} being held. Resume to
          send them, or Stop to cancel them.
        </div>
      )}
      <div className="flex gap-2">
        <button
          onClick={togglePaused}
          disabled={busy}
          className="rounded-md border border-black/10 dark:border-white/10 px-3 py-1.5 text-sm font-medium hover:bg-black/[.04] dark:hover:bg-white/[.06] disabled:opacity-50"
        >
          {sequence.isActive ? "Pause" : "Resume"}
        </button>
        <button
          onClick={handleStop}
          disabled={busy || pendingCount === 0}
          title={pendingCount === 0 ? "Nothing scheduled to cancel" : undefined}
          className="rounded-md border border-black/10 dark:border-white/10 px-3 py-1.5 text-sm font-medium hover:bg-black/[.04] dark:hover:bg-white/[.06] disabled:opacity-50"
        >
          Stop
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
