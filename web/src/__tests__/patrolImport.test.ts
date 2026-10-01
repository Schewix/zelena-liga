// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import ExcelJS from 'exceljs';
import { buildPatrolImportTemplate, parsePatrolImportWorkbook } from '../admin/patrolImport/workbook';
import { importPatrols } from '../../api-lib/admin/eventState/actions/importPatrols';

const TROOPS = ['10. PTO Severka', '21. PTO Hády', '8. PTO Mustangové'];

function setRow(sheet: ExcelJS.Worksheet, rowNumber: number, values: unknown[]) {
  values.forEach((value, index) => {
    if (value !== undefined) {
      sheet.getCell(rowNumber, index + 1).value = value as ExcelJS.CellValue;
    }
  });
}

async function roundTrip(fill: (sheets: Record<string, ExcelJS.Worksheet>) => void) {
  const workbook = await buildPatrolImportTemplate(TROOPS);
  const sheets = Object.fromEntries(['N', 'M', 'S', 'R'].map((name) => [name, workbook.getWorksheet(name)!]));
  fill(sheets);
  const buffer = await workbook.xlsx.writeBuffer();
  return parsePatrolImportWorkbook(buffer as ArrayBuffer, TROOPS);
}

describe('patrol import template', () => {
  it('has the four category sheets with restricted inputs and a hidden list sheet', async () => {
    const workbook = await buildPatrolImportTemplate(TROOPS);
    expect(workbook.worksheets.filter((sheet) => sheet.state === 'visible').map((sheet) => sheet.name)).toEqual(['N', 'M', 'S', 'R']);
    const sheet = workbook.getWorksheet('N')!;
    expect(sheet.getCell('B2').dataValidation).toMatchObject({ type: 'list', formulae: ['"H,D"'] });
    expect(sheet.getCell('C2').dataValidation).toMatchObject({ type: 'list' });
    expect(sheet.getCell('A2').dataValidation).toMatchObject({ type: 'whole', formulae: [1, 50] });
    expect(sheet.getCell('H2').dataValidation).toMatchObject({ type: 'list', formulae: ['$C2:$D2'] });
    expect(workbook.getWorksheet('Seznamy')!.getCell('A3').value).toBe('21. PTO Hády');
  });
});

describe('patrol import parsing', () => {
  it('reads single-troop and mixed patrols and ignores placeholder rows', async () => {
    const { rows, issues } = await roundTrip((sheets) => {
      setRow(sheets.N, 2, [1, 'H', '10. PTO Severka', undefined, 'Jan', 'Novák', 'Honza']);
      setRow(sheets.M, 6, [
        5, 'D', '10. PTO Severka', '21. PTO Hády',
        'Eva', 'Dvořáková', undefined, '10. PTO Severka',
        'Marie', 'Svobodová', 'Majka', '21. PTO Hády',
      ]);
    });
    expect(issues).toEqual([]);
    expect(rows).toEqual([
      { category: 'N', number: 1, sex: 'H', team_name: '10. PTO Severka', patrol_members: 'Jan Novák (Honza)' },
      {
        category: 'M', number: 5, sex: 'D', team_name: '10. PTO Severka + 21. PTO Hády',
        patrol_members: 'Eva Dvořáková {oddil:10. PTO Severka}\nMarie Svobodová (Majka) {oddil:21. PTO Hády}',
      },
    ]);
  });

  it('reports row errors', async () => {
    const { rows, issues } = await roundTrip((sheets) => {
      setRow(sheets.N, 2, [1, 'X', '10. PTO Severka', undefined, 'Jan', 'Novák']);
      setRow(sheets.N, 3, [2, 'H', 'Neznámý oddíl', undefined, 'Jan', 'Novák']);
      setRow(sheets.N, 4, [3, 'H', '10. PTO Severka', '21. PTO Hády', 'Jan', 'Novák']);
      setRow(sheets.N, 5, [4, 'H', '10. PTO Severka', undefined, 'Jan']);
      setRow(sheets.N, 6, [5, 'H', '10. PTO Severka']);
    });
    expect(rows).toEqual([]);
    expect(issues.map((issue) => [issue.sheet, issue.row, issue.message])).toEqual([
      ['N', 2, 'Pohlaví musí být H nebo D.'],
      ['N', 3, expect.stringContaining('Neznámý oddíl')],
      ['N', 4, expect.stringContaining('smíšené hlídky vyplň oddíl člena')],
      ['N', 5, expect.stringContaining('jméno i příjmení')],
      ['N', 6, expect.stringContaining('alespoň jednoho člena')],
    ]);
  });

  it('rejects a duplicated number within a category', async () => {
    const { issues } = await roundTrip((sheets) => {
      setRow(sheets.S, 2, [1, 'H', '10. PTO Severka', undefined, 'Jan', 'Novák']);
      setRow(sheets.S, 3, [1, 'D', '10. PTO Severka', undefined, 'Eva', 'Nová']);
    });
    expect(issues).toEqual([{ sheet: 'S', row: 3, message: expect.stringContaining('Číslo 1') }]);
  });

  it('rejects a file that is not an xlsx', async () => {
    const { issues } = await parsePatrolImportWorkbook(new TextEncoder().encode('nope').buffer as ArrayBuffer, TROOPS);
    expect(issues[0].message).toContain('nepodařilo přečíst');
  });
});

