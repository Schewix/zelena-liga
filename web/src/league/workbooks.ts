import ExcelJS from 'exceljs';
import {
  addProposalControls,
  CUSTOM_VARIANT,
  LEGACY_VARIANT_FORMULA,
  VARIANT_FORMULA,
  readCustomPoints,
  sortedResults,
} from './proposalControls';
import { proposeBands, ZL_BAND_POINTS, type BandInput, type BandProposal } from './bands';

export type SheetMapping = {
  sheet: string;
  enabled: boolean;
  headerRow: number;
  endRow: number;
  nameColumn: number;
  troopColumn: number;
  scoreColumn: number;
  categoryColumn: number;
  sexColumn: number;
  statusColumn: number;
  group: string;
  lowerIsBetter: boolean;
  scoreFormat: 'number' | 'time';
};
export type LeagueSettings = { coefficient: number; maxResults: number; participation: number };
export type SourceFile = {
  name: string;
  bytes: ArrayBuffer;
  workbook: ExcelJS.Workbook;
  fingerprint: string;
};
export type Participant = BandInput & {
  sheet: string;
  row: number;
  name: string;
  troop: string;
  proposal: BandProposal;
};
export type LeagueJob = {
  source: SourceFile;
  mappings: SheetMapping[];
  settings: LeagueSettings;
  participants: Participant[];
  key: string;
};
export type Selection = { points: number; troop: string };
// Legacy exports used one shared sheet; the importer still accepts that layout.
export const PROPOSAL_SHEET = 'Návrhy pásem';
export const CHOICE_HEADER = 'Vybrané body ZL';
const LEGACY_HEADERS = [
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
];
const HEADERS = [
  'ID výsledku',
  'Skupina',
  'Výsledek',
  'Stav',
  'Bez cut-off',
  'S cut-off',
  'Gauss s cut-off',
  'Gauss otevřený cut-off',
  CHOICE_HEADER,
];
const VARIANT_CELL = 'K2';
const normalize = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLocaleLowerCase('cs');

