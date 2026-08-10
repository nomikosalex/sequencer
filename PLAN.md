# OUTREACH SEQUENCER — Master Build Plan

> This is the single source of truth for this project.
> If anything changes in scope, features, or architecture — update THIS file first.
> Claude Code: always read this file before starting any task. If it conflicts with
> a previous instruction, THIS file wins.

---

## What this is

A personal cold outreach sequencer built by Alexandros Nomikos as both:
1. A real tool to run his GTM engineering job search (15 target companies)
2. A portfolio piece that demonstrates GTM engineering skills

The tool automates multi-step email sequences, tracks opens/replies,
auto-stops when someone responds, and syncs everything to HubSpot CRM.

## Who built this and why

Alexandros is a 19-year-old Economics student at AUEB (Athens) learning GTM engineering.
He already built a full booking engine (Nommar) with Next.js/Prisma/PostgreSQL.
This project uses the same stack but applies it to outbound sales automation.
The goal: use it for his own job search AND show it in interviews as proof of GTM skills.

---

## Stack

- **Framework:** Next.js 16 (App Router) — scaffolded via `create-next-app@latest`. Route `params` and `searchParams` are
  Promises in this version (`const { id } = await params`). Pages/route handlers that read data live (not via `fetch`)
  must export `export const dynamic = "force-dynamic"` or they get statically prerendered at build time and serve stale
  data — every page under `app/` that queries Prisma directly does this.
- **Database:** PostgreSQL + Prisma ORM (Prisma 7). Prisma 7 requires a driver adapter at runtime — no more zero-config
  `new PrismaClient()`. Setup: `prisma/schema.prisma` has no `url` in the datasource block; the connection string lives in
  `prisma.config.ts` (used by the Prisma CLI for migrate/generate) and in `lib/prisma.ts`, which builds the client with
  `@prisma/adapter-pg` (`PrismaPg({ connectionString: process.env.DATABASE_URL })`). Always import the client from
  `lib/prisma.ts`, never instantiate `new PrismaClient()` directly elsewhere.
- **Hosting DB:** Neon Postgres, provisioned via the Vercel Marketplace integration (`vercel install neon`) and linked to
  the `outreach-sequencer` Vercel project. `DATABASE_URL` lives in `.env` (used by Prisma CLI/scripts) and `.env.local`
  (pulled via `vercel env`/`vercel install`, used by Next.js dev server). Both are gitignored.
- **Email provider:** Mailgun (free tier — 5,000 emails/month)
  - ⚠️ NOT Resend. Resend is transactional only. Mailgun supports cold outbound.
- **CRM integration:** HubSpot Free CRM (via REST API)
- **Deployment:** Vercel (including Vercel Cron for scheduled sends)
- **Styling:** Tailwind CSS
- **Language:** TypeScript

---

## Database Schema

