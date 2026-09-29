import { useState, type ChangeEvent } from 'react';
import {
  cellText,
  describeLeagueGroup,
  downloadWorkbook,
  finalWorkbook,
  guessMapping,
  prepareJob,
  proposalWorkbook,
  readSelections,
  readSource,
  troopTotals,
  type LeagueJob,
  type LeagueSettings,
  type Selection,
  type SheetMapping,
  type SourceFile,
} from './workbooks';
import './LeaguePointsEditor.css';

const ERROR = (error: unknown) =>
  error instanceof Error ? error.message : 'Soubor se nepodařilo zpracovat.';
const columnFields = [
  ['nameColumn', 'Soutěžící / hlídka', true],
  ['troopColumn', 'Oddíl', true],
  ['scoreColumn', 'Výsledek', true],
  ['categoryColumn', 'Kategorie', false],
  ['sexColumn', 'Pohlaví', false],
  ['statusColumn', 'Stav / pořadí', false],
] as const;

export default function LeaguePointsEditor() {
  const [source, setSource] = useState<SourceFile | null>(null);
  const [mappings, setMappings] = useState<SheetMapping[]>([]);
  const [settings, setSettings] = useState<LeagueSettings>({
    coefficient: 1,
    maxResults: 4,
    participation: 10,
  });
  const [job, setJob] = useState<LeagueJob | null>(null);
  const [selections, setSelections] = useState<Map<string, Selection> | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [sourceVersion, setSourceVersion] = useState(0);
  const resetJob = () => {
    setJob(null);
    setSelections(null);
    setMessage(null);
    setError(null);
  };
  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await action();
    } catch (failure) {
      setError(ERROR(failure));
    } finally {
      setBusy(false);
    }
  };
  const loadSource = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    void run(async () => {
      const loaded = await readSource(file.name, await file.arrayBuffer());
      setSource(loaded);
      setMappings(loaded.workbook.worksheets.map((sheet) => guessMapping(sheet)));
      setJob(null);
      setSelections(null);
      setSourceVersion((version) => version + 1);
    });
  };
  const updateMapping = (index: number, patch: Partial<SheetMapping>) => {
    setMappings((current) => current.map((mapping, i) => (i === index ? { ...mapping, ...patch } : mapping)));
    resetJob();
  };
  const updateSettings = (patch: Partial<LeagueSettings>) => {
    setSettings((current) => ({ ...current, ...patch }));
    resetJob();
  };
  const baseName = (source?.name ?? 'vysledky').replace(/\.(xlsx|csv)$/i, '');
  const totals = job && selections ? troopTotals(job, selections) : [];
  const groups = job ? [...new Set(job.participants.map((row) => row.group))] : [];

  return (
    <div className="league-editor">
      <header>
        <h2>Body Zelené ligy</h2>
        <p>
          Nahraj výsledky libovolného závodu, vyber pásma a stáhni původní výsledky doplněné o body ZL a
          součet za oddíly.
        </p>
      </header>
      <p className="league-note">
        Soubory se zpracovávají v tomto prohlížeči. Rozepsaná úloha zůstává při přepnutí sekce; po obnovení
        stránky nahraj původní soubor a nastav stejné parametry.
      </p>
      <fieldset disabled={busy} className="league-step">
        <legend>1. Původní výsledky a pravidla</legend>
        <label>
          Tabulka výsledků (XLSX nebo CSV)
          <input type="file" accept=".xlsx,.csv" onChange={loadSource} />
        </label>
        {source && (
          <p>
            Načteno: <strong>{source.name}</strong> · {source.workbook.worksheets.length} listů
          </p>
        )}
        <div className="league-fields">
          <label>
            Koeficient závodu
            <input
              type="number"
              step="any"
              min="0.01"
              value={Number.isNaN(settings.coefficient) ? '' : settings.coefficient}
              onChange={(event) => updateSettings({ coefficient: event.target.valueAsNumber })}
            />
          </label>
          <label>
            Nejlepší výsledky za oddíl (0 = všechny)
            <input
              type="number"
              step="1"
              min="0"
              value={Number.isNaN(settings.maxResults) ? '' : settings.maxResults}
              onChange={(event) => updateSettings({ maxResults: event.target.valueAsNumber })}
            />
          </label>
          <label>
            Body za účast
            <input
              type="number"
              step="any"
              min="0"
              value={Number.isNaN(settings.participation) ? '' : settings.participation}
              onChange={(event) => updateSettings({ participation: event.target.valueAsNumber })}
            />
          </label>
        </div>
        <p>
          Součet oddílu = součet nejlepších výsledků × koeficient + body za účast. Koeficient se nevztahuje na
          body za účast.
        </p>
        {source && (
          <>
            <p>
              Každý řádek představuje jednoho soutěžícího nebo jednu hlídku. Vyber listy s výsledky a
              zkontroluj rozpoznané sloupce. Záhlaví a souhrnné řádky mimo vybraný rozsah se nezapočítají.
            </p>
            {mappings.map((mapping, index) => {
              const sheet = source.workbook.getWorksheet(mapping.sheet)!;
              const columns = Array.from({ length: sheet.columnCount }, (_, i) => i + 1);
              const previewRows = Array.from(
                { length: Math.max(0, Math.min(5, mapping.endRow - mapping.headerRow)) },
                (_, i) => mapping.headerRow + i + 1,
              );
              return (
                <details
                  key={`${sourceVersion}:${mapping.sheet}`}
                  className="league-mapping"
                  open={mapping.enabled || undefined}
                >
                  <summary>
                    {mapping.sheet} · {sheet.rowCount} řádků{!mapping.enabled ? ' · nezapočítává se' : ''}
                  </summary>
                  <label className="league-check">
                    <input
                      type="checkbox"
                      checked={mapping.enabled}
                      onChange={(event) => updateMapping(index, { enabled: event.target.checked })}
                    />
                    Započítat tento list
                  </label>
                  <fieldset disabled={!mapping.enabled}>
                    <div className="league-fields">
                      <label>
                        Řádek záhlaví
                        <input
                          type="number"
                          min="1"
                          max={sheet.rowCount}
                          value={Number.isNaN(mapping.headerRow) ? '' : mapping.headerRow}
                          onChange={(event) => {
                            const row = event.target.valueAsNumber;
                            if (Number.isInteger(row) && row >= 1 && row <= sheet.rowCount)
                              updateMapping(index, {
                                ...guessMapping(sheet, row),
                                enabled: mapping.enabled,
                                endRow: mapping.endRow,
                              });
                            else updateMapping(index, { headerRow: row });
                          }}
                        />
                      </label>
                      <label>
                        Poslední řádek výsledků
                        <input
                          type="number"
                          min={mapping.headerRow + 1}
                          max={sheet.rowCount}
                          value={Number.isNaN(mapping.endRow) ? '' : mapping.endRow}
                          onChange={(event) => updateMapping(index, { endRow: event.target.valueAsNumber })}
                        />
                      </label>
                    </div>
                    <div className="league-fields">
                      {columnFields.map(([field, label, required]) => (
                        <label key={field}>
                          {label}
                          {required ? ' *' : ''}
                          <select
                            value={mapping[field]}
                            onChange={(event) =>
                              updateMapping(index, { [field]: Number(event.target.value) })
                            }
                          >
                            <option value={0}>{required ? 'Vyber sloupec' : 'Nepoužít'}</option>
                            {columns.map((column) => (
                              <option key={column} value={column}>
                                {sheet.getColumn(column).letter}:{' '}
                                {Number.isInteger(mapping.headerRow) && mapping.headerRow > 0
                                  ? cellText(sheet.getCell(mapping.headerRow, column)) || '(bez názvu)'
                                  : '(bez názvu)'}
                              </option>
                            ))}
                          </select>
                        </label>
                      ))}
                      <label>
                        Kategorie z názvu listu / vlastní skupina
                        <input
                          value={mapping.group}
                          disabled={mapping.categoryColumn > 0}
                          onChange={(event) => updateMapping(index, { group: event.target.value })}
                        />
                      </label>
                      <label>
                        Hodnocení
                        <select
                          value={mapping.lowerIsBetter ? 'lower' : 'higher'}
                          onChange={(event) =>
                            updateMapping(index, { lowerIsBetter: event.target.value === 'lower' })
                          }
                        >
                          <option value="higher">Vyšší výsledek je lepší</option>
                          <option value="lower">Nižší výsledek je lepší</option>
                        </select>
                      </label>
                      <label>
                        Formát výsledku
                        <select
                          value={mapping.scoreFormat}
                          onChange={(event) =>
                            updateMapping(index, {
                              scoreFormat: event.target.value as SheetMapping['scoreFormat'],
                            })
                          }
                        >
                          <option value="number">Číslo (body, sekundy nebo pořadí)</option>
                          <option value="time">Čas (m:ss / h:mm:ss / čas Excelu)</option>
                        </select>
                      </label>
                    </div>
                    {!mapping.categoryColumn && !mapping.sexColumn && (
                      <p>
                        Samostatná skupina pro výpočet:{' '}
                        <strong>{describeLeagueGroup(mapping.group.trim() || mapping.sheet)}</strong>.
                      </p>
                    )}
                    <p>
                      Stejná kategorie a pohlaví tvoří jednu skupinu i napříč listy. Bez kategorie rozhoduje
                      název původního listu nebo vlastní skupiny. H8 a D8 tak zůstávají oddělené i bez sloupců
                      Kategorie a Pohlaví. Pro úmyslné sloučení nastav stejnou skupinu.
                    </p>
                    {previewRows.length > 0 &&
                      Number.isInteger(mapping.headerRow) &&
                      mapping.headerRow >= 1 && (
                        <div className="league-table-scroll">
                          <table>
                            <caption>Ukázka vybraných sloupců – {mapping.sheet}</caption>
                            <thead>
                              <tr>
                                <th>Řádek</th>
                                {columnFields.map(([field, label]) => (
                                  <th key={field}>{label}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {previewRows.map((row) => (
                                <tr key={row}>
                                  <th>{row}</th>
                                  {columnFields.map(([field]) => (
                                    <td key={field}>
                                      {mapping[field] ? cellText(sheet.getCell(row, mapping[field])) : '—'}
                                    </td>
                                  ))}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                  </fieldset>
                </details>
              );
            })}
            <p className="league-note">
              DSQ/DNS = 0 bodů bez účasti, DNF = 1 bod. Nedokončené označ ve sloupci Stav nebo Výsledek.
              Smíšené hlídky zapiš v oddílu jako „Oddíl A=2; Oddíl B=1“; body se rozdělí v poměru 2:1. Názvy
              oddílů sjednoť v původním souboru před nahráním.
            </p>
            <button
              type="button"
              className="league-button"
              onClick={() =>
                void run(async () => {
                  const prepared = await prepareJob(source, mappings, settings);
                  setJob(prepared);
                  setSelections(null);
                  setMessage(`Návrhy připraveny pro ${prepared.participants.length} výsledků.`);
                })
              }
            >
              Připravit návrhy pásem
            </button>
          </>
        )}
      </fieldset>
      {job && (
        <fieldset disabled={busy} className="league-step">
          <legend>2. Návrhy pásem</legend>
          <p>
            Návrhy neobsahují jména soutěžících, názvy hlídek ani oddíly. Zůstanou jen kategorie, výsledky,
            stav, návrhy bodů a anonymní ID pro zpětné přiřazení.
          </p>
          <p>
            Export bude mít {groups.length} samostatných listů s návrhy, jeden pro každou skupinu. Pásma se
            počítají uvnitř jednotlivých skupin.
          </p>
          <p>
            Pásma mají 16, 12, 9, 6, 4, 2 a 1 bod. Export obsahuje čtyři varianty: bez cut-off, s cut-off a
            dvě gaussovské varianty. Cut-off omezuje vliv výrazně slabších výsledků; závodníci pod ním
            dostávají 1 bod.
          </p>
          <p>
            V Excelu na každém listu vyber variantu v rozbalovací nabídce v buňce <strong>K2</strong>. Sloupec{' '}
            <strong>Vybrané body ZL</strong> se vyplní automaticky. Jednotlivé body můžeš přepsat ručně;
            přepsané buňky se při další změně varianty už nemění. Výchozí je varianta bez cut-off. ID výsledku
            a záhlaví ponech beze změny.
          </p>
          <p>
            Vpravo na každém listu najdeš hranice bodů nebo časů pro jednotlivá pásma všech variant. Pro
            vlastní oříznutí vyber v <strong>K5</strong> posledního ponechaného soutěžícího podle anonymního
            pořadí a výsledku a v <strong>K2</strong> zvol <strong>Vlastní oříznutí</strong>. Pásma se
            přepočítají mezi nejlepším a zvoleným výsledkem, horší výsledky dostanou 1 bod. Shodné výsledky
            zůstávají spolu.
          </p>
          <div className="league-table-scroll">
            <table>
              <caption>Přehled skupin</caption>
              <thead>
                <tr>
                  <th>Skupina</th>
                  <th>Výsledků</th>
                  <th>Dokončeno</th>
                  <th>DSQ/DNS</th>
                  <th>DNF</th>
                </tr>
              </thead>
              <tbody>
                {groups.map((group) => {
                  const rows = job.participants.filter((row) => row.group === group);
                  return (
                    <tr key={group}>
                      <th scope="row" title={describeLeagueGroup(group)}>
                        {group}
                      </th>
                      <td>{rows.length}</td>
                      <td>{rows.filter((row) => row.status === 'finished').length}</td>
                      <td>{rows.filter((row) => row.status === 'DSQ' || row.status === 'DNS').length}</td>
                      <td>{rows.filter((row) => row.status === 'DNF').length}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <button
            type="button"
            className="league-button"
            onClick={() =>
              void run(async () => {
                await downloadWorkbook(proposalWorkbook(job), 'navrhy-pasem-zl.xlsx');
                setMessage(
                  'Návrhy staženy. Na každém listu vyber variantu v buňce K2 a nahraj soubor v kroku 3.',
                );
              })
            }
          >
            Stáhnout návrhy pásem
          </button>
        </fieldset>
      )}
      {job && (
        <fieldset disabled={busy} className="league-step">
          <legend>3. Upravené body a výsledky</legend>
          <label>
            Upravený soubor návrhů (XLSX)
            <input
              type="file"
              accept=".xlsx"
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = '';
                if (!file) return;
                setSelections(null);
                void run(async () => {
                  const chosen = await readSelections(job, await file.arrayBuffer());
                  troopTotals(job, chosen);
                  setSelections(chosen);
                  setMessage(`Ověřeno ${chosen.size} výsledků. Součet oddílů je připraven ke stažení.`);
                });
              }}
            />
          </label>
          {selections && (
            <>
              <div className="league-table-scroll">
                <table>
                  <caption>Součet za oddíly</caption>
                  <thead>
                    <tr>
                      <th>Oddíl</th>
                      <th>Započtené body</th>
                      <th>Koeficient</th>
                      <th>Účast</th>
                      <th>Celkem</th>
                    </tr>
                  </thead>
                  <tbody>
                    {totals.map((troop) => (
                      <tr key={troop.name}>
                        <th>{troop.name}</th>
                        <td>{troop.performance.toLocaleString('cs', { maximumFractionDigits: 2 })}</td>
                        <td>{job.settings.coefficient}</td>
                        <td>{job.settings.participation}</td>
                        <td>{troop.total.toLocaleString('cs', { maximumFractionDigits: 2 })}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {!totals.length && (
                <p>Žádný oddíl nemá započitatelnou účast (všechny výsledky jsou DSQ/DNS).</p>
              )}
              <p>
                Výstup zachová původní listy a doplní sloupce bodů ZL, koeficientu a oddílu pro ZL. Přibudou
                listy se součtem oddílů a jednotlivými příspěvky. CSV se převede na XLSX.
              </p>
              <button
                type="button"
                className="league-button"
                onClick={() =>
                  void run(async () => {
                    await downloadWorkbook(
                      await finalWorkbook(job, selections),
                      `${baseName}-s-body-zl.xlsx`,
                    );
                    setMessage('Výsledky s body ZL a součtem oddílů staženy.');
                  })
                }
              >
                Stáhnout původní výsledky + ZL
              </button>
            </>
          )}
        </fieldset>
      )}
      {busy && <p role="status">Zpracovávám soubor…</p>}
      {error && (
        <p role="alert" className="league-error">
          {error}
        </p>
      )}
      {message && (
        <p role="status" className="homepage-alert">
          {message}
        </p>
      )}
    </div>
  );
}
