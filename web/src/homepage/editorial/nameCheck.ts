import type ExcelJS from 'exceljs';
import type { PatrolImportIssue, PatrolImportRow } from '../../admin/patrolImport/workbook';
import type { PatrolProfileChildRow } from '../../station/types';

/** Like PatrolImportRow, but with free-form category (sheet name) and sex: the name check accepts any table layout. */
export type NameCheckRow = Omit<PatrolImportRow, 'category' | 'sex'> & { category: string; sex: string };

export type NameCheckTroopSummary = { troop: string; patrols: number; members: number; mixedPatrols: number };

export type NameCheckResult = {
  workbook: ExcelJS.Workbook | null;
  troops: NameCheckTroopSummary[];
  patrolCount: number;
  issues: PatrolImportIssue[];
};

const HEADERS = ['Kategorie', 'Hlídka', 'Pohlaví', 'Oddíly hlídky', 'Jméno', 'Příjmení', 'Přezdívka', 'Oddíl člena', 'Ke kontrole'];

function patrolCode(row: NameCheckRow) {
  return `${row.category}${row.sex}-${row.number}`;
}

/** Sorts by the order in which categories (sheets) appear in the table, then by number. */
function createPatrolComparator(rows: readonly NameCheckRow[]) {
  const order = Array.from(new Set(rows.map((row) => row.category)));
  return (a: NameCheckRow, b: NameCheckRow) => {
    const category = order.indexOf(a.category) - order.indexOf(b.category);
    return category !== 0 ? category : a.number - b.number;
  };
}

/**
 * Builds a workbook with one sheet per troop. A sheet lists every patrol the troop takes part in, including mixed
 * ones; in a mixed patrol the members of this troop are highlighted so the leader knows whom to check.
 */
export async function buildNameCheckWorkbook(rows: readonly NameCheckRow[], issues: PatrolImportIssue[] = []): Promise<NameCheckResult> {
  const [{ default: ExcelJSModule }, { compareTroopSheetOrder }, { toWorksheetBaseName, toUniqueWorksheetName }] = await Promise.all([
    import('exceljs'),
    import('../../admin/setup/troops'),
    import('../../admin/exports/patrolWorkbook'),
  ]);

  const patrolsByTroop = new Map<string, NameCheckRow[]>();
  rows.forEach((row) => {
    row.troops.forEach((troop) => {
      patrolsByTroop.set(troop, [...(patrolsByTroop.get(troop) ?? []), row]);
    });
  });
  const troopNames = Array.from(patrolsByTroop.keys()).sort(compareTroopSheetOrder);
  if (troopNames.length === 0) {
    return { workbook: null, troops: [], patrolCount: rows.length, issues };
  }

  const workbook = new ExcelJSModule.Workbook();
  workbook.creator = 'Zelená liga';
  const usedNames = new Set<string>();
  const summaries: NameCheckTroopSummary[] = [];
  const comparePatrols = createPatrolComparator(rows);

  troopNames.forEach((troop) => {
    const patrols = [...(patrolsByTroop.get(troop) ?? [])].sort(comparePatrols);
    const sheet = workbook.addWorksheet(toUniqueWorksheetName(toWorksheetBaseName(troop, 'Oddíl'), usedNames), {
      views: [{ state: 'frozen', ySplit: 3 }],
    });

    sheet.getCell('A1').value = `Kontrola jmen – ${troop}`;
    sheet.getCell('A1').font = { bold: true, size: 14 };
    sheet.getCell('A2').value =
      'Žlutě označení členové patří do tvého oddílu a je potřeba je zkontrolovat. Šedě jsou členové jiného oddílu ve smíšené hlídce.';
    sheet.getCell('A2').font = { italic: true };
    const header = sheet.getRow(3);
    header.values = HEADERS;
    header.font = { bold: true };
    header.eachCell((cell) => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDDEFD2' } };
    });

    let memberCount = 0;
    let mixedCount = 0;
    patrols.forEach((patrol) => {
      const mixed = patrol.troops.length > 1;
      if (mixed) {
        mixedCount += 1;
      }
      patrol.members.forEach((member, index) => {
        const own = !mixed || member.troop === troop;
        if (own) {
          memberCount += 1;
        }
        const row = sheet.addRow([
          patrol.category,
          patrolCode(patrol),
          patrol.sex,
          patrol.troops.join(' + '),
          member.firstName,
          member.lastName,
          member.nickname,
          member.troop || (mixed ? '' : troop),
          own ? 'ANO' : `ne – oddíl ${member.troop}`,
        ]);
        if (index === 0) {
          row.eachCell((cell) => {
            cell.border = { top: { style: 'thin', color: { argb: 'FF999999' } } };
          });
        }
        if (mixed && own) {
          row.eachCell((cell) => {
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF2A8' } };
            cell.font = { bold: true };
          });
        } else if (!own) {
          row.eachCell((cell) => {
            cell.font = { italic: true, color: { argb: 'FF888888' } };
          });
        }
      });
    });

    [10, 10, 9, 38, 16, 18, 14, 28, 26].forEach((width, index) => {
      sheet.getColumn(index + 1).width = width;
    });
    sheet.autoFilter = { from: { row: 3, column: 1 }, to: { row: 3, column: HEADERS.length } };
    summaries.push({ troop, patrols: patrols.length, members: memberCount, mixedPatrols: mixedCount });
  });

  return { workbook, troops: summaries, patrolCount: rows.length, issues };
}

