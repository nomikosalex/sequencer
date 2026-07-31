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
- **Auto-sender** — a scheduled cron job finds due steps and sends them via Mailgun
- **Auto-stop on reply** — a contact replying immediately skips all their remaining scheduled steps
- **HubSpot sync** — every contact becomes a HubSpot contact + deal; sent emails log to the contact timeline; replies and manual "call booked" actions move the deal through pipeline stages
- **Dashboard** — stats (emails sent, open rate, reply rate), a drag-and-drop pipeline kanban (Target → Contacted → Replied → Call Booked → Offer), a recent activity feed, and per-sequence performance

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
