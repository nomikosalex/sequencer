import type { Contact } from "@prisma/client";

const CONSTANTS = {
  portfolioLink: process.env.PORTFOLIO_URL || "YOUR_NOTION_URL",
  githubLink: process.env.GITHUB_URL || "https://github.com/nomikosalex",
};

export function renderTemplate(
  template: string,
  contact: Pick<Contact, "name" | "company" | "title" | "customLine">
): string {
  // An empty name would otherwise render "Hi ," — worse than no greeting.
  const firstName = contact.name?.trim().split(" ")[0] || "there";

  return template
    .replace(/\{\{name\}\}/g, firstName)
    .replace(/\{\{fullName\}\}/g, contact.name)
    .replace(/\{\{company\}\}/g, contact.company)
    .replace(/\{\{title\}\}/g, contact.title || "")
    .replace(/\{\{customLine\}\}/g, contact.customLine || "")
    .replace(/\{\{portfolioLink\}\}/g, CONSTANTS.portfolioLink)
    .replace(/\{\{githubLink\}\}/g, CONSTANTS.githubLink);
}