type HeaderKind = 'category' | 'number' | 'sex' | 'troop' | 'firstName' | 'lastName' | 'nickname' | 'memberTroop';

function normalizeHeader(text: string) {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

function classifyHeader(text: string): HeaderKind | null {
  const h = normalizeHeader(text);
  if (!h) return null;
  if (/^kategori/.test(h)) return 'category';
  if (/pohlavi/.test(h)) return 'sex';
  if (/^(startovni )?(cislo|c\.|cis|id)\b/.test(h) || /^(start|st\.? ?c)/.test(h)) return 'number';
  if (/^jmeno|^krestni/.test(h)) return 'firstName';
  if (/^prijmeni/.test(h)) return 'lastName';
  if (/^prezdivka|^prezdivky|^nick/.test(h)) return 'nickname';
  if (/^oddil/.test(h)) return /clen|\bclena\b/.test(h) ? 'memberTroop' : 'troop';
  return null;
}

function normalizeSex(text: string) {
  const t = normalizeHeader(text);
  if (/^(h|hosi|hoch|kluk|m)\b/.test(t)) return 'H';
  if (/^(d|divky|devce|z)\b/.test(t)) return 'D';
  return text.trim().toUpperCase();
}

/**
 * Lenient reader for the name check: any sheet names, any number of sheets, columns found by their header text
 * (not by position). Sheet name is used as the category unless the table has a "Kategorie" column.
 */
export async function parsePatrolTableLoosely(buffer: ArrayBuffer): Promise<{ rows: NameCheckRow[]; issues: PatrolImportIssue[] }> {
  const [{ default: ExcelJSModule }, { cellText }] = await Promise.all([
    import('exceljs'),
    import('../../admin/patrolImport/workbook'),
  ]);
  const workbook = new ExcelJSModule.Workbook();
  try {
    await workbook.xlsx.load(buffer);
  } catch {
    return { rows: [], issues: [{ sheet: '', row: null, message: 'Soubor se nepodařilo přečíst. Nahraj .xlsx.' }] };
  }

  const rows: NameCheckRow[] = [];
  const issues: PatrolImportIssue[] = [];

  workbook.worksheets.forEach((sheet) => {
    if (sheet.state !== 'visible') return;
    const sheetName = sheet.name.trim();

    let headerRow = 0;
    let columns = new Map<number, HeaderKind>();
    for (let r = 1; r <= Math.min(sheet.rowCount, 15) && !headerRow; r += 1) {
      const found = new Map<number, HeaderKind>();
      const row = sheet.getRow(r);
      for (let c = 1; c <= Math.max(sheet.columnCount, row.cellCount); c += 1) {
        const kind = classifyHeader(cellText(row.getCell(c)));
        if (kind) found.set(c, kind);
      }
      const kinds = new Set(found.values());
      if (kinds.has('firstName')) {
        headerRow = r;
        columns = found;
      }
    }
    if (!headerRow) {
      if (sheet.rowCount > 0) {
        issues.push({ sheet: sheetName, row: null, message: 'List přeskočen: nenašel jsem hlavičku se sloupcem Jméno.' });
      }
      return;
    }

    const colsOf = (kind: HeaderKind) => Array.from(columns.entries()).filter(([, k]) => k === kind).map(([c]) => c);
    const categoryCol = colsOf('category')[0];
    const numberCol = colsOf('number')[0];
    const sexCol = colsOf('sex')[0];
    const troopCols = colsOf('troop');
    // Child groups: every first-name column starts a member; following columns up to the next first name belong to it.
    const sortedCols = Array.from(columns.keys()).sort((a, b) => a - b);
    const groups: Array<Partial<Record<'firstName' | 'lastName' | 'nickname' | 'memberTroop', number>>> = [];
    sortedCols.forEach((c) => {
      const kind = columns.get(c)!;
      if (kind === 'firstName') {
        groups.push({ firstName: c });
      } else if ((kind === 'lastName' || kind === 'nickname' || kind === 'memberTroop') && groups.length > 0) {
        const group = groups[groups.length - 1];
        if (group[kind] === undefined) group[kind] = c;
      }
    });

    let autoNumber = 0;
    for (let r = headerRow + 1; r <= sheet.rowCount; r += 1) {
      const row = sheet.getRow(r);
      const members: PatrolProfileChildRow[] = groups
        .map((g) => {
          const first = g.firstName ? cellText(row.getCell(g.firstName)) : '';
          // Without a surname column the "Jméno" cell holds the full name: split it at the first space.
          const space = g.lastName ? -1 : first.indexOf(' ');
          return {
            first: space > 0 ? first.slice(0, space) : first,
            last: g.lastName ? cellText(row.getCell(g.lastName)) : space > 0 ? first.slice(space + 1).trim() : '',
            g,
          };
        })
        .map(({ first, last, g }) => ({
          firstName: first,
          lastName: last,
          nickname: g.nickname ? cellText(row.getCell(g.nickname)) : '',
          troop: g.memberTroop ? cellText(row.getCell(g.memberTroop)) : '',
        }))
        .filter((m) => m.firstName || m.lastName || m.nickname);
      if (members.length === 0) continue;

      autoNumber += 1;
      const rawNumber = numberCol ? Number(cellText(row.getCell(numberCol))) : NaN;
      const troops: string[] = [];
      [...troopCols.map((c) => cellText(row.getCell(c))), ...members.map((m) => m.troop)].forEach((t) => {
        if (t && !troops.includes(t)) troops.push(t);
      });
      if (troops.length === 0) {
        issues.push({ sheet: sheetName, row: r, message: 'Řádek přeskočen: chybí oddíl hlídky.' });
        continue;
      }
      const singleTroop = troops.length === 1 ? troops[0] : '';
      rows.push({
        category: (categoryCol ? cellText(row.getCell(categoryCol)) : '') || sheetName,
        number: Number.isFinite(rawNumber) && rawNumber > 0 ? rawNumber : autoNumber,
        sex: sexCol ? normalizeSex(cellText(row.getCell(sexCol))) : '',
        team_name: troops.join(' + '),
        patrol_members: '',
        troops,
        members: members.map((m) => ({ ...m, troop: m.troop || singleTroop })),
      });
    }
  });

  if (rows.length === 0 && issues.length === 0) {
    issues.push({ sheet: '', row: null, message: 'V souboru nejsou žádné vyplněné hlídky.' });
  }
  return { rows, issues };
}

/** Reads an uploaded patrol table (any layout with Jméno/Příjmení/Oddíl headers) and converts it to the name check workbook. */
export async function convertPatrolTableToNameCheck(buffer: ArrayBuffer): Promise<NameCheckResult> {
  const parsed = await parsePatrolTableLoosely(buffer);
  return buildNameCheckWorkbook(parsed.rows, parsed.issues);
}
