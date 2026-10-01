import ExcelJS from 'exceljs';
import { buildPatrolTeamNameFromTroops,stringifyPatrolProfileRows } from '../../station/patrolProfile';
import type { PatrolProfileChildRow } from '../../station/types';

export const PATROL_IMPORT_CATEGORIES = ['N', 'M', 'S', 'R'] as const;
export type PatrolImportCategory = (typeof PATROL_IMPORT_CATEGORIES)[number];
export const PATROL_IMPORT_MAX_NUMBER = 50;
export const PATROL_IMPORT_CHILD_COUNT = 3;
const MAX_TROOPS_PER_PATROL = 2;
const LISTS_SHEET = 'Seznamy';
const FIRST_DATA_ROW = 2;

// A: číslo, B: pohlaví, C-D: oddíly, potom po čtyřech sloupcích na dítě (jméno, příjmení, přezdívka, oddíl).
const CHILD_FIRST_COLUMN = 5;
const CHILD_COLUMN_COUNT = 4;

export type PatrolImportRow = {
  category: PatrolImportCategory;
  number: number;
  sex: 'H' | 'D';
  team_name: string;
  patrol_members: string;
};

export type PatrolImportIssue = { sheet: string; row: number | null; message: string };

export async function buildPatrolImportTemplate(troopOptions: readonly string[]) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Zelená liga';

  const troops = Array.from(new Set(troopOptions.map((troop) => troop.trim()).filter(Boolean)));
  const lastTroopRow = Math.max(2, troops.length + 1);
  const troopRange = `${LISTS_SHEET}!$A$2:$A$${lastTroopRow}`;

  PATROL_IMPORT_CATEGORIES.forEach((category) => {
    const sheet = workbook.addWorksheet(category, { views: [{ state: 'frozen', ySplit: 1 }] });
    const headers = [
      'Startovní číslo',
      'Pohlaví',
      'Oddíl 1',
      'Oddíl 2 (smíšená hlídka)',
    ];
    for (let child = 1; child <= PATROL_IMPORT_CHILD_COUNT; child += 1) {
      headers.push(`Jméno ${child}`, `Příjmení ${child}`, `Přezdívka ${child}`, `Oddíl ${child}. člena`);
    }
    sheet.addRow(headers);
    const header = sheet.getRow(1);
    header.font = { bold: true };
    header.alignment = { vertical: 'middle', wrapText: true };
    header.height = 32;
    header.eachCell((cell) => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDDEFD2' } };
    });
    sheet.getCell('A1').note = `Číslo 1–${PATROL_IMPORT_MAX_NUMBER}. Číslo je v rámci kategorie společné pro H i D.`;
    sheet.getCell('B1').note = 'Vyber H (hoši) nebo D (dívky).';
    sheet.getCell('C1').note = 'Vyber oddíl ze seznamu.';
    sheet.getCell('D1').note = 'Vyplň jen u smíšené hlídky (dva oddíly). Pak vyplň oddíl u každého člena.';
    sheet.getCell(1, CHILD_FIRST_COLUMN + 2).note = 'Přezdívka je nepovinná.';
    sheet.getCell(1, CHILD_FIRST_COLUMN + 3).note = 'Vybírá se jen z oddílů hlídky. Povinné jen u smíšené hlídky.';

    sheet.getColumn(1).width = 11;
    sheet.getColumn(2).width = 9;
    sheet.getColumn(3).width = 24;
    sheet.getColumn(4).width = 24;
    for (let child = 0; child < PATROL_IMPORT_CHILD_COUNT; child += 1) {
      const start = CHILD_FIRST_COLUMN + child * CHILD_COLUMN_COUNT;
      sheet.getColumn(start).width = 14;
      sheet.getColumn(start + 1).width = 16;
      sheet.getColumn(start + 2).width = 14;
      sheet.getColumn(start + 3).width = 24;
    }

    for (let number = 1; number <= PATROL_IMPORT_MAX_NUMBER; number += 1) {
      const row = FIRST_DATA_ROW + number - 1;
      sheet.getCell(row, 1).value = number;

      sheet.getCell(row, 1).dataValidation = {
        type: 'whole',
        operator: 'between',
        formulae: [1, PATROL_IMPORT_MAX_NUMBER],
        allowBlank: false,
        showErrorMessage: true,
        errorStyle: 'stop',
        errorTitle: 'Neplatné číslo',
        error: `Zadej celé číslo od 1 do ${PATROL_IMPORT_MAX_NUMBER}.`,
      };
      sheet.getCell(row, 2).dataValidation = {
        type: 'list',
        allowBlank: true,
        formulae: ['"H,D"'],
        showErrorMessage: true,
        errorStyle: 'stop',
        errorTitle: 'Neplatné pohlaví',
        error: 'Povolené hodnoty jsou H nebo D.',
      };
      [3, 4].forEach((column) => {
        sheet.getCell(row, column).dataValidation = {
          type: 'list',
          allowBlank: true,
          formulae: [troopRange],
          showErrorMessage: true,
          errorStyle: 'stop',
          errorTitle: 'Neznámý oddíl',
          error: 'Vyber oddíl ze seznamu.',
        };
      });
      for (let child = 0; child < PATROL_IMPORT_CHILD_COUNT; child += 1) {
        const start = CHILD_FIRST_COLUMN + child * CHILD_COLUMN_COUNT;
        [start, start + 1, start + 2].forEach((column) => {
          sheet.getCell(row, column).dataValidation = {
            type: 'textLength',
            operator: 'lessThanOrEqual',
            formulae: [60],
            allowBlank: true,
            showErrorMessage: true,
            errorStyle: 'stop',
            errorTitle: 'Příliš dlouhý text',
            error: 'Maximálně 60 znaků.',
          };
        });
        sheet.getCell(row, start + 3).dataValidation = {
          type: 'list',
          allowBlank: true,
          formulae: [`$C${row}:$D${row}`],
          showErrorMessage: true,
          errorStyle: 'stop',
          errorTitle: 'Neplatný oddíl',
          error: 'Vyber jeden z oddílů hlídky (sloupce Oddíl 1 a Oddíl 2).',
        };
      }
    }
  });

  const lists = workbook.addWorksheet(LISTS_SHEET, { state: 'hidden' });
  lists.getCell('A1').value = 'Oddíly';
  troops.forEach((troop, index) => {
    lists.getCell(index + 2, 1).value = troop;
  });

  return workbook;
}