```prisma
model Contact {
  id          String         @id @default(cuid())
  name        String
  email       String         @unique
  company     String
  linkedinUrl String?
  title       String?        // e.g. "CEO", "Head of Growth"
  leadScore   Int            @default(0)
  status      String         @default("active")
  // active = in sequence
  // replied = got response (auto-stop)
  // bounced = email bounced
  // completed = sequence finished, no reply
  hubspotId   String?        // HubSpot contact ID after sync
  pipelineStage String       @default("target")
  // target = not contacted yet
  // contacted = at least one sequence step sent
  // replied = contact replied
  // call_booked = manually marked, or dragged in dashboard kanban
  // offer = dragged in dashboard kanban (no dedicated trigger elsewhere)
  // Mirrors the HubSpot deal pipeline stage (see HUBSPOT_STAGE_* env vars) but
  // is its own local field/slug set — decoupled from HubSpot's portal-specific
  // internal stage ids so the dashboard kanban works even without HubSpot configured.
  notes       String?
  customLine  String?        // personalized opening line for outreach, different per contact
  createdAt   DateTime       @default(now())
  updatedAt   DateTime       @updatedAt
  steps       SequenceStep[]
}

model Sequence {
  id          String           @id @default(cuid())
  name        String           // e.g. "GTM Internship Outreach"
  description String?
  isActive    Boolean          @default(true)
  createdAt   DateTime         @default(now())
  templates   SequenceTemplate[]
  steps       SequenceStep[]
}

model SequenceTemplate {
  id          String   @id @default(cuid())
  sequence    Sequence @relation(fields: [sequenceId], references: [id], onDelete: Cascade)
  sequenceId  String
  stepNumber  Int      // 1, 2, 3...
  delayDays   Int      // days after previous step (step 1 = days after enrollment)
  subject     String   // supports {{name}}, {{company}}, {{title}}
  body        String   // supports {{name}}, {{company}}, {{title}}, {{portfolioLink}}
  createdAt   DateTime @default(now())

  @@unique([sequenceId, stepNumber])
}

model SequenceStep {
  id          String    @id @default(cuid())
  contact     Contact   @relation(fields: [contactId], references: [id], onDelete: Cascade)
  contactId   String
  sequence    Sequence  @relation(fields: [sequenceId], references: [id], onDelete: Cascade)
  sequenceId  String
  stepNumber  Int
  subject     String    // rendered (variables replaced)
  body        String    // rendered (variables replaced)
  sendAt      DateTime  // calculated: enrollment date + sum of delayDays
  sentAt      DateTime? // null = not sent yet
  openedAt    DateTime? // set by Mailgun webhook
  clickedAt   DateTime? // set by Mailgun webhook
  repliedAt   DateTime? // set by Mailgun webhook
  status      String    @default("pending")
  // pending = waiting to send
  // sending = transient: atomically claimed by /api/send, about to call Mailgun
  //           (prevents a duplicate cron invocation from double-sending)
  // sent = Mailgun API accepted the send request (does NOT mean delivered — see "delivered")
  // delivered = Mailgun's `delivered` webhook confirmed actual delivery to the recipient's server
  // opened = recipient opened (webhook), can arrive from "sent" or "delivered"
  // replied = recipient replied (triggers auto-stop)
  // skipped = skipped because contact replied to earlier step
  // failed = send failed, or Mailgun's `failed` webhook reported a bounce
  mailgunId   String?   // Mailgun message ID for tracking
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt // used to sort the dashboard's recent activity feed

  @@unique([contactId, sequenceId, stepNumber])
}

model HubSpotSync {
  id          String   @id @default(cuid())
  entityType  String   // "contact", "deal", "email"
  entityId    String   // local ID
  hubspotId   String   // HubSpot ID
  lastSynced  DateTime @default(now())
}
```

---

## Project Structure

```
/app
  /page.tsx                    → Dashboard (main view)
  /contacts
    /page.tsx                  → Contact list with filters + search
    /new/page.tsx              → Add contact form
    /[id]/page.tsx             → Contact detail + timeline
    /import/page.tsx           → CSV import
  /sequences
    /page.tsx                  → Sequence list
    /new/page.tsx              → Sequence builder (add steps)
    /[id]/page.tsx             → Sequence detail + enrolled contacts
    /[id]/enroll/page.tsx      → Enroll contacts into sequence
  /api
    /contacts/route.ts         → CRUD contacts
    /sequences/route.ts        → CRUD sequences
    /sequences/enroll/route.ts → Enroll contact → create steps with calculated dates
    /send/route.ts             → Cron endpoint: find pending steps, send via Mailgun
    /webhooks/mailgun/route.ts → Receive open/reply/bounce events
    /hubspot/sync/route.ts     → Push to HubSpot: contacts, deals, activities
/lib
  /mailgun.ts                  → Mailgun API: send email, verify webhook signature
  /hubspot.ts                  → HubSpot API: create contact, create deal, log email, move deal stage
  /variables.ts                → Replace {{name}}, {{company}}, {{title}}, {{portfolioLink}}
  /scoring.ts                  → Lead scoring logic
  /constants.ts                → Pipeline stage IDs, default values
/prisma
  /schema.prisma
  /seed.ts                     → Seed with 15 target companies
/public
  /templates                   → Default email templates (optional)
```

---

## Core Features

### 1. Contact Management
- Add contact manually (name, email, company, LinkedIn URL, title)
- Import contacts from CSV (columns: name, email, company, linkedin, title)
- Edit and delete contacts
- Lead score display (calculated from constants in /lib/scoring.ts)
- Status badges: active (green), replied (blue), bounced (red), completed (gray)
- Search and filter by company, status, score

### 2. Sequence Builder
- Create named sequences with description
- Add N template steps, each with:
  - Step number (auto-increment)
  - Delay in days from previous step
  - Subject line (with variable support)
  - Body (with variable support, rich text or markdown)
