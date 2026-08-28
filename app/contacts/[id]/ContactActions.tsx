"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Contact } from "@prisma/client";

const STATUS_OPTIONS = ["active", "paused", "replied", "bounced", "completed", "unsubscribed"];

export default function ContactActions({
  contact,
  pendingCount = 0,
}: {
  contact: Contact;
  pendingCount?: number;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [busy, setBusy] = useState(false);

  const paused = contact.status === "paused";
  const stoppable = pendingCount > 0;

  async function togglePause() {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/contacts/${contact.id}/pause`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ paused: !paused }),
    });
    setBusy(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Couldn't change this contact. Try again.");
      return;
    }
    router.refresh();
  }

  async function handleStopContact() {
    if (
      !confirm(
        `Stop outreach to ${contact.name}? This cancels ${pendingCount} scheduled ` +
          `${pendingCount === 1 ? "email" : "emails"} permanently. To hold them instead, use Pause.`
      )
    )
      return;
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/contacts/${contact.id}/stop`, { method: "POST" });
    setBusy(false);
    if (!res.ok) {
      setError("Couldn't stop outreach. Try again.");
      return;
    }
    router.refresh();
  }

  async function handleSave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    const form = new FormData(e.currentTarget);
    const payload = {
      name: form.get("name"),
      email: form.get("email"),
      company: form.get("company"),
      title: form.get("title") || null,
      linkedinUrl: form.get("linkedinUrl") || null,
      leadScore: Number(form.get("leadScore")),
      status: form.get("status"),
      notes: form.get("notes") || null,
      customLine: form.get("customLine") || null,
    };

    const res = await fetch(`/api/contacts/${contact.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    setSubmitting(false);

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Something went wrong");
      return;
    }

    setEditing(false);
    router.refresh();
  }

  async function handleDelete() {
    if (!confirm(`Delete ${contact.name}? This cannot be undone.`)) return;
    const res = await fetch(`/api/contacts/${contact.id}`, { method: "DELETE" });
    if (res.ok) {
      router.push("/contacts");
      router.refresh();
    } else {
      setError("Failed to delete contact");
    }
  }

  async function handleCallBooked() {
    setError(null);
    const res = await fetch(`/api/contacts/${contact.id}/call-booked`, { method: "POST" });
    if (res.ok) {
      router.refresh();
    } else {
      setError("Failed to update HubSpot deal stage");
    }
  }

  if (editing) {
    return (
      <form onSubmit={handleSave} className="flex flex-col gap-4 rounded-lg border border-black/10 dark:border-white/10 p-4">
        {error && (
          <div className="rounded-md bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300 px-3 py-2 text-sm">
            {error}
          </div>
        )}
        <Field label="Name" name="name" defaultValue={contact.name} required />
        <Field label="Email" name="email" type="email" defaultValue={contact.email} required />
        <Field label="Company" name="company" defaultValue={contact.company} required />
        <Field label="Title" name="title" defaultValue={contact.title ?? ""} />
        <Field label="LinkedIn URL" name="linkedinUrl" type="url" defaultValue={contact.linkedinUrl ?? ""} />
        <Field label="Lead score" name="leadScore" type="number" defaultValue={String(contact.leadScore)} />

        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium" htmlFor="customLine">
            Custom opening line
          </label>
          <textarea
            id="customLine"
            name="customLine"
            rows={2}
            defaultValue={contact.customLine ?? ""}
            placeholder="Personalized first line for this contact's outreach — use {{customLine}} in a sequence step"
            className="rounded-md border border-black/10 dark:border-white/10 bg-transparent px-3 py-1.5 text-sm"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium" htmlFor="status">Status</label>
          <select
            id="status"
            name="status"
            defaultValue={contact.status}
            className="rounded-md border border-black/10 dark:border-white/10 bg-transparent px-3 py-1.5 text-sm"
          >
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium" htmlFor="notes">Notes</label>
          <textarea
            id="notes"
            name="notes"
            rows={3}
            defaultValue={contact.notes ?? ""}
            className="rounded-md border border-black/10 dark:border-white/10 bg-transparent px-3 py-1.5 text-sm"
          />
        </div>

        <div className="flex gap-2">
          <button
            type="submit"
            disabled={submitting}
            className="rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background hover:opacity-90 disabled:opacity-50"
          >
            {submitting ? "Saving…" : "Save"}
          </button>
          <button
            type="button"
            onClick={() => setEditing(false)}
            className="rounded-md border border-black/10 dark:border-white/10 px-4 py-2 text-sm font-medium hover:bg-black/[.04] dark:hover:bg-white/[.06]"
          >
            Cancel
          </button>
        </div>
      </form>
    );
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-black/10 dark:border-white/10 p-4">
      {error && (
        <div className="rounded-md bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300 px-3 py-2 text-sm">
          {error}
        </div>
      )}
      <dl className="grid grid-cols-[120px_1fr] gap-y-1 text-sm">
        <dt className="text-foreground/60">Email</dt>
        <dd>{contact.email}</dd>
        <dt className="text-foreground/60">Company</dt>
        <dd>{contact.company}</dd>
        <dt className="text-foreground/60">Title</dt>
        <dd>{contact.title ?? "—"}</dd>
        <dt className="text-foreground/60">LinkedIn</dt>
        <dd>
          {contact.linkedinUrl ? (
            <a href={contact.linkedinUrl} target="_blank" rel="noreferrer" className="underline">
              {contact.linkedinUrl}
            </a>
          ) : (
            "—"
          )}
        </dd>
        <dt className="text-foreground/60">Lead score</dt>
        <dd>{contact.leadScore}</dd>
        <dt className="text-foreground/60">Custom line</dt>
        <dd className="whitespace-pre-wrap">{contact.customLine ?? "—"}</dd>
        <dt className="text-foreground/60">Status</dt>
        <dd>{contact.status}</dd>
        <dt className="text-foreground/60">Notes</dt>
        <dd className="whitespace-pre-wrap">{contact.notes ?? "—"}</dd>
      </dl>

      {paused && (
        <div className="rounded-md bg-amber-100 dark:bg-amber-900/30 text-amber-900 dark:text-amber-200 px-3 py-2 text-sm">
          Paused
          {pendingCount > 0
            ? ` — ${pendingCount} scheduled ${pendingCount === 1 ? "email is" : "emails are"} being held.`
            : " — nothing scheduled."}{" "}
          Resume to continue, or Stop to cancel.
        </div>
      )}

      <div className="flex flex-wrap gap-2 pt-2">
        <button
          onClick={() => setEditing(true)}
          className="rounded-md border border-black/10 dark:border-white/10 px-3 py-1.5 text-sm font-medium hover:bg-black/[.04] dark:hover:bg-white/[.06]"
        >
          Edit
        </button>
        {(contact.status === "active" || paused) && (
          <button
            onClick={togglePause}
            disabled={busy}
            className="rounded-md border border-black/10 dark:border-white/10 px-3 py-1.5 text-sm font-medium hover:bg-black/[.04] dark:hover:bg-white/[.06] disabled:opacity-50"
          >
            {paused ? "Resume" : "Pause"}
          </button>
        )}
        <button
          onClick={handleStopContact}
          disabled={busy || !stoppable}
          title={stoppable ? undefined : "Nothing scheduled to cancel"}
          className="rounded-md border border-black/10 dark:border-white/10 px-3 py-1.5 text-sm font-medium hover:bg-black/[.04] dark:hover:bg-white/[.06] disabled:opacity-50"
        >
          Stop
        </button>
        {contact.hubspotId && (
          <button
            onClick={handleCallBooked}
            className="rounded-md border border-black/10 dark:border-white/10 px-3 py-1.5 text-sm font-medium hover:bg-black/[.04] dark:hover:bg-white/[.06]"
          >
            Mark call booked
          </button>
        )}
        <button
          onClick={handleDelete}
          className="rounded-md border border-red-200 dark:border-red-900/50 px-3 py-1.5 text-sm font-medium text-red-700 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20"
        >
          Delete
        </button>
      </div>
    </div>
  );
}

function Field({
  label,
  name,
  type = "text",
  required,
  defaultValue,
}: {
  label: string;
  name: string;
  type?: string;
  required?: boolean;
  defaultValue?: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-sm font-medium" htmlFor={name}>
        {label}
        {required && <span className="text-red-500"> *</span>}
      </label>
      <input
        id={name}
        name={name}
        type={type}
        required={required}
        defaultValue={defaultValue}
        className="rounded-md border border-black/10 dark:border-white/10 bg-transparent px-3 py-1.5 text-sm"
      />
    </div>
  );
}
