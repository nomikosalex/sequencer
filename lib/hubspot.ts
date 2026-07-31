const HUBSPOT_BASE_URL = "https://api.hubapi.com";
const HUBSPOT_ACCESS_TOKEN = process.env.HUBSPOT_ACCESS_TOKEN!;
const HUBSPOT_PIPELINE_ID = process.env.HUBSPOT_PIPELINE_ID!;

const ASSOCIATION_TYPE = {
  DEAL_TO_CONTACT: 3,
  EMAIL_TO_CONTACT: 198,
};

async function hubspotFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${HUBSPOT_BASE_URL}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${HUBSPOT_ACCESS_TOKEN}`,
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });

  const data = await res.json().catch(() => null);

  if (!res.ok) {
    throw new Error(
      `HubSpot ${init?.method ?? "GET"} ${path} failed with ${res.status}: ${
        data?.message ?? JSON.stringify(data)
      }`
    );
  }

  return data as T;
}

export async function createHubspotContact(contact: {
  name: string;
  email: string;
  company: string;
  title?: string | null;
}): Promise<string> {
  const [firstname, ...rest] = contact.name.split(" ");
  const lastname = rest.join(" ") || undefined;

  const result = await hubspotFetch<{ id: string }>("/crm/v3/objects/contacts", {
    method: "POST",
    body: JSON.stringify({
      properties: {
        email: contact.email,
        firstname,
        lastname,
        company: contact.company,
        jobtitle: contact.title || undefined,
      },
    }),
  });

  return result.id;
}

export async function createHubspotDeal(deal: {
  dealname: string;
  contactHubspotId: string;
  dealstage: string;
}): Promise<string> {
  const result = await hubspotFetch<{ id: string }>("/crm/v3/objects/deals", {
    method: "POST",
    body: JSON.stringify({
      properties: {
        dealname: deal.dealname,
        pipeline: HUBSPOT_PIPELINE_ID,
        dealstage: deal.dealstage,
      },
      associations: [
        {
          to: { id: deal.contactHubspotId },
          types: [
            {
              associationCategory: "HUBSPOT_DEFINED",
              associationTypeId: ASSOCIATION_TYPE.DEAL_TO_CONTACT,
            },
          ],
        },
      ],
    }),
  });

  return result.id;
}

export async function moveDealStage(dealId: string, dealstage: string): Promise<void> {
  await hubspotFetch(`/crm/v3/objects/deals/${dealId}`, {
    method: "PATCH",
    body: JSON.stringify({ properties: { dealstage } }),
  });
}

export async function logHubspotEmail(email: {
  contactHubspotId: string;
  subject: string;
  text: string;
  status?: "SENT" | "FAILED" | "BOUNCED" | "SCHEDULED" | "SENDING";
}): Promise<void> {
  await hubspotFetch("/crm/v3/objects/emails", {
    method: "POST",
    body: JSON.stringify({
      properties: {
        hs_timestamp: new Date().toISOString(),
        hs_email_direction: "EMAIL",
        hs_email_status: email.status ?? "SENT",
        hs_email_subject: email.subject,
        hs_email_text: email.text,
      },
      associations: [
        {
          to: { id: email.contactHubspotId },
          types: [
            {
              associationCategory: "HUBSPOT_DEFINED",
              associationTypeId: ASSOCIATION_TYPE.EMAIL_TO_CONTACT,
            },
          ],
        },
      ],
    }),
  });
}