- Preview rendered email for a specific contact before activating
- Edit sequence templates (only affects future sends, not already-sent steps)

### 3. Enrollment
- Select contacts → enroll in a sequence
- On enrollment, create SequenceStep rows:
  - Step 1 sendAt = now + template.delayDays
  - Step N sendAt = enrollment + sum(delayDays for steps 1..N)
- Validate: don't enroll same contact in same sequence twice
- Bulk enroll from contact list

### 4. Auto-Sender (Cron Job)
- Endpoint: /api/send
- Trigger: Vercel Cron, every 60 minutes
- Logic:
  ```
  1. Find all SequenceSteps where:
     - status = "pending"
     - sendAt <= now
     - contact.status = "active"
  2. For each step:
     a. Render subject + body (replace variables)
     b. Send via Mailgun API
     c. Update step: status = "sent", sentAt = now, mailgunId = response.id
     d. Log email activity to HubSpot
  3. Error handling:
     - If Mailgun returns error → status = "failed"
     - If email bounces (via webhook) → contact.status = "bounced", skip remaining steps
  ```
- vercel.json cron config:
  ```json
  {
    "crons": [
      {
        "path": "/api/send",
        "schedule": "0 8 * * *"
      }
    ]
  }
  ```
  ⚠️ Vercel's Hobby (free) plan only allows cron jobs to run **once per day** — an hourly schedule fails deployment.
  Set to run once daily instead. If this project ever moves to a Pro plan, this can go back to hourly (`0 * * * *`).
- ⚠️ Vercel cron delivery is best-effort, not exactly-once — the same scheduled run can occasionally fire twice.
  `/api/send` atomically claims each step (`pending` → `sending` via a conditional `updateMany`) before calling
  Mailgun, so a duplicate invocation can't email the same contact twice.
- **Send jitter (deliverability):** a random 5-30s delay is inserted between consecutive sends within a single
  `/api/send` run (not before the first one) so a batch doesn't fire in a multi-second burst — bursty sending from
  a low-reputation/new domain is a strong spam signal. `export const maxDuration = 300` (Hobby's max/default with
  fluid compute) is set explicitly on the route; if a large batch wouldn't fit in the time budget, remaining steps
  are simply left `pending` (untouched, still claimable) and picked up by the next day's cron run rather than risking
  the function being killed mid-send.

### 5. Webhook Handler (Mailgun Events)
- Endpoint: /api/webhooks/mailgun
- Verify Mailgun webhook signature (IMPORTANT for security)
- Handle events:
  - `delivered` → update step status from "sent" to "delivered" (distinct from "sent" = API-accepted;
    see status enum comment on `SequenceStep.status` in the schema above)
  - `opened` → update step openedAt = now
  - `clicked` → update step clickedAt = now
  - `complained` or `unsubscribed` → contact.status = "unsubscribed", skip remaining
  - `failed` or `bounced` → contact.status = "bounced", skip remaining
- **Auto-stop on reply:**
  - When reply detected → contact.status = "replied"
  - All remaining pending steps for this contact → status = "skipped"
  - Move HubSpot deal to "Replied" stage

### 6. HubSpot Integration
- **On contact create:**
  - POST /crm/v3/objects/contacts → create HubSpot contact
  - POST /crm/v3/objects/deals → create deal in "Job Search" pipeline
  - Associate contact ↔ deal
  - Store hubspotId locally
- **On email sent:**
  - POST /crm/v3/objects/emails → log email as engagement on contact timeline
- **On reply received:**
  - PATCH /crm/v3/objects/deals/{id} → move deal to "Replied" stage
- **On call booked (manual trigger from dashboard):**
  - PATCH /crm/v3/objects/deals/{id} → move deal to "Call Booked" stage
- Auth: Private app token (Settings → Integrations → Private Apps)
- Rate limit: 100 requests per 10 seconds (batch if needed)

### 7. Dashboard
Main page with:
- **Stats bar:** Total contacts, Active sequences, Emails sent, Open rate %, Reply rate %
- **Pipeline view:** Visual kanban (Target → Contacted → Replied → Call Booked → Offer)
  - Cards show: contact name, company, last activity, lead score
  - Drag to move stages (updates HubSpot too)
