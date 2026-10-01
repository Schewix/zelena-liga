import type ExcelJS from 'exceljs';
import type { PatrolImportIssue, PatrolImportRow } from '../../admin/patrolImport/workbook';

export type NameCheckTroopSummary = { troop: string; patrols: number; members: number; mixedPatrols: number };

export type NameCheckResult = {
  workbook: ExcelJS.Workbook | null;
  troops: NameCheckTroopSummary[];
  patrolCount: number;
  issues: PatrolImportIssue[];
};

const CATEGORY_ORDER = ['N', 'M', 'S', 'R'];
const HEADERS = ['Kategorie', 'Hlídka', 'Pohlaví', 'Oddíly hlídky', 'Jméno', 'Příjmení', 'Přezdívka', 'Oddíl člena', 'Ke kontrole'];

function patrolCode(row: PatrolImportRow) {
  return `${row.category}${row.sex}-${row.number}`;
}

function comparePatrols(a: PatrolImportRow, b: PatrolImportRow) {
  const category = CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category);
  return category !== 0 ? category : a.number - b.number;
}

/**
 * Builds a workbook with one sheet per troop. A sheet lists every patrol the troop takes part in, including mixed
 * ones; in a mixed patrol the members of this troop are highlighted so the leader knows whom to check.
 */
export async function buildNameCheckWorkbook(rows: readonly PatrolImportRow[], issues: PatrolImportIssue[] = []): Promise<NameCheckResult> {
  const [{ default: ExcelJSModule }, { compareTroopSheetOrder }, { toWorksheetBaseName, toUniqueWorksheetName }] = await Promise.all([
    import('exceljs'),
    import('../../admin/setup/troops'),
    import('../../admin/exports/patrolWorkbook'),
  ]);

  const patrolsByTroop = new Map<string, PatrolImportRow[]>();
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

/** Reads an uploaded patrol table (same layout as the import template) and converts it to the name check workbook. */
export async function convertPatrolTableToNameCheck(buffer: ArrayBuffer): Promise<NameCheckResult> {
  const [{ parsePatrolImportWorkbook }, { DEFAULT_SETUP_TROOP_OPTIONS }] = await Promise.all([
    import('../../admin/patrolImport/workbook'),
    import('../../admin/setup/troops'),
  ]);
  // Unknown troops are kept as written: the table is only checked, not imported.
  const parsed = await parsePatrolImportWorkbook(buffer, DEFAULT_SETUP_TROOP_OPTIONS, { allowUnknownTroops: true });
  return buildNameCheckWorkbook(parsed.rows, parsed.issues);
}
