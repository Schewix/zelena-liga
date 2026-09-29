// @vitest-environment node
import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import { proposeBands, type BandInput } from '../league/bands';
import {
  CHOICE_HEADER,
  PROPOSAL_SHEET,
  finalWorkbook,
  guessMapping,
  parseCsv,
  parseTroops,
  prepareJob,
  proposalWorkbook,
  readSelections,
  readSource,
  troopTotals,
  type LeagueJob,
} from '../league/workbooks';

const settings = { coefficient: 2, maxResults: 4, participation: 10 };
async function bytes(workbook: ExcelJS.Workbook): Promise<ArrayBuffer> {
  const buffer = await workbook.xlsx.writeBuffer();
  return Uint8Array.from(new Uint8Array(buffer)).buffer;
}
async function fixture() {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('ZaPsem');
  sheet.mergeCells('A1:F1');
  sheet.getCell('A1').value = 'Původní výsledky závodu';
  sheet.addRow(['Soutěžící', 'Oddíl', 'Body celkem', 'Kategorie', 'Stav', 'Poznámka']);
  sheet.getColumn(1).width = 32;
  sheet.getCell('A1').font = { bold: true, color: { argb: 'FF00AA00' } };
  for (let i = 0; i < 6; i++)
    sheet.addRow([`Tým ${i + 1}`, 'Severka', 100 - i * 10, 'M', '', `Poznámka ${i}`]);
  sheet.addRow(['Mix', 'Severka=2; Draci=1', 30, 'M', '', 'mix']);
  sheet.addRow(['Nedokončil', 'Draci', '', 'M', 'DNF']);
  sheet.addRow(['Diskvalifikován', 'Pouze DSQ', '', 'M', 'DSQ']);
  sheet.getCell('C3').value = { formula: '50+50', result: 100 };
  const reference = workbook.addWorksheet('Poznámky');
  reference.getCell('B4').value = 'Nesoutěžní list';
  reference.state = 'hidden';
  const source = await readSource('zavod.xlsx', await bytes(workbook));
  const mapping = guessMapping(source.workbook.getWorksheet('ZaPsem')!, 2);
  const job = await prepareJob(source, [mapping], settings);
  return { job, source, mapping };
}
function bandRows(scores: number[], lowerIsBetter = false): BandInput[] {
  return scores.map((score, index) => ({
    id: String(index),
    group: 'M',
    score,
    lowerIsBetter,
    status: 'finished',
  }));
}
function allProposals(rows: BandInput[]) {
  return [...proposeBands(rows).values()].map((row) => [
    row.zlPointsNoCutoff,
    row.zlPointsWithCutoff,
    row.zlPointsGaussWithCutoff,
    row.zlPointsGaussOpenCutoff,
  ]);
}

describe('league scoring bands', () => {
  it('assigns seven intervals and never splits tied scores', () => {
    const proposals = proposeBands(bandRows([70, 60, 50, 40, 30, 20, 10, 0, 40]));
    expect([...proposals.values()].map((row) => row.zlPointsNoCutoff)).toEqual([
      16, 16, 12, 9, 6, 4, 2, 1, 9,
    ]);
    expect(allProposals(bandRows([70, 60, 50, 40, 30, 20, 10, 0, 40]))[3]).toEqual(
      allProposals(bandRows([70, 60, 50, 40, 30, 20, 10, 0, 40]))[8],
    );
  });
  it('supports ascending times, singleton groups, zeros and negative scores', () => {
    expect(proposeBands(bandRows([10, 20, 30], true)).get('0')!.zlPointsNoCutoff).toBe(16);
    expect(proposeBands(bandRows([10, 20, 30], true)).get('2')!.zlPointsNoCutoff).toBe(1);
    expect(proposeBands(bandRows([0, 0])).get('1')!.zlPointsNoCutoff).toBe(16);
    expect(proposeBands(bandRows([-5])).get('0')!.zlPointsNoCutoff).toBe(16);
    expect(proposeBands(bandRows([-20, -10])).get('1')!.zlPointsNoCutoff).toBe(16);
  });
  it('uses relative cutoff gaps independent of point units', () => {
    const scores = [100, 98, 96, 94, 92, 90, 88, 86, 84, 10, 9, 8];
    const original = allProposals(bandRows(scores));
    expect(original).toEqual(allProposals(bandRows(scores.map((score) => score / 100))));
    expect(proposeBands(bandRows(scores)).get('9')!.cutoffDropped).toBe(true);
  });
  it('rejects mixing ascending and descending results in a group', () => {
    expect(() => proposeBands([...bandRows([10]), { ...bandRows([20], true)[0], id: 'other' }])).toThrow(
      'opačné směry',
    );
  });
});

