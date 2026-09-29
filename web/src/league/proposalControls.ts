import ExcelJS from 'exceljs';
import { ZL_BAND_POINTS } from './bands';
import type { Participant } from './workbooks';

export const CUSTOM_VARIANT = 'Vlastní oříznutí';
export const LEGACY_VARIANT_FORMULA = 'INDEX($E:$H,ROW(),MATCH($K$2,$E$1:$H$1,0))';
export const VARIANT_FORMULA = `IF($K$2="${CUSTOM_VARIANT}",INDEX($J:$J,ROW()),${LEGACY_VARIANT_FORMULA})`;
const variantNames = ['Bez cut-off', 'S cut-off', 'Gauss s cut-off', 'Gauss otevřený cut-off'];
const droppedKeys = [null, 'cutoffDropped', 'gaussCutoffDropped', 'gaussOpenCutoffDropped'] as const;

export function sortedResults(participants: Participant[]): Participant[] {
  return [...participants].sort(
    (a, b) =>
      (a.status === 'finished' ? 0 : 1) - (b.status === 'finished' ? 0 : 1) ||
      (a.lowerIsBetter ? 1 : -1) * ((a.score ?? 0) - (b.score ?? 0)) ||
      a.row - b.row,
  );
}

function displayResult(value: number, time: boolean): string {
  if (!time) return String(value);
  const millis = Math.round(value * 1000);
  const hours = Math.floor(millis / 3600000);
  const minutes = Math.floor(millis / 60000) % 60;
  const seconds = ((millis % 60000) / 1000)
    .toFixed(3)
    .padStart(6, '0')
    .replace(/\.?0+$/, '');
  return `${hours}:${String(minutes).padStart(2, '0')}:${seconds.padStart(2, '0')}`;
}

export function cutoffOptions(participants: Participant[], time: boolean) {
  return sortedResults(participants)
    .filter((p) => p.status === 'finished')
    .map((p, i) => ({
      label: `${i + 1}. · ${displayResult(p.score!, time)}`,
      score: p.score!,
    }));
}

export function customPoints(participant: Participant, best: number, cutoff: number): number {
  if (participant.status !== 'finished') return participant.status === 'DNF' ? 1 : 0;
  const direction = participant.lowerIsBetter ? 1 : -1;
  const distance = direction * (participant.score! - best);
  const span = direction * (cutoff - best);
  if (direction * (participant.score! - cutoff) > 0) return 1;
  if (span / 7 <= 1e-9) return 16;
  for (let band = 1; band <= 6; band++) {
    if (distance <= (span * band) / 7 + 1e-9) return ZL_BAND_POINTS[band - 1];
  }
  return 1;
}

// Only formula-driven selections use this. Manual numeric overrides remain untouched.
export function readCustomPoints(
  participants: Participant[],
  label: string,
  time: boolean,
): Map<string, number> {
  const options = cutoffOptions(participants, time);
  if (!options.length) return new Map(participants.map((p) => [p.id, p.status === 'DNF' ? 1 : 0]));
  const selected = options.find((option) => option.label === label);
  if (!selected) throw new Error('V buňce K5 vyber posledního ponechaného soutěžícího.');
  return new Map(participants.map((p) => [p.id, customPoints(p, options[0].score, selected.score)]));
}

