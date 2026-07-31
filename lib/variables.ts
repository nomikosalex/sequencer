import type { Contact } from "@prisma/client";

const CONSTANTS = {
  portfolioLink: process.env.PORTFOLIO_URL || "YOUR_NOTION_URL",
  githubLink: process.env.GITHUB_URL || "https://github.com/nomikosalex",
};

export function renderTemplate(
  template: string,
  contact: Pick<Contact, "name" | "company" | "title">
): string {
  return template
    .replace(/\{\{name\}\}/g, contact.name.split(" ")[0])
    .replace(/\{\{fullName\}\}/g, contact.name)
    .replace(/\{\{company\}\}/g, contact.company)
    .replace(/\{\{title\}\}/g, contact.title || "")
    .replace(/\{\{portfolioLink\}\}/g, CONSTANTS.portfolioLink)
    .replace(/\{\{githubLink\}\}/g, CONSTANTS.githubLink);
}
