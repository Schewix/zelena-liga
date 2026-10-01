import { slugify } from './admin/helpers';
import { CsvRow } from './pageTypes';

export function escapeCsv(value: string | null | undefined): string {
  const text = (value ?? '').replace(/"/g, '""');
  return `"${text}"`;
}

export function splitCsvLine(line: string): string[] {
  const values: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];

    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (!inQuotes && (ch === ',' || ch === ';')) {
      values.push(current.trim());
      current = '';
      continue;
    }

    current += ch;
  }

  values.push(current.trim());
  return values;
}

export function parseCsv(text: string): CsvRow[] {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (!lines.length) {
    return [];
  }

  const headers = splitCsvLine(lines[0]).map((header) => slugify(header));
  const shortCodeIndex = headers.findIndex((header) => header === 'short-code' || header === 'short_code');
  const teamNameIndex = headers.findIndex((header) => header === 'team-name' || header === 'team_name');
  const displayNameIndex = headers.findIndex(
    (header) => header === 'display-name' || header === 'display_name' || header === 'name',
  );
  const categoryIndex = headers.findIndex((header) => header === 'category' || header === 'kategorie');

  return lines.slice(1).map((line) => {
    const values = splitCsvLine(line);
    return {
      short_code: shortCodeIndex >= 0 ? (values[shortCodeIndex] ?? '').trim().toUpperCase() : '',
      team_name: teamNameIndex >= 0 ? (values[teamNameIndex] ?? '').trim() : '',
      display_name: displayNameIndex >= 0 ? (values[displayNameIndex] ?? '').trim() : '',
      category: categoryIndex >= 0 ? (values[categoryIndex] ?? '').trim() : '',
    };
  });
}

export function randomShortCode(existing: Set<string>): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  for (let attempt = 0; attempt < 64; attempt += 1) {
    let code = '';
    for (let i = 0; i < 6; i += 1) {
      code += chars[Math.floor(Math.random() * chars.length)];
    }
    if (!existing.has(code)) {
      existing.add(code);
      return code;
    }
  }
  return `PL${Date.now().toString(36).toUpperCase().slice(-4)}`;
}
