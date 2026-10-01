import ExcelJS from 'exceljs';
import { normalisePatrolCode } from '../../components/PatrolCodeInput';
import { normalizeText } from '../shared/text';

export const BRACKET_EXPORT_ORDER = ['NH', 'ND', 'MH', 'MD', 'SH', 'SD', 'RH', 'RD'] as const;

export const BRACKET_EXPORT_ORDER_INDEX = new Map(BRACKET_EXPORT_ORDER.map((value, index) => [value, index] as const));

export function toBracketKey(category: string | null | undefined, sex: string | null | undefined): string | null {
  const normalizedCategory = normalizeText(category).toUpperCase();
  const normalizedSex = normalizeText(sex).toUpperCase();
  if (!normalizedCategory || !normalizedSex) {
    return null;
  }
  const key = `${normalizedCategory}${normalizedSex}`;
  return BRACKET_EXPORT_ORDER_INDEX.has(key as (typeof BRACKET_EXPORT_ORDER)[number]) ? key : null;
}

export function parsePatrolCodeParts(code: string | null | undefined) {
  const normalizedCode = normalizeText(code).toUpperCase();
  if (!normalizedCode) {
    return { normalizedCode: '', bracketKey: null as string | null, numericPart: null as number | null };
  }
  const match = normalizedCode.match(/^([NMSR])([HD])[- ]?(\d{1,3})$/);
  if (!match) {
    return { normalizedCode, bracketKey: null as string | null, numericPart: null as number | null };
  }
  return {
    normalizedCode,
    bracketKey: `${match[1]}${match[2]}`,
    numericPart: Number.parseInt(match[3], 10),
  };
}

export function comparePatrolOrder(
  a: { patrol_code: string | null; category?: string | null; sex?: string | null },
  b: { patrol_code: string | null; category?: string | null; sex?: string | null },
) {
  const aCode = parsePatrolCodeParts(a.patrol_code);
  const bCode = parsePatrolCodeParts(b.patrol_code);
  const aBracket = toBracketKey(a.category, a.sex) ?? aCode.bracketKey;
  const bBracket = toBracketKey(b.category, b.sex) ?? bCode.bracketKey;
  const aBracketOrder = aBracket ? (BRACKET_EXPORT_ORDER_INDEX.get(aBracket as (typeof BRACKET_EXPORT_ORDER)[number]) ?? Number.MAX_SAFE_INTEGER) : Number.MAX_SAFE_INTEGER;
  const bBracketOrder = bBracket ? (BRACKET_EXPORT_ORDER_INDEX.get(bBracket as (typeof BRACKET_EXPORT_ORDER)[number]) ?? Number.MAX_SAFE_INTEGER) : Number.MAX_SAFE_INTEGER;
  if (aBracketOrder !== bBracketOrder) {
    return aBracketOrder - bBracketOrder;
  }
  if (aCode.numericPart !== null && bCode.numericPart !== null && aCode.numericPart !== bCode.numericPart) {
    return aCode.numericPart - bCode.numericPart;
  }
  if (aCode.numericPart === null && bCode.numericPart !== null) {
    return 1;
  }
  if (aCode.numericPart !== null && bCode.numericPart === null) {
    return -1;
  }
  return aCode.normalizedCode.localeCompare(bCode.normalizedCode, 'cs');
}

export function stripTroopMetadataFromMember(value: string) {
  return value.replace(/\s*\{oddil:[^}]+\}\s*$/i, '').trim();
}

export function extractPatrolMembers(rawNote: string | null | undefined): string[] {
  const normalizedNote = normalizeText(rawNote);
  if (!normalizedNote) {
    return [];
  }

  const lines = normalizedNote
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  if (!lines.length) {
    return [];
  }

  const splitLine = (line: string) => line
    .split(/;|\||,/g)
    .map((value) => stripTroopMetadataFromMember(value))
    .filter(Boolean);

  const firstLineMembers = splitLine(lines[0]);
  if (lines.length === 1) {
    return firstLineMembers;
  }

  if (firstLineMembers.length > 1) {
    return firstLineMembers;
  }

  const allMembers = lines
    .flatMap((line) => splitLine(line))
    .filter((value) => value !== '—' && value !== '-');

  if (allMembers.length === 0) {
    return [];
  }

  const seen = new Set<string>();
  return allMembers.filter((member) => {
    const key = member.toLocaleLowerCase('cs');
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

export function toWorksheetBaseName(value: string, fallback: string) {
  const normalized = normalizeText(value).replace(/[\\/*?:[\]]+/g, ' ').replace(/\s+/g, ' ');
  const cleaned = normalized.trim();
  if (!cleaned) {
    return fallback;
  }
  return cleaned.slice(0, 31);
}

export function toUniqueWorksheetName(baseName: string, usedNames: Set<string>) {
  const fallback = baseName || 'List';
  let candidate = fallback;
  let index = 2;
  while (usedNames.has(candidate)) {
    const suffix = ` (${index})`;
    const trimmedBase = fallback.slice(0, Math.max(1, 31 - suffix.length)).trimEnd();
    candidate = `${trimmedBase}${suffix}`;
    index += 1;
  }
  usedNames.add(candidate);
  return candidate;
}

export function toExportFileName(eventName: string | null | undefined, exportLabel: string) {
  const safeEventName = normalizeText(eventName)
    .replace(/[\\/?%*:|"<>]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/ /g, '-');
  const safeLabel = exportLabel
    .trim()
    .replace(/[\\/?%*:|"<>]/g, ' ')
    .replace(/\s+/g, '-');
  const timestamp = new Date().toISOString().replace(/[:T]/g, '-').split('.')[0];
  return `${safeEventName || 'seton'}-${safeLabel || 'export'}-${timestamp}.xlsx`;
}

export async function downloadWorkbook(workbook: ExcelJS.Workbook, fileName: string) {
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function buildPatrolCodeVariants(raw: string) {
  const normalized = normalisePatrolCode(raw);
  if (!normalized) {
    return [];
  }
  const match = normalized.match(/^([NMSR])([HD])-(\d{1,2})$/);
  if (!match) {
    return [normalized];
  }
  const parsed = Number.parseInt(match[3], 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return [normalized];
  }
  const noPad = `${match[1]}${match[2]}-${parsed}`;
  const pad = `${match[1]}${match[2]}-${String(parsed).padStart(2, '0')}`;
  return noPad === pad ? [noPad] : [noPad, pad];
}
