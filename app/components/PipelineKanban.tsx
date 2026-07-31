"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import LeadScoreBadge from "./LeadScoreBadge";

export type KanbanContact = {
  id: string;
  name: string;
  company: string;
  leadScore: number;
  pipelineStage: string;
};

const COLUMNS: { stage: string; label: string }[] = [
  { stage: "target", label: "Target" },
  { stage: "contacted", label: "Contacted" },
  { stage: "replied", label: "Replied" },
  { stage: "call_booked", label: "Call Booked" },
  { stage: "offer", label: "Offer" },
];

export default function PipelineKanban({ contacts }: { contacts: KanbanContact[] }) {
  const router = useRouter();
  const [items, setItems] = useState(contacts);
  const [dragOverStage, setDragOverStage] = useState<string | null>(null);

  async function moveContact(contactId: string, stage: string) {
    const previous = items;
    setItems((prev) =>
      prev.map((c) => (c.id === contactId ? { ...c, pipelineStage: stage } : c))
    );

    const res = await fetch(`/api/contacts/${contactId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pipelineStage: stage }),
    });

    if (!res.ok) {
      setItems(previous);
      return;
    }

    router.refresh();
  }

  function handleDrop(e: React.DragEvent, stage: string) {
    e.preventDefault();
    setDragOverStage(null);
    const contactId = e.dataTransfer.getData("text/plain");
    if (!contactId) return;
    const contact = items.find((c) => c.id === contactId);
    if (!contact || contact.pipelineStage === stage) return;
    moveContact(contactId, stage);
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
      {COLUMNS.map((col) => {
        const columnContacts = items.filter((c) => c.pipelineStage === col.stage);
        return (
          <div
            key={col.stage}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOverStage(col.stage);
            }}
            onDragLeave={() => setDragOverStage((s) => (s === col.stage ? null : s))}
            onDrop={(e) => handleDrop(e, col.stage)}
            className={`rounded-lg border p-2 flex flex-col gap-2 min-h-[120px] transition-colors ${
              dragOverStage === col.stage
                ? "border-foreground/40 bg-black/[.03] dark:bg-white/[.05]"
                : "border-black/10 dark:border-white/10"
            }`}
          >
            <div className="flex items-center justify-between px-1">
              <span className="text-xs font-semibold text-foreground/60 uppercase tracking-wide">
                {col.label}
              </span>
              <span className="text-xs text-foreground/40">{columnContacts.length}</span>
            </div>

            <div className="flex flex-col gap-2">
              {columnContacts.map((contact) => (
                <Link
                  key={contact.id}
                  href={`/contacts/${contact.id}`}
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData("text/plain", contact.id);
                  }}
                  className="rounded-md border border-black/10 dark:border-white/10 bg-background px-3 py-2 text-sm cursor-grab active:cursor-grabbing hover:bg-black/[.02] dark:hover:bg-white/[.04]"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium truncate">{contact.name}</span>
                    <LeadScoreBadge score={contact.leadScore} />
                  </div>
                  <div className="text-foreground/60 truncate">{contact.company}</div>
                </Link>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
