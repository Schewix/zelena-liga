// @vitest-environment node
import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import { proposeBands, type BandInput } from '../league/bands';
import {
  CHOICE_HEADER,
  describeLeagueGroup,
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
    const sheet = proposal.getWorksheet('M')!;
    expect(sheet.getCell('I1').value).toBe(CHOICE_HEADER);
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
        sheet = proposal.getWorksheet('M')!;
      if (kind === 'missing') sheet.spliceRows(2, 1);
      if (kind === 'duplicate') sheet.getCell('A3').value = sheet.getCell('A2').value;
      if (kind === 'foreign') sheet.getCell('A2').value = 'foreign-job';
      if (kind === 'blank') sheet.getCell('I2').value = null;
      if (kind === 'invalid') sheet.getCell('I2').value = 15;
      if (kind === 'header') sheet.getCell('I1').value = 'Other';
      if (kind === 'misaligned') sheet.getCell('C2').value = sheet.getCell('C3').value;
      if (kind === 'dsq' || kind === 'dnf') {
        sheet.eachRow((row, index) => {
          if (row.getCell(4).value === kind.toUpperCase()) sheet.getCell(index, 9).value = 16;
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

async function categoryTimeFixture() {
  const workbook = new ExcelJS.Workbook();
  const names = ['H8', 'H10', 'H12', 'H14', 'H18', 'H+', 'D8', 'D10', 'D12', 'D14', 'D18', 'D+', 'S'];
  names.forEach((name, index) => {
    const sheet = workbook.addWorksheet(name);
    sheet.addRow(['#', 'Jméno', 'Oddíl', 'Čas']);
    const baseSeconds = 1200 + index * 300;
    sheet.addRow(['1.', 'První', 'Oddíl A', baseSeconds / 86400]);
    sheet.addRow(['2.', 'Druhý', 'Oddíl B', (baseSeconds + 120) / 86400]);
    sheet.addRow(['DISK', 'Diskvalifikovaný', 'Oddíl C', 'DISK']);
    sheet.addRow(['VZDAL', 'Nedokončil', 'Oddíl D', 'VZDAL']);
    sheet.getColumn(4).numFmt = 'h:mm:ss';
  });
  const source = await readSource('categories.xlsx', await bytes(workbook));
  const mappings = source.workbook.worksheets.map((sheet) => guessMapping(sheet));
  const job = await prepareJob(source, mappings, settings);
  return { job, mappings, names };
}

describe('categories from worksheet names', () => {
  it('exports H/D age categories, plus categories and S as separate worksheets in source order', async () => {
    const { job, mappings, names } = await categoryTimeFixture();
    expect(
      mappings.every(
        (mapping) =>
          !mapping.categoryColumn &&
          !mapping.sexColumn &&
          mapping.lowerIsBetter &&
          mapping.scoreFormat === 'time',
      ),
    ).toBe(true);
    expect([...new Set(job.participants.map((row) => row.group))]).toEqual(names);
    expect(describeLeagueGroup('H8')).toBe('H8 – hoši, věková kategorie 8');
    expect(describeLeagueGroup('D+')).toBe('D+ – dívky, věková kategorie +');
    expect(describeLeagueGroup('S')).toBe('S');
    const proposal = proposalWorkbook(job);
    expect(proposal.worksheets.map((sheet) => sheet.name)).toEqual(names);
    for (const name of names) {
      const sheet = proposal.getWorksheet(name)!;
      expect(sheet.rowCount).toBe(5);
      expect(sheet.getCell('B2').value).toBe(name);
      expect(sheet.getCell('I2').value).toBe(16);
      expect(sheet.getCell('I3').value).toBe(1);
      expect(sheet.getCell('C2').numFmt).toBe('[h]:mm:ss');
      expect(Number(sheet.getCell('C2').value) * 86400).toBeCloseTo(
        job.participants.find((row) => row.group === name)!.score!,
      );
    }
    // Choose different bands on different sheets and return the entire workbook.
    proposal.getWorksheet('H8')!.getCell('I2').value = 12;
    proposal.getWorksheet('D8')!.getCell('I2').value = 9;
    const selected = await readSelections(job, await bytes(proposal));
    expect(selected.size).toBe(52);
    const final = await finalWorkbook(job, selected);
    expect(final.getWorksheet('H8')!.getCell('E2').value).toBe(12);
    expect(final.getWorksheet('D8')!.getCell('E2').value).toBe(9);
    expect(final.getWorksheet('H10')!.getCell('E2').value).toBe(16);
  });

  it('still imports the old single-sheet proposal format', async () => {
    const { job } = await categoryTimeFixture();
    const legacy = new ExcelJS.Workbook();
    const sheet = legacy.addWorksheet(PROPOSAL_SHEET);
    sheet.addRow([
      'ID výsledku',
      'Původní list',
      'Původní řádek',
      'Soutěžící / hlídka',
      'Oddíl / rozdělení',
      'Skupina',
      'Výsledek',
      'Stav',
      'Bez cut-off',
      'S cut-off',
      'Gauss s cut-off',
      'Gauss otevřený cut-off',
      CHOICE_HEADER,
    ]);
    for (const row of job.participants) {
      const p = row.proposal;
      const oldId = `${job.key}:${job.source.workbook.getWorksheet(row.sheet)!.id}:${row.row}`;
      sheet.addRow([
        oldId,
        row.sheet,
        row.row,
        row.name,
        row.troop,
        row.group,
        row.score,
        row.status,
        p.zlPointsNoCutoff,
        p.zlPointsWithCutoff,
        p.zlPointsGaussWithCutoff,
        p.zlPointsGaussOpenCutoff,
        p.zlPointsNoCutoff,
      ]);
    }
    expect((await readSelections(job, await bytes(legacy))).size).toBe(job.participants.length);
  });

  it('rejects a missing category and duplicates across category sheets', async () => {
    const { job } = await categoryTimeFixture();
    const missing = proposalWorkbook(job);
    missing.removeWorksheet('D8');
    await expect(readSelections(job, await bytes(missing))).rejects.toThrow('chybí 4 výsledků');
    const duplicate = proposalWorkbook(job);
    duplicate.getWorksheet('D8')!.addRow(duplicate.getWorksheet('H8')!.getRow(2).values);
    await expect(readSelections(job, await bytes(duplicate))).rejects.toThrow('dvakrát');
  });

  it('uses unique valid sheet names without merging groups when labels collide', async () => {
    const { job } = await categoryTimeFixture();
    const labels = [
      'Kategorie / velmi dlouhý název pro test A',
      'Kategorie : velmi dlouhý název pro test B',
      'Kategorie A',
      'kategorie a',
    ];
    const renamed: LeagueJob = {
      ...job,
      participants: job.participants.slice(0, 4).map((row, index) => ({ ...row, group: labels[index] })),
    };
    const proposal = proposalWorkbook(renamed);
    expect(proposal.worksheets).toHaveLength(4);
    expect(new Set(proposal.worksheets.map((sheet) => sheet.name.toLowerCase())).size).toBe(4);
    expect(proposal.worksheets.every((sheet) => sheet.name.length <= 31)).toBe(true);
    expect((await readSelections(renamed, await bytes(proposal))).size).toBe(4);
  });
});

describe('anonymous band proposals', () => {
  it('omits identities, source coordinates and source filename from all sheets including hidden content', async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('H8');
    sheet.addRow(['Jméno', 'Oddíl', 'Body']);
    sheet.addRow(['Soukromé jméno Alfa', 'Soukromý oddíl Gama', 100]);
    sheet.addRow(['Soukromá hlídka Beta', 'Soukromý oddíl Delta', 50]);
    sheet.getCell('B2').note = 'Soukromá poznámka';
    const source = await readSource('Soukromý název souboru.xlsx', await bytes(workbook));
    const job = await prepareJob(source, [guessMapping(source.workbook.worksheets[0])], settings);
    const proposal = proposalWorkbook(job);
    const saved = new ExcelJS.Workbook();
    await saved.xlsx.load(await bytes(proposal));
    const model = JSON.stringify(saved.model);
    for (const value of [
      'Soukromé jméno Alfa',
      'Soukromá hlídka Beta',
      'Soukromý oddíl Gama',
      'Soukromý oddíl Delta',
      'Soukromá poznámka',
      source.name,
      'Původní řádek',
      'Původní list',
      'Soutěžící / hlídka',
      'Oddíl / rozdělení',
    ])
      expect(model).not.toContain(value);
    const resultSheet = saved.getWorksheet('H8')!;
    expect(resultSheet.columnCount).toBe(9);
    expect(resultSheet.getColumn(1).hidden).toBe(true);
    for (const participant of job.participants) expect(participant.id).toMatch(/^[a-f0-9]{64}$/);
    expect(new Set(job.participants.map((row) => row.id)).size).toBe(2);
    resultSheet.getCell('I2').value = 12;
    resultSheet.getCell('I3').value = 4;
    const first = resultSheet.getRow(2).values;
    resultSheet.getRow(2).values = resultSheet.getRow(3).values;
    resultSheet.getRow(3).values = first;
    const selected = await readSelections(job, await bytes(saved));
    const output = await finalWorkbook(job, selected);
    expect(output.getWorksheet('H8')!.getCell('A2').value).toBe('Soukromé jméno Alfa');
    expect(output.getWorksheet('H8')!.getCell('B2').value).toBe('Soukromý oddíl Gama');
    expect(output.getWorksheet('H8')!.getCell('D2').value).toBe(12);
    expect(output.getWorksheet('H8')!.getCell('D3').value).toBe(4);
    expect(output.getWorksheet('ZL – oddíly')!.getCell('B2').value).toBe('Soukromý oddíl Gama');
  });
});
