import crypto from "crypto";

const MAILGUN_API_KEY = process.env.MAILGUN_API_KEY!;
const MAILGUN_DOMAIN = process.env.MAILGUN_DOMAIN!;
const MAILGUN_FROM = process.env.MAILGUN_FROM!;
const MAILGUN_WEBHOOK_SIGNING_KEY = process.env.MAILGUN_WEBHOOK_SIGNING_KEY;

export type SendEmailResult = {
  id: string;
};

export async function sendEmail({
  to,
  subject,
  text,
}: {
  to: string;
  subject: string;
  text: string;
}): Promise<SendEmailResult> {
  const body = new URLSearchParams({
    from: MAILGUN_FROM,
    to,
    subject,
    text,
  });

  const res = await fetch(`https://api.mailgun.net/v3/${MAILGUN_DOMAIN}/messages`, {
    method: "POST",
    headers: {
      Authorization: "Basic " + Buffer.from(`api:${MAILGUN_API_KEY}`).toString("base64"),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });

  const data = await res.json();

  if (!res.ok) {
    throw new Error(data.message || `Mailgun send failed with status ${res.status}`);
  }

  return { id: data.id };
}

export function verifyMailgunSignature({
  timestamp,
  token,
  signature,
}: {
  timestamp: string;
  token: string;
  signature: string;
}): boolean {
  if (!MAILGUN_WEBHOOK_SIGNING_KEY) return false;

  const expected = crypto
    .createHmac("sha256", MAILGUN_WEBHOOK_SIGNING_KEY)
    .update(timestamp + token)
    .digest("hex");

  const expectedBuf = Buffer.from(expected, "hex");
  const signatureBuf = Buffer.from(signature, "hex");

  if (expectedBuf.length !== signatureBuf.length) return false;
  return crypto.timingSafeEqual(expectedBuf, signatureBuf);
}