function createDb(existing: Array<{ id: string; patrol_code: string; category: string; active: boolean }>) {
  const inserted: unknown[] = [];
  const updated: Array<[string, unknown]> = [];
  const db = {
    from: (table: string) => {
      const query: any = {
        select: () => query,
        eq: () => query,
        maybeSingle: async () => ({ data: { id: 'event' }, error: null }),
        insert: async (rows: unknown[]) => { inserted.push(...rows); return { error: null }; },
        update: (values: unknown) => {
          let id = '';
          const chain: any = { eq: (key: string, value: string) => { if (key === 'id') id = value; return chain; },
            then: (resolve: (value: unknown) => unknown) => { updated.push([id, values]); return resolve({ error: null }); } };
          return chain;
        },
        then: (resolve: (value: unknown) => unknown) => resolve({ data: table === 'patrols' ? existing : null, error: null }),
      };
      return query;
    },
  };
  const res = { status: vi.fn(), json: vi.fn() };
  res.status.mockReturnValue(res);
  return { db, res, inserted, updated };
}

describe('import_patrols action', () => {
  const patrol = { category: 'N', number: 1, sex: 'H', team_name: '10. PTO Severka', patrol_members: 'Jan Novák' };

  it('updates existing patrols by category and number and creates the missing ones', async () => {
    const app = createDb([{ id: 'p1', patrol_code: 'N-1', category: 'N', active: true }]);
    await importPatrols(app.db, { event_id: 'event', patrols: [patrol, { ...patrol, number: 2, sex: 'D' }] }, app.res);
    expect(app.updated).toEqual([['p1', expect.objectContaining({ patrol_code: 'NH-1', sex: 'H', team_name: '10. PTO Severka' })]]);
    expect(app.inserted).toEqual([expect.objectContaining({ event_id: 'event', patrol_code: 'ND-2', sex: 'D', active: true })]);
    expect(app.res.json).toHaveBeenCalledWith({ ok: true, created: 1, updated: 1 });
  });

  it.each([
    { ...patrol, sex: 'X' },
    { ...patrol, number: 51 },
    { ...patrol, category: 'Z' },
    { ...patrol, patrol_members: 'Jan' },
  ])('rejects invalid rows without writing: %j', async (bad) => {
    const app = createDb([]);
    await importPatrols(app.db, { event_id: 'event', patrols: [bad] }, app.res);
    expect(app.res.status).toHaveBeenCalledWith(400);
    expect(app.inserted).toEqual([]);
  });
});
