export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];

    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      if (row.length > 1 || row[0] !== "") rows.push(row);
      row = [];
    } else {
      field += char;
    }
  }

  if (field !== "" || row.length > 0) {
    row.push(field);
    if (row.length > 1 || row[0] !== "") rows.push(row);
  }

  return rows;
}

const COLUMN_ALIASES: Record<string, string> = {
  name: "name",
  email: "email",
  company: "company",
  linkedin: "linkedinUrl",
  linkedinurl: "linkedinUrl",
  title: "title",
};

export type ParsedContactRow = {
  name?: string;
  email?: string;
  company?: string;
  linkedinUrl?: string;
  title?: string;
};

export function csvToContactRows(text: string): ParsedContactRow[] {
  const rows = parseCsv(text.trim());
  if (rows.length === 0) return [];

  const header = rows[0].map((h) => h.trim().toLowerCase());
  const fieldIndexes: Record<string, number> = {};
  header.forEach((h, idx) => {
    const field = COLUMN_ALIASES[h];
    if (field) fieldIndexes[field] = idx;
  });

  return rows.slice(1).map((cells) => {
    const contact: ParsedContactRow = {};
    for (const [field, idx] of Object.entries(fieldIndexes)) {
      contact[field as keyof ParsedContactRow] = cells[idx]?.trim();
    }
    return contact;
  });
}
