import type { Contact } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  createHubspotContact,
  createHubspotDeal,
  moveDealStage,
  logHubspotEmail,
} from "@/lib/hubspot";

const HUBSPOT_ENABLED = Boolean(
  process.env.HUBSPOT_ACCESS_TOKEN && process.env.HUBSPOT_PIPELINE_ID
);

export async function syncContactToHubspot(contact: Contact): Promise<void> {
  if (!HUBSPOT_ENABLED) return;

  try {
    const hubspotContactId = await createHubspotContact(contact);
    await prisma.contact.update({
      where: { id: contact.id },
      data: { hubspotId: hubspotContactId },
    });

    if (!process.env.HUBSPOT_STAGE_TARGET) return;

    const dealId = await createHubspotDeal({
      dealname: `${contact.name} — ${contact.company}`,
      contactHubspotId: hubspotContactId,
      dealstage: process.env.HUBSPOT_STAGE_TARGET,
    });
    await prisma.hubSpotSync.create({
      data: { entityType: "deal", entityId: contact.id, hubspotId: dealId },
    });
  } catch (err) {
    console.error("HubSpot contact sync failed:", err);
  }
}

export async function logStepSentToHubspot(
  step: { subject: string; body: string },
  contact: Contact
): Promise<void> {
  if (!HUBSPOT_ENABLED || !contact.hubspotId) return;

  try {
    await logHubspotEmail({
      contactHubspotId: contact.hubspotId,
      subject: step.subject,
      text: step.body,
      status: "SENT",
    });
  } catch (err) {
    console.error("HubSpot email log failed:", err);
  }
}

export const PIPELINE_STAGES = ["target", "contacted", "replied", "call_booked", "offer"] as const;
export type PipelineStage = (typeof PIPELINE_STAGES)[number];

const PIPELINE_STAGE_TO_HUBSPOT: Record<PipelineStage, string | undefined> = {
  target: process.env.HUBSPOT_STAGE_TARGET,
  contacted: process.env.HUBSPOT_STAGE_CONTACTED,
  replied: process.env.HUBSPOT_STAGE_REPLIED,
  call_booked: process.env.HUBSPOT_STAGE_CALL_BOOKED,
  offer: process.env.HUBSPOT_STAGE_OFFER,
};

export async function setPipelineStage(
  contactId: string,
  stage: PipelineStage
): Promise<void> {
  await prisma.contact.update({
    where: { id: contactId },
    data: { pipelineStage: stage },
  });

  if (!HUBSPOT_ENABLED) return;
  const hubspotStageId = PIPELINE_STAGE_TO_HUBSPOT[stage];
  if (!hubspotStageId) return;

  try {
    const sync = await prisma.hubSpotSync.findFirst({
      where: { entityType: "deal", entityId: contactId },
    });
    if (!sync) return;

    await moveDealStage(sync.hubspotId, hubspotStageId);
    await prisma.hubSpotSync.update({
      where: { id: sync.id },
      data: { lastSynced: new Date() },
    });
  } catch (err) {
    console.error("HubSpot deal stage update failed:", err);
  }
}