- **Recent activity feed:** "Email sent to Bill @ SalesCaptain" / "Reply from Jai @ Deepline"
- **Sequence performance:** Per-sequence stats (sent, opened, replied per step)

---

## Template Variables

Available in subject and body fields:

| Variable | Replaced with |
|---|---|
| {{name}} | Contact first name |
| {{fullName}} | Contact full name |
| {{company}} | Contact company name |
| {{title}} | Contact job title |
| {{customLine}} | Personalized opening line, set per contact on the edit page |
| {{portfolioLink}} | Notion portfolio URL (constant) |
| {{githubLink}} | GitHub profile URL (constant) |

Implementation in /lib/variables.ts:
```typescript
const CONSTANTS = {
  portfolioLink: "YOUR_NOTION_URL",
  githubLink: "https://github.com/nomikosalex",
};

export function renderTemplate(template: string, contact: Contact): string {
  return template
    .replace(/\{\{name\}\}/g, contact.name.split(" ")[0])
    .replace(/\{\{fullName\}\}/g, contact.name)
    .replace(/\{\{company\}\}/g, contact.company)
    .replace(/\{\{title\}\}/g, contact.title || "")
    .replace(/\{\{portfolioLink\}\}/g, CONSTANTS.portfolioLink)
    .replace(/\{\{githubLink\}\}/g, CONSTANTS.githubLink);
}
```

---

## Lead Scoring (for reference)

```typescript
// /lib/scoring.ts
export function calculateScore(contact: ContactInput): number {
  let score = 0;

  // Company fit
  if (contact.tags?.includes("b2b-saas") || contact.tags?.includes("gtm-agency")) score += 25;
  if (contact.companySize >= 10 && contact.companySize <= 200) score += 15;
  if (contact.stage === "seed" || contact.stage === "series-a" || contact.stage === "series-b") score += 10;
  if (contact.location === "athens") score += 10;
  if (contact.remote) score += 5;

  // Buying signals
  if (contact.usesGtmTools) score += 20;  // Clay, HubSpot, Apollo
  if (contact.noGtmEngineer) score += 20;
  if (contact.recentFunding) score += 10;
  if (contact.founderActiveLinkedIn) score += 10;
  if (contact.recentGtmHiring) score += 15;

  // Access signals
  if (contact.founderIsGreek) score += 10;
  if (contact.mutualConnection) score += 10;

  return score;
}
```

---

## Default Email Sequence: "GTM Internship Outreach"

### Step 1 — Day 0: First touch
Subject: "Quick question, {{name}}"
```
Hi {{name}},

I'm Alexandros — 19, Economics student in Athens, building revenue
infrastructure with AI tools.

I just shipped a full booking engine for a spa in Santorini — pricing
model, break-even analysis, no-show tracking, all from scratch. Now
I'm building my own outbound sequencer (yes, this email is sent by it).

I see {{company}} is doing interesting work in GTM and I'd love to
learn from your team. Would you be open to a 10-minute call?

Portfolio: {{portfolioLink}}
GitHub: {{githubLink}}

Alexandros
```

### Step 2 — Day 3: Follow-up
Subject: "Re: Quick question, {{name}}"
```
Hi {{name}},

Just bumping this — I know inboxes get busy.

One thing I forgot to mention: I just passed the HubSpot Sales Hub
certification and I'm currently learning Clay and building enrichment
workflows.

If 10 minutes works, I'm flexible on timing.

Alexandros
```

### Step 3 — Day 7: Final
Subject: "Last one, {{name}}"
```
Hi {{name}},

Last follow-up, I promise.

If the timing isn't right, no worries at all — I'll keep building
and posting. But if {{company}} ever needs someone who can build
GTM infrastructure and thinks in unit economics, I'm your person.

{{portfolioLink}}

Alexandros
```

---

## Seed Data: 15 Target Companies

