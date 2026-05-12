type StoredFile = { filename: string; csv: string; createdAt: number };

const g = globalThis as unknown as { __fileStore?: Map<string, StoredFile> };
export const fileStore: Map<string, StoredFile> =
  g.__fileStore ?? (g.__fileStore = new Map());

export function putCsv(filename: string, csv: string): string {
  const id = crypto.randomUUID();
  fileStore.set(id, { filename, csv, createdAt: Date.now() });
  return id;
}

export function escapeCsvCell(v: string): string {
  return /[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

export type CsvRow = {
  title: string;
  date: string;
  excerpt: string;
  link: string;
};

export function rowsToCsv(rows: CsvRow[]): string {
  const header = "Title,Date,Excerpt,Link";
  const body = rows
    .map((r) =>
      [r.title, r.date, r.excerpt, r.link].map(escapeCsvCell).join(","),
    )
    .join("\n");
  return header + "\n" + body + "\n";
}