export function cellValue(cell: ExcelJS.Cell): unknown {
  const value = cell.value;
  if (value && typeof value === 'object') {
    if ('formula' in value || 'sharedFormula' in value) return value.result;
    if ('richText' in value) return value.richText.map((run) => run.text).join('');
    if ('text' in value) return value.text;
  }
  return value;
}
export const cellText = (cell: ExcelJS.Cell) => {
  const value = cellValue(cell);
  return value === undefined || value === null ? '' : String(value).trim();
};
export function parseNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string' || !value.trim()) return null;
  const text = value
    .trim()
    .replace(/[\s\u00a0]/g, '')
    .replace(',', '.');
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(text)) return null;
  const number = Number(text);
  return Number.isFinite(number) ? number : null;
}
function parseScore(cell: ExcelJS.Cell, format: SheetMapping['scoreFormat']): number | null {
  const value = cellValue(cell);
  if (format === 'number') return parseNumber(value);
  if (value instanceof Date) return (value.getTime() - Date.UTC(1899, 11, 30)) / 1000;
  // Excel stores duration cells as fractions of a day.
  if (typeof value === 'number') return value * 86400;
  if (typeof value !== 'string') return null;
  const match = value.trim().match(/^(?:(\d+):)?(\d+):([0-5]?\d(?:[.,]\d+)?)$/);
  if (!match || (match[1] && Number(match[2]) >= 60)) return null;
  return Number(match[1] ?? 0) * 3600 + Number(match[2]) * 60 + Number(match[3].replace(',', '.'));
}
async function digest(bytes: ArrayBuffer): Promise<string> {
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

export function parseCsv(text: string): string[][] {
  const input = text.replace(/^\uFEFF/, '');
  // Only count separators outside quotes in the first record.
  let quoted = false;
  const counts = new Map([
    [',', 0],
    [';', 0],
    ['\t', 0],
  ]);
  for (let i = 0; i < input.length; i++) {
    const char = input[i];
    if (char === '"') {
      if (quoted && input[i + 1] === '"') i++;
      else quoted = !quoted;
    } else if (!quoted) {
      if (char === '\n' || char === '\r') break;
      if (counts.has(char)) counts.set(char, counts.get(char)! + 1);
    }
  }
  const delimiter = [...counts].sort((a, b) => b[1] - a[1])[0][0];
  const rows: string[][] = [];
  let row: string[] = [],
    field = '';
  quoted = false;
  for (let i = 0; i < input.length; i++) {
    const char = input[i];
    if (char === '"') {
      if (quoted && input[i + 1] === '"') {
        field += '"';
        i++;
      } else if (quoted || field === '') quoted = !quoted;
      else field += char;
    } else if (!quoted && (char === delimiter || char === '\n' || char === '\r')) {
      row.push(field);
      field = '';
      if (char !== delimiter) {
        rows.push(row);
        row = [];
        if (char === '\r' && input[i + 1] === '\n') i++;
      }
    } else field += char;
  }
  if (quoted) throw new Error('CSV obsahuje neuzavřené uvozovky.');
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}
export async function readSource(name: string, bytes: ArrayBuffer): Promise<SourceFile> {
  const workbook = new ExcelJS.Workbook();
  if (/\.csv$/i.test(name)) {
    const sheet = workbook.addWorksheet('Výsledky');
    for (const row of parseCsv(new TextDecoder('utf-8', { fatal: true }).decode(bytes))) sheet.addRow(row);
  } else if (/\.xlsx$/i.test(name)) {
    await workbook.xlsx.load(bytes);
  } else throw new Error('Vyber soubor XLSX nebo CSV v kódování UTF-8. Starší XLS nejdřív ulož jako XLSX.');
  if (!workbook.worksheets.length) throw new Error('Soubor neobsahuje žádné listy.');
  return { name, bytes, workbook, fingerprint: await digest(bytes) };
}
const ALIASES = {
  nameColumn: [
    'hlidka',
    'cislo hlidky',
    'soutezici',
    'jmeno',
    'jmeno a prijmeni',
    'tym',
    'druzstvo',
    'zavodnik',
  ],
  troopColumn: ['oddil', 'nazev oddilu', 'pto', 'klub'],
  scoreColumn: ['body celkem', 'celkem', 'vysledek', 'body', 'celkovy cas', 'cas'],
  categoryColumn: ['kategorie'],
  sexColumn: ['pohlavi', 'sex'],
  statusColumn: ['stav', 'status', 'poradi', '#'],
};
export function describeLeagueGroup(group: string): string {
  const match = group.trim().match(/^([HD])\s*(\d+|\+)$/i);
  if (!match) return group;
  return `${group} – ${match[1].toUpperCase() === 'H' ? 'hoši' : 'dívky'}, věková kategorie ${match[2]}`;
}

export function guessMapping(sheet: ExcelJS.Worksheet, headerRow = 1): SheetMapping {
  const mapping: SheetMapping = {
    sheet: sheet.name,
    enabled: sheet.state === 'visible',
    headerRow,
    endRow: sheet.rowCount,
    nameColumn: 0,
    troopColumn: 0,
    scoreColumn: 0,
    categoryColumn: 0,
    sexColumn: 0,
    statusColumn: 0,
    group: sheet.name,
    lowerIsBetter: false,
    scoreFormat: 'number',
  };
  for (const [field, aliases] of Object.entries(ALIASES)) {
    for (const alias of aliases) {
      for (let column = 1; column <= sheet.columnCount; column++) {
        if (normalize(cellText(sheet.getCell(headerRow, column))) === alias) {
          mapping[field as keyof typeof ALIASES] = column;
          break;
        }
      }
      if (mapping[field as keyof typeof ALIASES]) break;
    }
  }
  if (normalize(cellText(sheet.getCell(headerRow, mapping.scoreColumn || 1))).includes('cas'))
    mapping.lowerIsBetter = true;
  if (mapping.scoreColumn) {
    const example = sheet.getCell(headerRow + 1, mapping.scoreColumn);
    if (
      cellValue(example) instanceof Date ||
      /^(?:\d+:)?\d+:[0-5]?\d(?:[.,]\d+)?$/.test(cellText(example)) ||
      /\[h\]|h+:mm|m+:ss/i.test(example.numFmt)
    ) {
      mapping.scoreFormat = 'time';
    }
  }
  return mapping;
}
export function validateSettings(settings: LeagueSettings) {
  if (!Number.isFinite(settings.coefficient) || settings.coefficient <= 0)
    throw new Error('Koeficient musí být kladné číslo.');
  if (!Number.isSafeInteger(settings.maxResults) || settings.maxResults < 0)
    throw new Error('Počet započtených výsledků musí být celé nezáporné číslo (0 = všechny).');
  if (!Number.isFinite(settings.participation) || settings.participation < 0)
    throw new Error('Body za účast musí být nezáporné číslo.');
}
export function parseTroops(value: string): { name: string; share: number }[] {
  const parts = value
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean);
  if (!parts.length) throw new Error('Chybí oddíl.');
  const weights = new Map<string, { name: string; weight: number }>();
  for (const part of parts) {
    const match = part.match(/^(.*?)\s*=\s*([^=]+)$/);
    const name = (match ? match[1] : part).trim().replace(/\s+/g, ' ');
    const weight = match ? parseNumber(match[2]) : 1;
    if (!name || weight === null || weight <= 0)
      throw new Error(`Neplatné rozdělení oddílů: ${part}. Použij „Oddíl A=2; Oddíl B=1“.`);
    const key = normalize(name);
    const existing = weights.get(key);
    weights.set(key, { name: existing?.name ?? name, weight: (existing?.weight ?? 0) + weight });
  }
  const total = [...weights.values()].reduce((sum, item) => sum + item.weight, 0);
  if (!Number.isFinite(total)) throw new Error('Neplatný součet podílů oddílů.');
  return [...weights.values()].map(({ name, weight }) => ({ name, share: weight / total }));
}
function statusOf(text: string): BandInput['status'] | null {
  const value = normalize(text);
  if (/^(dsq|dq|disk|diskvalifikace|diskvalifikovan[ay])$/.test(value)) return 'DSQ';
  if (/^(dnf|nedokoncil[ao]?|nedobeh[l]?|vzdal[ao]?)$/.test(value)) return 'DNF';
  if (/^(dns|nestartoval[ao]?)$/.test(value)) return 'DNS';
  if (!value || /^(ok|finished|dokonceno|dokoncil[ao]?|\d+\.?)$/.test(value)) return 'finished';
  return null;
}
export async function prepareJob(
  source: SourceFile,
  mappings: SheetMapping[],
  settings: LeagueSettings,
): Promise<LeagueJob> {
  validateSettings(settings);
  const active = mappings.filter((mapping) => mapping.enabled);
  if (!active.length) throw new Error('Vyber alespoň jeden list s výsledky.');
  const key = await digest(
    new TextEncoder().encode(JSON.stringify([source.fingerprint, active, settings])).buffer,
  );
  const participants: Participant[] = [];
  for (const mapping of active) {
    const sheet = source.workbook.getWorksheet(mapping.sheet)!;
    if (
      !Number.isInteger(mapping.headerRow) ||
      mapping.headerRow < 1 ||
      !Number.isInteger(mapping.endRow) ||
      mapping.endRow <= mapping.headerRow ||
      mapping.endRow > sheet.rowCount
    )
      throw new Error(`${sheet.name}: zkontroluj řádek záhlaví a poslední řádek výsledků.`);
    const required = [mapping.nameColumn, mapping.troopColumn, mapping.scoreColumn];
    if (
      required.some((column) => !Number.isInteger(column) || column < 1 || column > sheet.columnCount) ||
      new Set(required).size !== 3
    )
      throw new Error(`${sheet.name}: vyber tři různé sloupce pro soutěžícího, oddíl a výsledek.`);
    for (let row = mapping.headerRow + 1; row <= mapping.endRow; row++) {
      const text = (column: number) => (column ? cellText(sheet.getCell(row, column)) : '');
      const name = text(mapping.nameColumn),
        troop = text(mapping.troopColumn),
        scoreText = text(mapping.scoreColumn);
      if (!name && !troop && !scoreText) continue;
      const location = `${sheet.name}, řádek ${row}`;
      if (!name || !troop)
        throw new Error(`${location}: chybí soutěžící nebo oddíl. Uprav rozsah, pokud jde o souhrnný řádek.`);
      try {
        parseTroops(troop);
      } catch (error) {
        throw new Error(`${location}: ${(error as Error).message}`);
      }
      const rawStatus = text(mapping.statusColumn);
      let status = statusOf(rawStatus);
      if (status === null)
        throw new Error(
          `${location}: neznámý stav „${rawStatus}“. Vyber sloupec se stavem DSQ, DNF, DNS nebo pořadím.`,
        );
      const scoreStatus = statusOf(scoreText);
      if (status === 'finished' && scoreStatus && scoreStatus !== 'finished') status = scoreStatus;
      const score = parseScore(sheet.getCell(row, mapping.scoreColumn), mapping.scoreFormat);
      if (status === 'finished' && score === null)
        throw new Error(
          `${location}: výsledek „${scoreText}“ není platné číslo/čas. Pro nedokončené použij DNF; vzorce musí mít uložený výsledek.`,
        );
      const category = text(mapping.categoryColumn),
        sex = text(mapping.sexColumn);
      if (mapping.categoryColumn && !category) throw new Error(`${location}: chybí kategorie.`);
      if (mapping.sexColumn && !sex) throw new Error(`${location}: chybí pohlaví.`);
      const group = [category || mapping.group.trim() || sheet.name, sex].filter(Boolean).join(' / ');
      participants.push({
        id: await digest(new TextEncoder().encode(`${key}:${sheet.id}:${row}`).buffer),
        name,
        troop,
        sheet: sheet.name,
        row,
        group,
        score,
        status,
        lowerIsBetter: mapping.lowerIsBetter,
        proposal: {} as BandProposal,
      });
    }
  }
  if (!participants.length) throw new Error('Ve vybraném rozsahu nejsou žádní soutěžící.');
  const proposals = proposeBands(participants);
  for (const participant of participants) participant.proposal = proposals.get(participant.id)!;
  return { source, mappings: structuredClone(active), settings: { ...settings }, participants, key };
}
function styleSheet(sheet: ExcelJS.Worksheet) {
  sheet.views = [{ state: 'frozen', ySplit: 1 }];
  sheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: Math.max(1, sheet.rowCount), column: sheet.columnCount },
  };
  sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF04372C' } };
  sheet.getRow(1).alignment = { wrapText: true, vertical: 'middle' };
  sheet.getRow(1).height = 34;
  sheet.columns.forEach((column) => {
    column.width = 23;
  });
}
export function proposalWorkbook(job: LeagueJob): ExcelJS.Workbook {
  const workbook = new ExcelJS.Workbook();
  workbook.calcProperties.fullCalcOnLoad = true;
  // Keep source category order, but sort competitors by performance within each category.
  const groups = new Map<string, Participant[]>();
  for (const participant of job.participants) {
    const rows = groups.get(participant.group) ?? [];
    rows.push(participant);
    groups.set(participant.group, rows);
  }
  for (const [group, participants] of groups) {
    const sheet = addUniqueSheet(workbook, group);
    sheet.addRow(HEADERS);
    const sorted = sortedResults(participants);
    const previousDropped = new Map<string, boolean>();
    for (const participant of sorted) {
      const p = participant.proposal;
      const isTime =
        job.mappings.find((mapping) => mapping.sheet === participant.sheet)?.scoreFormat === 'time';
      const row = sheet.addRow([
        participant.id,
        participant.group,
        isTime && participant.score !== null ? participant.score / 86400 : participant.score,
        participant.status,
        p.zlPointsNoCutoff,
        p.zlPointsWithCutoff,
        p.zlPointsGaussWithCutoff,
        p.zlPointsGaussOpenCutoff,
        p.zlPointsNoCutoff,
      ]);
      row.getCell(9).value = { formula: VARIANT_FORMULA, result: p.zlPointsNoCutoff };
      if (isTime) row.getCell(3).numFmt = '[h]:mm:ss';
      row.getCell(9).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF2CC' } };
      row.getCell(9).dataValidation = {
        type: 'list',
        allowBlank: false,
        formulae: ['"0,1,2,4,6,9,12,16"'],
        showErrorMessage: true,
        error: 'Vyber platné body ZL.',
      };
      [p.cutoffDropped, p.gaussCutoffDropped, p.gaussOpenCutoffDropped].forEach((dropped, index) => {
        const key = `${participant.group}:${index}`;
        if (dropped && !previousDropped.get(key))
          row.getCell(6 + index).border = { top: { style: 'thick', color: { argb: 'FFC62828' } } };
        previousDropped.set(key, dropped);
      });
    }
    styleSheet(sheet);
    sheet.getColumn(1).hidden = true;
    const rowIsTime = (participant: Participant) =>
      job.mappings.find((mapping) => mapping.sheet === participant.sheet)?.scoreFormat === 'time';
    addProposalControls(sheet, participants, participants.every(rowIsTime), rowIsTime);
  }
  return workbook;
}
export async function readSelections(job: LeagueJob, bytes: ArrayBuffer): Promise<Map<string, Selection>> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(bytes);
  // Headers identify both anonymized exports and older proposals with identity columns.
  const sheets = workbook.worksheets.filter(
    (sheet) =>
      cellText(sheet.getCell(1, 1)) === HEADERS[0] ||
      cellText(sheet.getCell(1, 9)) === CHOICE_HEADER ||
      cellText(sheet.getCell(1, 13)) === CHOICE_HEADER,
  );
  if (!sheets.length) throw new Error('Chybí listy s návrhy pásem. Nahraj upravený export návrhů.');
  const expected = new Map(job.participants.map((row) => [row.id, row]));
  // Support proposals downloaded before IDs became opaque; never write these old IDs in new exports.
  const legacyExpected = new Map(
    job.participants.map((row) => [
      `${job.key}:${job.source.workbook.getWorksheet(row.sheet)!.id}:${row.row}`,
      row,
    ]),
  );
  const selected = new Map<string, Selection>();
  for (const sheet of sheets) {
    const customByGroup = new Map<string, Map<string, number>>();
    const legacy = cellText(sheet.getCell(1, 2)) === LEGACY_HEADERS[1];
    const headers = legacy ? LEGACY_HEADERS : HEADERS;
    for (let column = 1; column <= headers.length; column++) {
      if (cellText(sheet.getCell(1, column)) !== headers[column - 1])
        throw new Error('Záhlaví návrhu bylo změněno. Zachovej původní názvy a pořadí sloupců.');
    }
    for (let row = 2; row <= sheet.rowCount; row++) {
      if (
        !Array.from({ length: headers.length }, (_, i) => cellText(sheet.getCell(row, i + 1))).some(Boolean)
      )
        continue;
      const location = `${sheet.name}, řádek ${row}`;
      const id = cellText(sheet.getCell(row, 1));
      const participant = expected.get(id) ?? (legacy ? legacyExpected.get(id) : undefined);
      if (!participant)
        throw new Error(
          `${location}: cizí nebo chybějící ID. Návrh musí patřit k tomuto souboru a nastavení.`,
        );
      if (selected.has(participant.id))
        throw new Error(`${location}: stejné ID výsledku je v návrhu dvakrát.`);
      if (legacy) {
        if (
          cellText(sheet.getCell(row, 2)) !== participant.sheet ||
          parseNumber(cellValue(sheet.getCell(row, 3))) !== participant.row ||
          cellText(sheet.getCell(row, 4)) !== participant.name ||
          cellText(sheet.getCell(row, 6)) !== participant.group ||
          cellText(sheet.getCell(row, 8)) !== participant.status
        ) {
          throw new Error(
            `${location}: údaje soutěžícího neodpovídají ID. Při řazení přesouvej celé řádky včetně skrytého ID.`,
          );
        }
      } else {
        const format = job.mappings.find((mapping) => mapping.sheet === participant.sheet)!.scoreFormat;
        const score = parseScore(sheet.getCell(row, 3), format);
        const matchingScore =
          score === null || participant.score === null
            ? score === participant.score
            : Math.abs(score - participant.score) <= Math.max(1e-6, Math.abs(participant.score) * 1e-10);
        if (
          cellText(sheet.getCell(row, 2)) !== participant.group ||
          cellText(sheet.getCell(row, 4)) !== participant.status ||
          !matchingScore
        ) {
          throw new Error(
            `${location}: skupina, výsledek nebo stav neodpovídá ID. Při řazení přesouvej celé řádky včetně skrytého ID; upravuj pouze vybrané body.`,
          );
        }
      }
      const choice = sheet.getCell(row, legacy ? 13 : 9);
      let points = parseNumber(cellValue(choice));
      if (
        !legacy &&
        choice.type === ExcelJS.ValueType.Formula &&
        [VARIANT_FORMULA, LEGACY_VARIANT_FORMULA].includes(choice.formula)
      ) {
        // ExcelJS does not calculate formulas. Resolve our selector directly instead of trusting
        // cached results, which can be stale when a workbook was saved without recalculation.
        const variant = cellText(sheet.getCell(VARIANT_CELL));
        if (variant === CUSTOM_VARIANT && choice.formula === VARIANT_FORMULA) {
          if (!customByGroup.has(participant.group)) {
            const participants = job.participants.filter((p) => p.group === participant.group);
            const time = participants.every(
              (p) => job.mappings.find((mapping) => mapping.sheet === p.sheet)?.scoreFormat === 'time',
            );
            try {
              customByGroup.set(
                participant.group,
                readCustomPoints(participants, cellText(sheet.getCell('K5')), time),
              );
            } catch (error) {
              throw new Error(`${sheet.name}: ${(error as Error).message}`);
            }
          }
          points = customByGroup.get(participant.group)!.get(participant.id)!;
        } else {
          const variantIndex = HEADERS.slice(4, 8).indexOf(variant);
          if (variantIndex < 0)
            throw new Error(`${sheet.name}: v buňce ${VARIANT_CELL} vyber platnou variantu bodů.`);
          points = parseNumber(cellValue(sheet.getCell(row, 5 + variantIndex)));
        }
      }
      if (points === null || ![0, ...ZL_BAND_POINTS].includes(points))
        throw new Error(`${location}: ve sloupci „${CHOICE_HEADER}“ musí být 0, 1, 2, 4, 6, 9, 12 nebo 16.`);
      if ((participant.status === 'DSQ' || participant.status === 'DNS') && points !== 0)
        throw new Error(`${location}: DSQ/DNS musí mít 0 bodů.`);
      if (participant.status === 'DNF' && points !== 1) throw new Error(`${location}: DNF musí mít 1 bod.`);
      // New proposals contain no troop data. Restore it only from the original upload.
      const troop = legacy ? cellText(sheet.getCell(row, 5)) : participant.troop;
      try {
        parseTroops(troop);
      } catch (error) {
        throw new Error(`${location}: ${(error as Error).message}`);
      }
      selected.set(participant.id, { points, troop });
    }
  }
  if (selected.size !== expected.size)
    throw new Error(`V návrhu chybí ${expected.size - selected.size} výsledků. Zachovej všechny řádky.`);
  return selected;
}
export type TroopTotal = {
  name: string;
  performance: number;
  total: number;
  counted: string[];
  contributions: { participant: Participant; points: number; counted: boolean }[];
};
export function troopTotals(job: LeagueJob, selections: Map<string, Selection>): TroopTotal[] {
  const troops = new Map<string, TroopTotal>();
  for (const participant of job.participants) {
    const selected = selections.get(participant.id);
    if (!selected) throw new Error(`Chybí body pro ${participant.name}.`);
    if (participant.status === 'DSQ' || participant.status === 'DNS') continue;
    for (const { name, share } of parseTroops(selected.troop)) {
      const key = normalize(name);
      const troop = troops.get(key) ?? { name, performance: 0, total: 0, counted: [], contributions: [] };
      troop.contributions.push({ participant, points: selected.points * share, counted: false });
      troops.set(key, troop);
    }
  }
  for (const troop of troops.values()) {
    troop.contributions.sort(
      (a, b) => b.points - a.points || a.participant.id.localeCompare(b.participant.id),
    );
    const count = job.settings.maxResults || troop.contributions.length;
    troop.contributions.forEach((entry, index) => {
      entry.counted = index < count;
    });
    const counted = troop.contributions.filter((entry) => entry.counted);
    troop.counted = counted.map(
      ({ participant }) => `${participant.name} (${participant.sheet}:${participant.row})`,
    );
    troop.performance = counted.reduce((sum, entry) => sum + entry.points, 0);
    troop.total = troop.performance * job.settings.coefficient + job.settings.participation;
    if (!Number.isFinite(troop.total))
      throw new Error('Součet bodů je příliš velký. Zkontroluj koeficient a body za účast.');
  }
  return [...troops.values()].sort((a, b) => b.total - a.total || a.name.localeCompare(b.name, 'cs'));
}
function addUniqueSheet(workbook: ExcelJS.Workbook, name: string) {
  const base =
    name
      .replace(/[\\/*?:[\]\x00-\x1f]/g, ' ')
      .replace(/^'+|'+$/g, '')
      .trim() || 'Skupina';
  let unique = base.slice(0, 31).replace(/'+$/, '');
  let index = 2;
  while (workbook.worksheets.some((sheet) => sheet.name.toLocaleLowerCase() === unique.toLocaleLowerCase())) {
    const suffix = ` (${index++})`;
    unique = `${base.slice(0, 31 - suffix.length).trimEnd()}${suffix}`;
  }
  return workbook.addWorksheet(unique);
}
export async function finalWorkbook(
  job: LeagueJob,
  selections: Map<string, Selection>,
): Promise<ExcelJS.Workbook> {
  // Reload the original, never the edited proposal: original cell positions, formulas and sheets survive.
  const { workbook } = await readSource(job.source.name, job.source.bytes);
  for (const mapping of job.mappings) {
    const sheet = workbook.getWorksheet(mapping.sheet)!;
    const start = sheet.columnCount + 1;
    ['Body ZL', 'Koeficient ZL', 'Body ZL × koeficient', 'Oddíl pro ZL'].forEach((header, index) => {
      const cell = sheet.getCell(mapping.headerRow, start + index);
      cell.value = header;
      cell.font = { bold: true };
      sheet.getColumn(start + index).width = index === 3 ? 36 : 23;
    });
    for (const participant of job.participants.filter((row) => row.sheet === mapping.sheet)) {
      const selected = selections.get(participant.id);
      if (!selected) throw new Error(`Chybí body pro ${participant.name}.`);
      [
        selected.points,
        job.settings.coefficient,
        selected.points * job.settings.coefficient,
        selected.troop,
      ].forEach((value, index) => {
        const cell = sheet.getCell(participant.row, start + index);
        cell.value = value;
        if (index < 3) cell.numFmt = '0.00';
      });
    }
  }
  const summary = addUniqueSheet(workbook, 'ZL – oddíly');
  summary.addRow([
    'Pořadí',
    'Oddíl',
    job.settings.maxResults
      ? `Body ZL (max ${job.settings.maxResults} výsledky)`
      : 'Body ZL (všechny výsledky)',
    'Koeficient',
    'Body za účast',
    'Body ZL celkem',
    'Započtené výsledky',
  ]);
  const audit = addUniqueSheet(workbook, 'ZL – příspěvky');
  audit.addRow(['Oddíl', 'Soutěžící / hlídka', 'List', 'Řádek', 'Body ZL', 'Příspěvek oddílu', 'Započteno']);
  const totals = troopTotals(job, selections);
  totals.forEach((troop) => {
    const rank = totals.findIndex((entry) => Math.abs(entry.total - troop.total) < 1e-9) + 1;
    summary.addRow([
      rank,
      troop.name,
      troop.performance,
      job.settings.coefficient,
      job.settings.participation,
      troop.total,
      troop.counted.join(', '),
    ]);
    troop.contributions.forEach((entry) =>
      audit.addRow([
        troop.name,
        entry.participant.name,
        entry.participant.sheet,
        entry.participant.row,
        selections.get(entry.participant.id)!.points,
        entry.points,
        entry.counted ? 'Ano' : 'Ne',
      ]),
    );
  });
  styleSheet(summary);
  styleSheet(audit);
  summary.getColumn(7).width = 65;
  [3, 4, 5, 6].forEach((column) => {
    summary.getColumn(column).numFmt = '0.00';
  });
  audit.getColumn(6).numFmt = '0.00';
  return workbook;
}
export async function downloadWorkbook(workbook: ExcelJS.Workbook, name: string) {
  const data = await workbook.xlsx.writeBuffer();
  const url = URL.createObjectURL(
    new Blob([data], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
  );
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