```typescript
// /prisma/seed.ts
const targets = [
  { name: "Bill Stathopoulos", email: "TBD", company: "SalesCaptain", title: "CEO", linkedinUrl: "TBD", leadScore: 90 },
  { name: "TBD", email: "TBD", company: "Surface Labs", title: "Founder", linkedinUrl: "TBD", leadScore: 85 },
  { name: "TBD", email: "TBD", company: "Aviator", title: "Founder", linkedinUrl: "TBD", leadScore: 85 },
  { name: "TBD", email: "TBD", company: "Structured AI", title: "Founder", linkedinUrl: "TBD", leadScore: 80 },
  { name: "TBD", email: "TBD", company: "Workable", title: "Head of Growth", linkedinUrl: "TBD", leadScore: 45 },
  { name: "TBD", email: "TBD", company: "Blueground", title: "Head of Growth", linkedinUrl: "TBD", leadScore: 45 },
  { name: "TBD", email: "TBD", company: "Epignosis", title: "Head of Growth", linkedinUrl: "TBD", leadScore: 40 },
  { name: "TBD", email: "TBD", company: "Persado", title: "VP Growth", linkedinUrl: "TBD", leadScore: 40 },
  { name: "TBD", email: "TBD", company: "Hack The Box", title: "Head of Growth", linkedinUrl: "TBD", leadScore: 40 },
  // Fill remaining 6 from LinkedIn SalesNav research
];
```

---

## Environment Variables

```env
# Database
DATABASE_URL="postgresql://..."

# Mailgun
MAILGUN_API_KEY="key-..."
MAILGUN_DOMAIN="mail.yourdomain.com"
MAILGUN_FROM="Alexandros Nomikos <alex@yourdomain.com>"
MAILGUN_WEBHOOK_SIGNING_KEY="..."

# HubSpot
HUBSPOT_ACCESS_TOKEN="pat-..."
HUBSPOT_PIPELINE_ID="..."           # "Job Search" pipeline ID
HUBSPOT_STAGE_TARGET="..."          # Stage IDs from HubSpot
HUBSPOT_STAGE_CONTACTED="..."
HUBSPOT_STAGE_REPLIED="..."
HUBSPOT_STAGE_CALL_BOOKED="..."
HUBSPOT_STAGE_OFFER="..."

# Cron security
CRON_SECRET="..."                   # Verify Vercel Cron calls

# App
NEXT_PUBLIC_APP_URL="https://..."
PORTFOLIO_URL="YOUR_NOTION_URL"
GITHUB_URL="https://github.com/nomikosalex"
```

---

## Build Order

### Day 1: Foundation + Contacts
1. `npx create-next-app@latest outreach-sequencer --typescript --tailwind --app`
2. Set up Prisma + PostgreSQL (Vercel Postgres or Supabase)
3. Create schema, run migration
4. Build Contact CRUD: list page, add form, detail page
5. Build CSV import (/contacts/import)
6. Basic layout with sidebar navigation

### Day 2: Sequences + Enrollment
1. Build Sequence CRUD: list, create with template steps
2. Build enrollment flow: select contacts → assign to sequence → create SequenceStep rows with calculated sendAt dates
3. Build sequence detail page: show enrolled contacts + step statuses
4. Implement /lib/variables.ts for template rendering
5. Add email preview (render template with real contact data)

### Day 3: Mailgun + Auto-Sender
1. Set up Mailgun account (free tier)
2. Implement /lib/mailgun.ts (send email function)
3. Build /api/send cron endpoint (find pending → send → update)
4. Build /api/webhooks/mailgun (handle open/reply/bounce)
5. Implement auto-stop logic (reply → skip remaining steps)
6. Configure Vercel Cron in vercel.json
7. Test with your own email first

### Day 4: HubSpot Integration
1. Create HubSpot Private App (Settings → Integrations → Private Apps)
2. Implement /lib/hubspot.ts:
   - createContact()
   - createDeal()
   - logEmail()
   - moveDealStage()
3. Wire up: contact create → HubSpot sync
4. Wire up: email sent → log to HubSpot
5. Wire up: reply received → move deal stage
6. Build manual "Move to Call Booked" button on contact detail page

### Day 5: Dashboard + Polish
1. Build main dashboard:
   - Stats bar (total contacts, emails sent, open rate, reply rate)
   - Pipeline kanban view
   - Recent activity feed
   - Per-sequence performance table
2. Add lead score badges to contact cards
3. Responsive design (mobile-friendly)
4. Error handling and loading states
5. Deploy to Vercel

### Day 6: Ship
1. Write README (Nommar quality — what it does, why, how, stack, screenshots)
2. Add GitHub topics and description
3. Seed with 15 real targets (after enrichment with Prospeo)
4. Send first sequence
5. Post on LinkedIn: "I built my own outbound sequencer to run my job search as a GTM pipeline"

---

## Important Constraints