describe('universal workbook round trip', () => {
  it('reads multiple sheets and keeps source cells, formulas, formatting and row positions', async () => {
    const { job, source } = await fixture();
    const proposal = proposalWorkbook(job);
    const sheet = proposal.getWorksheet(PROPOSAL_SHEET)!;
    expect(sheet.getCell('M1').value).toBe(CHOICE_HEADER);
    // Deliberately reorder rows to verify matching uses IDs, not positions or names.
    const rowValues = Array.from(
      { length: job.participants.length },
      (_, index) => sheet.getRow(index + 2).values,
    );
    rowValues.reverse().forEach((values, index) => {
      sheet.getRow(index + 2).values = values;
    });
    const selections = await readSelections(job, await bytes(proposal));
    const final = await finalWorkbook(job, selections);
    const reloaded = new ExcelJS.Workbook();
    await reloaded.xlsx.load(await bytes(final));
    const original = source.workbook.getWorksheet('ZaPsem')!,
      result = reloaded.getWorksheet('ZaPsem')!;
    for (let row = 1; row <= original.rowCount; row++)
      for (let column = 1; column <= 6; column++)
        expect(result.getCell(row, column).value).toEqual(original.getCell(row, column).value);
    expect(result.getCell('A1').font).toEqual(original.getCell('A1').font);
    expect(result.getCell('F1').isMerged).toBe(true);
    expect(result.getColumn(1).width).toBe(32);
    expect(result.getCell('G2').value).toBe('Body ZL');
    expect(result.getCell('H3').value).toBe(2);
    expect(reloaded.getWorksheet('Poznámky')!.getCell('B4').value).toBe('Nesoutěžní list');
    expect(reloaded.getWorksheet('Poznámky')!.state).toBe('hidden');
    expect(reloaded.getWorksheet('ZL – oddíly')).toBeDefined();
    expect(reloaded.getWorksheet('ZL – příspěvky')).toBeDefined();
  });
  it('aggregates the best four contributions, weighted mixed teams, coefficient and participation', async () => {
    const { job } = await fixture();
    const choices = new Map(
      job.participants.map((row) => [
        row.id,
        { points: row.status === 'DSQ' ? 0 : row.status === 'DNF' ? 1 : 16, troop: row.troop },
      ]),
    );
    const totals = troopTotals(job, choices);
    expect(totals.find((row) => row.name === 'Severka')!.total).toBe(4 * 16 * 2 + 10);
    expect(totals.find((row) => row.name === 'Draci')!.total).toBeCloseTo((16 / 3 + 1) * 2 + 10);
    expect(totals.some((row) => row.name === 'Pouze DSQ')).toBe(false);
    expect(
      totals.find((row) => row.name === 'Severka')!.contributions.filter((entry) => entry.counted),
    ).toHaveLength(4);
    expect(parseTroops('Draci; draci; Severka')).toEqual([
      { name: 'Draci', share: 2 / 3 },
      { name: 'Severka', share: 1 / 3 },
    ]);
    const unlimited: LeagueJob = { ...job, settings: { coefficient: 1, maxResults: 0, participation: 0 } };
    expect(troopTotals(unlimited, choices).find((row) => row.name === 'Severka')!.performance).toBeCloseTo(
      6 * 16 + (16 * 2) / 3,
    );
  });
  it.each(['missing', 'duplicate', 'foreign', 'blank', 'invalid', 'header', 'misaligned', 'dsq', 'dnf'])(
    'rejects %s edits instead of misassigning points',
    async (kind) => {
      const { job } = await fixture();
      const proposal = proposalWorkbook(job),
        sheet = proposal.getWorksheet(PROPOSAL_SHEET)!;
      if (kind === 'missing') sheet.spliceRows(2, 1);
      if (kind === 'duplicate') sheet.getCell('A3').value = sheet.getCell('A2').value;
      if (kind === 'foreign') sheet.getCell('A2').value = 'foreign-job';
      if (kind === 'blank') sheet.getCell('M2').value = null;
      if (kind === 'invalid') sheet.getCell('M2').value = 15;
      if (kind === 'header') sheet.getCell('M1').value = 'Other';
      if (kind === 'misaligned') sheet.getCell('C2').value = sheet.getCell('C3').value;
      if (kind === 'dsq' || kind === 'dnf') {
        sheet.eachRow((row, index) => {
          if (row.getCell(8).value === kind.toUpperCase()) sheet.getCell(index, 13).value = 16;
        });
      }
      await expect(readSelections(job, await bytes(proposal))).rejects.toThrow();
    },
  );
  it('rejects an export for changed settings and detects missing cached formula values', async () => {
    const { job, source, mapping } = await fixture();
    const exported = await bytes(proposalWorkbook(job));
    const changed = await prepareJob(source, [mapping], { ...settings, coefficient: 3 });
    await expect(readSelections(changed, exported)).rejects.toThrow('ID');
    source.workbook.getWorksheet('ZaPsem')!.getCell('C3').value = { formula: '50+50' };
    await expect(prepareJob(source, [mapping], settings)).rejects.toThrow('uložený výsledek');
  });
  it('can recreate the same job after reloading the exact original file', async () => {
    const { job, source, mapping } = await fixture();
    const reopened = await readSource(source.name, source.bytes);
    const recreated = await prepareJob(reopened, [mapping], settings);
    expect((await readSelections(recreated, await bytes(proposalWorkbook(job)))).size).toBe(
      job.participants.length,
    );
  });
  it('supports CSV quoting, decimal commas, UTF-8 and time results', async () => {
    const text = '\uFEFFJméno;Oddíl;Čas;Kategorie\r\n"Novák; Jan";Draci;1:02,5;M\r\nDruhý;Draci;2:00;M\r\n';
    expect(parseCsv('Jméno,Oddíl,Body\n"A, B",Draci,42')).toEqual([
      ['Jméno', 'Oddíl', 'Body'],
      ['A, B', 'Draci', '42'],
    ]);
    const source = await readSource('draci.csv', new TextEncoder().encode(text).buffer);
    const mapping = {
      ...guessMapping(source.workbook.worksheets[0]),
      lowerIsBetter: true,
      scoreFormat: 'time' as const,
    };
    const job = await prepareJob(source, [mapping], settings);
    expect(job.participants[0].name).toBe('Novák; Jan');
    expect(job.participants[0].score).toBe(62.5);
    expect(job.participants[0].proposal.zlPointsNoCutoff).toBe(16);
    const selections = await readSelections(job, await bytes(proposalWorkbook(job)));
    const final = await finalWorkbook(job, selections);
    expect(final.worksheets[0].getCell('C2').value).toBe('1:02,5');
  });
  it('keeps equal names distinct and merges categories across sheets only when configured', async () => {
    const workbook = new ExcelJS.Workbook();
    for (const name of ['První', 'Druhý']) {
      const sheet = workbook.addWorksheet(name);
      sheet.addRow(['Jméno', 'Oddíl', 'Body', 'Kategorie']);
      sheet.addRow(['Stejné jméno', 'Draci', name === 'První' ? 100 : 1, 'M']);
    }
    const source = await readSource('race.xlsx', await bytes(workbook));
    const mappings = source.workbook.worksheets.map((sheet) => guessMapping(sheet));
    const together = await prepareJob(source, mappings, settings);
    expect(together.participants.map((row) => row.proposal.zlPointsNoCutoff)).toEqual([16, 1]);
    expect(new Set(together.participants.map((row) => row.id)).size).toBe(2);
    const separate = await prepareJob(
      source,
      mappings.map((mapping) => ({ ...mapping, categoryColumn: 0 })),
      settings,
    );
    expect(separate.participants.map((row) => row.proposal.zlPointsNoCutoff)).toEqual([16, 16]);
  });
  it('reads Excel durations and preserves existing ZL summary sheets', async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Časy');
    sheet.addRow(['Jméno', 'Oddíl', 'Čas']);
    sheet.addRow(['První', 'Draci', 90 / 86400]);
    sheet.addRow(['Druhý', 'Draci', 180 / 86400]);
    sheet.getColumn(3).numFmt = '[h]:mm:ss';
    workbook.addWorksheet('ZL – oddíly').getCell('A1').value = 'Původní souhrn';
    const source = await readSource('cas.xlsx', await bytes(workbook));
    const mapping = guessMapping(source.workbook.getWorksheet('Časy')!);
    expect(mapping.scoreFormat).toBe('time');
    const job = await prepareJob(source, [mapping], settings);
    expect(job.participants[0].score).toBeCloseTo(90);
    expect(job.participants[0].proposal.zlPointsNoCutoff).toBe(16);
    const final = await finalWorkbook(job, await readSelections(job, await bytes(proposalWorkbook(job))));
    expect(final.getWorksheet('ZL – oddíly')!.getCell('A1').value).toBe('Původní souhrn');
    expect(final.getWorksheet('ZL – oddíly (2)')).toBeDefined();
  });
  it('rejects missing fields, bad settings and invalid troop shares', async () => {
    const { source, mapping } = await fixture();
    await expect(prepareJob(source, [mapping], { ...settings, coefficient: NaN })).rejects.toThrow(
      'Koeficient',
    );
    await expect(prepareJob(source, [mapping], { ...settings, maxResults: 1.5 })).rejects.toThrow('celé');
    await expect(prepareJob(source, [{ ...mapping, nameColumn: 0 }], settings)).rejects.toThrow('sloupce');
    expect(() => parseTroops('Draci=-1')).toThrow();
    expect(() => parseTroops('')).toThrow();
  });
});