export function addProposalControls(
  sheet: ExcelJS.Worksheet,
  participants: Participant[],
  time: boolean,
  rowIsTime: (p: Participant) => boolean,
) {
  const sorted = sortedResults(participants);
  const finished = sorted.filter((p) => p.status === 'finished');
  const options = cutoffOptions(participants, time);
  const scale = time ? 86400 : 1;
  const format = time ? '[h]:mm:ss.000' : '0.#########';
  const lower = finished[0]?.lowerIsBetter ?? false;
  const direction = lower ? 1 : -1;
  const yellow = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF2CC' } } as const;
  const heading = (address: string, text: string) => {
    const cell = sheet.getCell(address);
    cell.value = text;
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF04372C' } };
    cell.alignment = { wrapText: true, vertical: 'middle' };
  };
  const note = (address: string, text: string) => {
    const cell = sheet.getCell(address);
    cell.value = text;
    cell.alignment = { wrapText: true, vertical: 'top' };
  };
  heading('J1', CUSTOM_VARIANT);
  heading('K1', 'Varianta pro celou kategorii');
  sheet.getColumn('J').width = 23;
  sheet.getColumn('K').width = 42;
  sheet.getColumn('L').width = 3;
  sheet.getColumn('M').width = 22;
  for (const col of ['N', 'O', 'P', 'Q', 'R']) sheet.getColumn(col).width = 25;
  const variant = sheet.getCell('K2');
  variant.value = variantNames[0];
  variant.fill = yellow;
  variant.dataValidation = {
    type: 'list',
    allowBlank: false,
    formulae: [`"${[...variantNames, CUSTOM_VARIANT].join(',')}"`],
    showErrorMessage: true,
    errorStyle: 'stop',
    error: 'Vyber platnou variantu bodů.',
  };
  heading('K4', 'Poslední ponechaný: pořadí · výsledek');
  const last = sheet.getCell('K5');
  last.value = options.at(-1)?.label ?? 'Žádný dokončivší';
  last.fill = yellow;
  if (options.length) {
    last.dataValidation = {
      type: 'list',
      allowBlank: false,
      formulae: [`$S$2:$S$${options.length + 1}`],
      showErrorMessage: true,
      errorStyle: 'stop',
      error: 'Vyber posledního ponechaného soutěžícího.',
    };
    options.forEach((option, i) => {
      sheet.getCell(i + 2, 19).value = option.label;
      sheet.getCell(i + 2, 20).value = option.score / scale;
    });
  }
  sheet.getColumn('S').hidden = true;
  sheet.getColumn('T').hidden = true;
  heading('K6', 'Hranice vlastního oříznutí');
  sheet.getCell('K7').value = options.length
    ? {
        formula: `INDEX($T$2:$T$${options.length + 1},MATCH($K$5,$S$2:$S$${options.length + 1},0))`,
        result: options.at(-1)!.score / scale,
      }
    : '—';
  sheet.getCell('K7').numFmt = format;
  heading('K8', 'Nejlepší výsledek');
  sheet.getCell('K9').value = options.length ? options[0].score / scale : '—';
  sheet.getCell('K9').numFmt = format;
  note(
    'K11',
    'Pro použití vlastního oříznutí vyber v K2 „Vlastní oříznutí“. Shodné výsledky zůstávají spolu.',
  );
  note(
    'K12',
    'Ručně přepsané Vybrané body ZL se při změně varianty nemění. Obnovíš je zkopírováním vzorce z jiného řádku.',
  );
  sheet.getRow(11).height = 60;
  sheet.getRow(12).height = 75;

  heading('M1', 'Hranice pro body ZL');
  [...variantNames, CUSTOM_VARIANT].forEach((name, i) => heading(`${String.fromCharCode(78 + i)}1`, name));
  ZL_BAND_POINTS.slice(0, 6).forEach((points, i) => {
    sheet.getCell(i + 2, 13).value = points;
  });
  sheet.getCell('M8').value = 1;
  sheet.getCell('M10').value = 'Poslední ponechaný';
  sheet.getCell('M11').value = lower ? 'Čas/výsledek ≤ hranice' : 'Výsledek ≥ hranice';
  sheet.getCell('M11').alignment = { wrapText: true };
  sheet.mergeCells('N12:R12');
  note(
    'N12',
    'Hranice jsou včetně rovnosti. Platí první splněné pásmo od 16 bodů. Výsledky za oříznutím mají 1 bod. DSQ/DNS = 0, DNF = 1. Hranice jsou zobrazené zaokrouhleně; výpočet používá plnou přesnost.',
  );
  for (let variantIndex = 0; variantIndex < 5; variantIndex++) {
    const droppedKey = droppedKeys[variantIndex];
    const pool = finished.filter((p) => !droppedKey || !p.proposal[droppedKey]);
    const best = pool[0]?.score;
    const worst = pool.at(-1)?.score;
    for (let band = 1; band <= 6; band++) {
      const cell = sheet.getCell(band + 1, variantIndex + 14);
      const boundary = best == null || worst == null ? null : (best + ((worst - best) * band) / 7) / scale;
      cell.value =
        boundary === null
          ? '—'
          : variantIndex === 4
            ? {
                formula: `$K$9+($K$7-$K$9)*${band}/7`,
                result: boundary,
              }
            : boundary;
      cell.numFmt = format;
    }
    sheet.getCell(8, variantIndex + 14).value = 'Ostatní dokončivší';
    sheet.getCell(10, variantIndex + 14).value =
      worst == null ? '—' : variantIndex === 4 ? { formula: '$K$7', result: worst / scale } : worst / scale;
    sheet.getCell(10, variantIndex + 14).numFmt = format;
  }
  sorted.forEach((p, index) => {
    const row = index + 2;
    const c = `(INDEX($C:$C,ROW())*${(rowIsTime(p) ? 86400 : 1) / scale})`;
    const epsilon = 1e-9 / scale;
    let formula = '1';
    for (let band = 6; band >= 1; band--)
      formula = `IF(${direction}*(${c}-$K$9)<=${direction}*($R$${band + 1}-$K$9)+${epsilon},${ZL_BAND_POINTS[band - 1]},${formula})`;
    formula = `IF(${direction}*(${c}-$K$7)>0,1,IF(${direction}*($K$7-$K$9)/7<=${epsilon},16,${formula}))`;
    formula = `IF(INDEX($D:$D,ROW())="DNF",1,IF(INDEX($D:$D,ROW())<>"finished",0,${formula}))`;
    sheet.getCell(row, 10).value = { formula, result: p.proposal.zlPointsNoCutoff };
  });
  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: sorted.length + 1, column: 10 } };
}