- ⚠️ DO NOT use Resend for this project. Resend is for transactional email.
  Mailgun free tier supports outbound and includes tracking.
- ⚠️ DO NOT send test emails to real targets during development.
  Use your own email to test. Switch to real targets only when fully tested.
- ⚠️ Verify Mailgun webhook signatures. Don't accept unverified webhook calls.
- ⚠️ Rate limit HubSpot API calls: max 100 per 10 seconds.
- ⚠️ Add CRON_SECRET check to /api/send so it can't be triggered externally.
- ⚠️ Git: add .env to .gitignore. Never commit API keys.
- ⚠️ Mailgun requires domain verification for production sending.
  During development, use the sandbox domain (limited to verified recipients).

---

## Domain Setup for Cold Email

Cold email should NOT come from a personal domain you care about.
Buy a secondary domain (e.g. alexnomikos.com or nomikos-outreach.com) for ~€10/year.
Point Mailgun DNS records to this domain.
This protects your main email reputation.

---

## After Launch: Metrics to Track

Track these weekly in the dashboard:
- **Delivery rate:** emails delivered / emails sent (should be >95%)
- **Open rate:** unique opens / delivered (target: 40-60% for personalized cold)
- **Reply rate:** replies / delivered (target: 10-20% for warm outreach)
- **Bounce rate:** bounces / sent (should be <5%, if higher → email quality issue)
- **Sequence completion rate:** contacts who completed all steps / enrolled
- **Pipeline conversion:** Target → Contacted → Replied → Call → Offer

---

## Future Enhancements (after MVP)

- [ ] A/B testing: two versions of step 1, track which gets more replies
- [ ] LinkedIn step reminders: "Send LinkedIn message to {{name}} today"
- [ ] AI email writer: generate personalized body based on company research
- [ ] Deepline integration: auto-enrich contacts when added
- [ ] Multi-channel: add LinkedIn DM step tracking (manual + reminder)
- [ ] Unsubscribe link: required for compliance in some jurisdictions
- [ ] Email warmup tracking: monitor domain reputation

---

## Change Log

