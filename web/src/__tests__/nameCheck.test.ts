// @vitest-environment node
import { describe, expect, it } from 'vitest';
import ExcelJS from 'exceljs';
import { buildPatrolImportTemplate } from '../admin/patrolImport/workbook';
import { convertPatrolTableToNameCheck } from '../homepage/editorial/nameCheck';

function setRow(sheet: ExcelJS.Worksheet, rowNumber: number, values: unknown[]) {
  values.forEach((value, index) => {
    if (value !== undefined) sheet.getCell(rowNumber, index + 1).value = value as ExcelJS.CellValue;
  });
}

async function buildTable() {
  const workbook = await buildPatrolImportTemplate(['10. PTO Severka', '21. PTO Hády']);
  setRow(workbook.getWorksheet('N')!, 2, [1, 'H', '10. PTO Severka', undefined, undefined, 'Jan', 'Novák', 'Honza']);
  setRow(workbook.getWorksheet('M')!, 2, [
    3, 'D', '10. PTO Severka', '21. PTO Hády', undefined,
    'Eva', 'Dvořáková', undefined, '10. PTO Severka',
    'Marie', 'Svobodová', 'Majka', '21. PTO Hády',
  ]);
  setRow(workbook.getWorksheet('S')!, 2, [2, 'H', '12. PTO Neznámý', undefined, undefined, 'Karel', 'Malý']);
  return (await workbook.xlsx.writeBuffer()) as ArrayBuffer;
}

describe('name check conversion', () => {
  it('creates one sheet per troop including mixed patrols and unknown troops', async () => {
    const result = await convertPatrolTableToNameCheck(await buildTable());
    expect(result.issues).toEqual([]);
    expect(result.workbook!.worksheets.map((sheet) => sheet.name)).toEqual(['10. PTO Severka', '12. PTO Neznámý', '21. PTO Hády']);
    expect(result.troops).toEqual([
      { troop: '10. PTO Severka', patrols: 2, members: 2, mixedPatrols: 1 },
      { troop: '12. PTO Neznámý', patrols: 1, members: 1, mixedPatrols: 0 },
      { troop: '21. PTO Hády', patrols: 1, members: 1, mixedPatrols: 1 },
    ]);
  });

  it('marks the troop members to check in a mixed patrol', async () => {
    const result = await convertPatrolTableToNameCheck(await buildTable());
    const sheet = result.workbook!.getWorksheet('21. PTO Hády')!;
    // rows 1-3 are the title, legend and header
    const rows = [4, 5].map((index) => sheet.getRow(index).values as unknown[]);
    expect(rows.map((row) => [row[2], row[5], row[6], row[9]])).toEqual([
      ['MD-3', 'Eva', 'Dvořáková', 'ne – oddíl 10. PTO Severka'],
      ['MD-3', 'Marie', 'Svobodová', 'ANO'],
    ]);
    expect((sheet.getRow(5).getCell(5).fill as ExcelJS.FillPattern).fgColor?.argb).toBe('FFFFF2A8');
    expect(sheet.getRow(4).getCell(5).fill).toBeUndefined();
  });

  it('returns no workbook when nothing could be read', async () => {
    const empty = await buildPatrolImportTemplate([]);
    const result = await convertPatrolTableToNameCheck((await empty.xlsx.writeBuffer()) as ArrayBuffer);
    expect(result.workbook).toBeNull();
    expect(result.issues.length).toBeGreaterThan(0);
  });
});
