# Outreach Sequencer

A cold outreach sequencer built to run my own GTM engineering job search as a real pipeline —
multi-step email sequences, open/reply tracking, auto-stop on reply, and a synced HubSpot CRM.

Built by Alexandros Nomikos, 19, Economics student in Athens, as both a working tool for my own
outbound and a demonstration of GTM engineering skills: the same kind of system a GTM engineer
would build to automate a company's outbound motion, applied here to my own search.

## What it does

- **Contacts** — add manually or bulk-import from CSV, with lead scoring, status tracking, and search/filter
- **Sequences** — build multi-step email sequences with per-step delays and `{{variable}}` personalization, preview rendered emails against a real contact before sending
- **Enrollment** — enroll contacts into a sequence; each step's send date is calculated from cumulative delays
- **Auto-sender** — a scheduled job finds due steps and sends them via Mailgun, capped at 10/day and 3 per run, and only inside the recipient's local morning (07:00–10:00 in their timezone)
- **Auto-stop on reply** — a contact replying immediately skips all their remaining scheduled steps
- **Pause, Stop, and a global kill switch** — pause a sequence to hold its scheduled emails, stop it to cancel them outright, or pause all sending from the dashboard; the global switch is stored in the database so it takes effect immediately, with no redeploy
- **HubSpot sync** — every contact becomes a HubSpot contact + deal; sent emails log to the contact timeline; replies and manual "call booked" actions move the deal through pipeline stages
- **Dashboard** — stats (emails sent, bounce rate, reply rate), a drag-and-drop pipeline kanban (Target → Contacted → Replied → Call Booked → Offer), a recent activity feed, and per-sequence performance

## Stack

- **Next.js 16** (App Router) + TypeScript + Tailwind CSS
- **PostgreSQL** (Neon) + **Prisma 7** (driver-adapter pattern via `@prisma/adapter-pg`)
- **Mailgun** for sending + delivery/open/click/reply tracking via webhooks
- **HubSpot** (free CRM) for pipeline tracking, via its REST API
- **Vercel** for hosting + scheduled cron

## Why this stack

Mailgun over Resend because Resend is transactional-only — cold outbound needs a provider built
for it. HubSpot's free tier only allows one deal pipeline, so this project relabels the default
pipeline's stages rather than creating a new one. Everything else follows from wanting a real,
working outbound tool on a $0 budget: free-tier Postgres, free-tier email, free CRM.

## Running locally

```bash
npm install
cp .env.example .env   # fill in your own values
npx prisma migrate dev
npm run dev
```

See `.env.example` for the full list of required environment variables (database, Mailgun,
HubSpot, cron secret). See `PLAN.md` for the full build plan, architecture decisions, and a
running change log of deviations made during the build.

## Scheduling

Vercel Hobby runs cron at most once a day, in UTC — which cannot hit each recipient's local
morning. `.github/workflows/send.yml` polls `/api/send` hourly instead; the route decides who
is actually in-window and enforces the daily cap, so extra runs are harmless. The Vercel cron
stays configured as a fallback.

The workflow needs two repository secrets: `APP_URL` and `CRON_SECRET` (the latter matching
the Vercel environment variable). `workflow_dispatch` is enabled, so a send can be triggered
by hand from the Actions tab without waiting for the hour.

## Maintenance

Templates are rendered **once at enrollment** and frozen into the step rows, so editing a
template does not change emails that are already queued. After fixing a template, clear the
queue and re-enroll:

```bash
npx tsx scripts/reset-pending.ts            # dry run — shows what would go
npx tsx scripts/reset-pending.ts --confirm  # deletes pending steps only
```

Note that open rate is deliberately not tracked: messages are sent as plain text, and
Mailgun's open tracking needs an HTML pixel, so the number could only ever read 0%. Bounce
rate takes its place on the dashboard, turning amber at 2% and red at 3%.

## Project structure

```
/app
  /page.tsx                    Dashboard (stats, pipeline kanban, activity feed)
  /contacts                    List, add, import (CSV), detail + edit
  /sequences                   List, builder, detail + enroll + preview
  /api
    /contacts, /sequences      REST CRUD
    /send                      Cron: finds due steps, sends via Mailgun
    /webhooks/mailgun          Delivery/open/click/reply tracking, auto-stop on reply
/lib
  mailgun.ts, hubspot.ts       Thin API clients
  hubspotSync.ts               Orchestrates local DB <-> HubSpot sync
  variables.ts                 {{name}} / {{company}} / ... template rendering
  csv.ts                       CSV parsing for contact import
/prisma
  schema.prisma                Contact, Sequence, SequenceTemplate, SequenceStep, HubSpotSync
```