| Date | Change | Reason |
|------|--------|--------|
| 2026-07-31 | Initial spec created | Project kickoff |
| 2026-07-31 | Switched Prisma connection setup to driver-adapter pattern (`@prisma/adapter-pg` + `prisma.config.ts`) instead of `url` in `schema.prisma` | npm installed Prisma 7, which made the old zero-config `datasource url` + `new PrismaClient()` pattern invalid |
| 2026-07-31 | DB provisioned as Neon Postgres via Vercel Marketplace integration instead of "Vercel Postgres" / Supabase | No local Postgres/Docker/Homebrew available for local dev; user chose Vercel-integrated Postgres, which is now Neon under the hood |
| 2026-07-31 | `/api/send` cron changed from hourly (`0 * * * *`) to once daily (`0 8 * * *`); added atomic step-claiming before send | Vercel Hobby plan only permits daily cron jobs (hourly fails deployment); Vercel cron delivery is best-effort and can double-invoke, so sends must be idempotent to avoid emailing a contact twice |
| 2026-07-31 | Reply detection (`Auto-stop on reply`) is implemented in `/api/webhooks/mailgun` as a second payload shape (form-encoded inbound message, matched by sender email) alongside the JSON tracking-event shape | Mailgun's engagement webhooks (delivered/opened/clicked/etc.) don't include actual reply detection — that requires a Mailgun Route forwarding inbound mail to this same endpoint, which itself requires the domain to be verified with MX records (see "Domain Setup for Cold Email" below). Not testable on the sandbox domain until that's set up. |
| 2026-07-31 | HubSpot "Job Search pipeline" is the account's single default deal pipeline (`HUBSPOT_PIPELINE_ID=default`) with its stages relabeled to Target/Contacted/Replied/Call booked/Offer/Closed Won/Closed Lost, instead of a newly created pipeline | HubSpot's free tier only allows one deal pipeline; user relabeled the existing one instead. Stage IDs are still the original HubSpot internal ids (`appointmentscheduled`, `qualifiedtobuy`, `presentationscheduled`, `decisionmakerboughtin`, `contractsent`) — only the display labels changed. |
| 2026-07-31 | Added `Contact.pipelineStage` field (target/contacted/replied/call_booked/offer, default "target") | The Day 5 dashboard kanban (Target → Contacted → Replied → Call Booked → Offer) needs a local field to render/drag — nothing in the original schema tracked deal-pipeline position, only `Contact.status` (a different concept: sequence lifecycle, not deal stage). Kept as local slugs decoupled from HubSpot's portal-specific stage ids so the kanban still works with HubSpot unconfigured. |
| 2026-07-31 | Added `SequenceStep.updatedAt` (`@updatedAt`) | The Day 5 dashboard "recent activity feed" needs to sort by when a step was last touched (sent/opened/clicked/replied/failed). The original schema only had `createdAt`, set at enrollment time — sorting by that would show newly-enrolled steps, not recent events. |
| 2026-08-02 | Added `"postinstall": "prisma generate"` to `package.json` | First Vercel deploy failed the build (`Module "@prisma/client" has no exported member 'Prisma'`) — locally the client had always been generated manually via `npx prisma generate`/`migrate dev`, but Vercel's `npm install` doesn't run that on its own, so the deployed build had an empty, ungenerated client. |
| 2026-08-02 | Added `.vercelignore` (excludes `.env`, `.env.local`, etc.) | `vercel deploy`'s upload does not reliably honor `.gitignore` the way `git` does — the first production deploy included the real `.env` (all secrets in plaintext) in its source bundle. Not publicly web-accessible, but not acceptable either. Redeployed clean and deleted the old deployment via `vercel remove` to purge it from Vercel's storage. |
| 2026-08-04 | Switched `MAILGUN_DOMAIN`/`MAILGUN_FROM` from the sandbox domain to the verified `alexnomikos.com` custom domain; added the real `MAILGUN_WEBHOOK_SIGNING_KEY` | Domain was DNS-verified in Mailgun (user's own setup, confirmed via `GET /v4/domains` → `state: active`) per the "Domain Setup for Cold Email" section below. Verified with a real send+delivery to a personal inbox before touching Vercel, then updated Vercel env vars and redeployed. Registered all 6 webhook event types (delivered/opened/clicked/unsubscribed/complained/permanent_fail) via the Mailgun API pointing at the production `/api/webhooks/mailgun` URL, and confirmed via Vercel's runtime logs that real incoming Mailgun webhook calls return 200 (signature verification passing) rather than the previous fail-closed 401. |
| 2026-08-04 | Added `Contact.customLine` field + `{{customLine}}` template variable | Per-contact personalized opening line for outreach emails — every other template variable is either a fixed contact field (name/company/title) or a global constant; this is the one that needs to be hand-written per contact before enrollment. |
| 2026-08-10 | Deliverability review after first real batch (10 sends, then 9 more) showed 0/19 opens. Root causes found and fixed: (1) `PORTFOLIO_URL` was never set, so every real email sent so far contained the literal broken text "Portfolio: YOUR_NOTION_URL" instead of a link — now set to the real Notion URL; (2) Mailgun's domain-level open tracking was off (fixed 2026-08-07, separate from this batch of fixes) so opens were structurally impossible to record regardless of recipient behavior; (3) added 5-30s send jitter (see "Send jitter" note above) since the original batch fired 10 emails in ~8 seconds — a spam signal for a domain that was only 2 days old at first send; (4) split `SequenceStep.status` "sent" (API-accepted) from a new "delivered" state (Mailgun's delivery webhook confirmed), previously conflated into one "sent" value | User-requested deliverability audit. While verifying the sent/delivered split, found and fixed a related race condition: Mailgun's `delivered` webhook can arrive before `/api/send`'s own DB write of the step's `mailgunId` commits, causing the webhook's lookup to silently miss — and unlike other Mailgun event types, `delivered` webhooks are not retried on failure, so a missed lookup loses the event permanently. Added a bounded retry (up to 6 attempts, 500ms apart) to the webhook's step lookup to close that window; confirmed fixed via a live production test (`status: "delivered"` observed). |
| 2026-08-10 | Ran a real send through mail-tester.com (`test-stw80opuw@srv1.mail-tester.com`) using the actual Step 1 template content, after the above fixes — scored **10/10**. SPF/DKIM/DMARC alignment, content, and blacklist checks all passed. Real targets were on hold pending this result (per "Important Constraints" below); the hold is now lifted for well-formed sends, but the domain is still only ~1 week old with a small sending history, so cadence/volume discipline still matters — see `metrics to track` below for what to watch as real volume resumes. |