function cellText(cell: ExcelJS.Cell | undefined) {
  if (!cell) {
    return '';
  }
  const value = cell.value as unknown;
  if (value === null || value === undefined) {
    return '';
  }
  if (typeof value === 'object') {
    const object = value as { richText?: Array<{ text: string }>; result?: unknown; text?: unknown };
    if (Array.isArray(object.richText)) {
      return object.richText.map((part) => part.text).join('').replace(/\s+/g, ' ').trim();
    }
    if ('result' in object) {
      return String(object.result ?? '').replace(/\s+/g, ' ').trim();
    }
    if (typeof object.text === 'string') {
      return object.text.replace(/\s+/g, ' ').trim();
    }
    return '';
  }
  return String(value).replace(/\s+/g, ' ').trim();
}

export async function parsePatrolImportWorkbook(buffer: ArrayBuffer, troopOptions: readonly string[]) {
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(buffer);
  } catch {
    return { rows: [] as PatrolImportRow[], issues: [{ sheet: '', row: null, message: 'Soubor se nepodařilo přečíst. Nahraj .xlsx podle šablony.' }] };
  }

  const troopByKey = new Map(troopOptions.map((troop) => [troop.trim().toLocaleLowerCase('cs'), troop.trim()] as const));
  const rows: PatrolImportRow[] = [];
  const issues: PatrolImportIssue[] = [];

  PATROL_IMPORT_CATEGORIES.forEach((category) => {
    const sheet = workbook.worksheets.find((candidate) => candidate.name.trim().toUpperCase() === category);
    if (!sheet) {
      issues.push({ sheet: category, row: null, message: `Chybí list ${category}.` });
      return;
    }
    const seenNumbers = new Map<number, number>();

    for (let rowNumber = FIRST_DATA_ROW; rowNumber <= sheet.rowCount; rowNumber += 1) {
      const row = sheet.getRow(rowNumber);
      const numberText = cellText(row.getCell(1));
      const sexText = cellText(row.getCell(2)).toUpperCase();
      const troopTexts = [cellText(row.getCell(3)), cellText(row.getCell(4))].filter(Boolean);
      const children: PatrolProfileChildRow[] = [];
      let hasChildData = false;
      for (let child = 0; child < PATROL_IMPORT_CHILD_COUNT; child += 1) {
        const start = CHILD_FIRST_COLUMN + child * CHILD_COLUMN_COUNT;
        const entry = {
          firstName: cellText(row.getCell(start)),
          lastName: cellText(row.getCell(start + 1)),
          nickname: cellText(row.getCell(start + 2)),
          troop: cellText(row.getCell(start + 3)),
        };
        if (entry.firstName || entry.lastName || entry.nickname || entry.troop) {
          hasChildData = true;
        }
        children.push(entry);
      }

      // Rows with only the pre-filled number are empty placeholders.
      if (!sexText && troopTexts.length === 0 && !hasChildData) {
        continue;
      }

      const fail = (message: string) => issues.push({ sheet: category, row: rowNumber, message });
      const number = Number(numberText);
      if (!Number.isInteger(number) || number < 1 || number > PATROL_IMPORT_MAX_NUMBER) {
        fail(`Startovní číslo musí být celé číslo 1–${PATROL_IMPORT_MAX_NUMBER}.`);
        continue;
      }
      if (seenNumbers.has(number)) {
        fail(`Číslo ${number} je v listu ${category} už na řádku ${seenNumbers.get(number)}.`);
        continue;
      }
      seenNumbers.set(number, rowNumber);

      if (sexText !== 'H' && sexText !== 'D') {
        fail('Pohlaví musí být H nebo D.');
        continue;
      }

      if (troopTexts.length === 0) {
        fail('Vyplň oddíl hlídky.');
        continue;
      }
      if (troopTexts.length > MAX_TROOPS_PER_PATROL) {
        fail('Hlídka může mít nejvýše dva oddíly.');
        continue;
      }
      const troops: string[] = [];
      let troopError = '';
      troopTexts.forEach((text) => {
        const canonical = troopByKey.get(text.toLocaleLowerCase('cs'));
        if (!canonical) {
          troopError = `Neznámý oddíl „${text}“. Vyber oddíl ze seznamu.`;
          return;
        }
        if (!troops.includes(canonical)) {
          troops.push(canonical);
        }
      });
      if (troopError) {
        fail(troopError);
        continue;
      }

      const mixed = troops.length > 1;
      let childError = '';
      const normalizedChildren: PatrolProfileChildRow[] = [];
      children.forEach((child, index) => {
        if (!child.firstName && !child.lastName && !child.nickname && !child.troop) {
          return;
        }
        if (!child.firstName || !child.lastName) {
          childError ||= `Člen ${index + 1}: vyplň jméno i příjmení.`;
          return;
        }
        let troop = '';
        if (child.troop) {
          troop = troopByKey.get(child.troop.toLocaleLowerCase('cs')) ?? '';
          if (!troop || !troops.includes(troop)) {
            childError ||= `Člen ${index + 1}: oddíl musí být jeden z oddílů hlídky.`;
            return;
          }
        } else if (mixed) {
          childError ||= `Člen ${index + 1}: u smíšené hlídky vyplň oddíl člena.`;
          return;
        } else {
          troop = troops[0];
        }
        normalizedChildren.push({ ...child, troop });
      });
      if (childError) {
        fail(childError);
        continue;
      }
      if (normalizedChildren.length === 0) {
        fail('Vyplň alespoň jednoho člena (jméno a příjmení).');
        continue;
      }

      const members = stringifyPatrolProfileRows(normalizedChildren, { requiresTroopPerChild: mixed });
      if (!members) {
        fail('Vyplň alespoň jednoho člena (jméno a příjmení).');
        continue;
      }
      rows.push({
        category,
        number,
        sex: sexText,
        team_name: buildPatrolTeamNameFromTroops(troops),
        patrol_members: members,
      });
    }
  });

  if (rows.length === 0 && issues.length === 0) {
    issues.push({ sheet: '', row: null, message: 'V souboru nejsou žádné vyplněné hlídky.' });
  }
  return { rows, issues };
}
