import { useState } from 'react';
import type { EditorSection } from '../model';
import { convertPatrolTableToNameCheck, type NameCheckResult } from '../nameCheck';

type Props = { activeSection: EditorSection };

const MAX_ISSUES_SHOWN = 15;

export function NameCheckSection({ activeSection }: Props) {
  const [result, setResult] = useState<NameCheckResult | null>(null);
  const [fileName, setFileName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFile = async (file: File | null) => {
    setResult(null);
    setError(null);
    setFileName(file?.name ?? '');
    if (!file) {
      return;
    }
    setBusy(true);
    try {
      setResult(await convertPatrolTableToNameCheck(await file.arrayBuffer()));
    } catch (conversionError) {
      console.error('Name check conversion failed', conversionError);
      setError('Tabulku se nepodařilo převést.');
    } finally {
      setBusy(false);
    }
  };

  const download = async () => {
    if (!result?.workbook) {
      return;
    }
    const buffer = await result.workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'kontrola-jmen-podle-oddilu.xlsx';
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <section
      className="editor-section homepage-card editor-documents"
      aria-label="Kontrola jmen"
      hidden={activeSection !== 'kontrola-jmen'}
    >
      <div className="editor-documents-header">
        <div>
          <h2>Kontrola jmen</h2>
          <p>
            Nahraj tabulku hlídek (listy N, M, S, R, stejný formát jako šablona v adminu). Vznikne Excel s listem pro každý
            oddíl: najdeš v něm všechny hlídky oddílu včetně smíšených. U smíšených hlídek jsou členové oddílu označení
            žlutě, aby vedoucí věděl, koho má zkontrolovat.
          </p>
        </div>
      </div>

      <div className="editor-documents-actions">
        <label className="homepage-button homepage-button--ghost" htmlFor="name-check-file">
          {fileName ? `Soubor: ${fileName}` : 'Vybrat tabulku (.xlsx)'}
        </label>
        <input
          id="name-check-file"
          type="file"
          accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          hidden
          disabled={busy}
          onChange={(event) => {
            void handleFile(event.target.files?.[0] ?? null);
            event.target.value = '';
          }}
        />
        <button
          type="button"
          className="homepage-button"
          disabled={busy || !result?.workbook}
          onClick={() => void download()}
        >
          {busy ? 'Převádím…' : 'Stáhnout kontrolu jmen'}
        </button>
      </div>

      {error ? <p role="alert">{error}</p> : null}

      {result?.issues.length ? (
        <div role="alert">
          <p>
            <strong>Některé řádky se přeskočily ({result.issues.length}):</strong>
          </p>
          <ul>
            {result.issues.slice(0, MAX_ISSUES_SHOWN).map((issue, index) => (
              <li key={`${issue.sheet}-${issue.row}-${index}`}>
                {issue.sheet ? `List ${issue.sheet}` : 'Soubor'}
                {issue.row ? `, řádek ${issue.row}` : ''}: {issue.message}
              </li>
            ))}
            {result.issues.length > MAX_ISSUES_SHOWN ? <li>…a další ({result.issues.length - MAX_ISSUES_SHOWN})</li> : null}
          </ul>
        </div>
      ) : null}

      {result?.workbook ? (
        <div role="status">
          <p>
            Načteno {result.patrolCount} hlídek, vytvořeno {result.troops.length} listů:
          </p>
          <ul>
            {result.troops.map((troop) => (
              <li key={troop.troop}>
                {troop.troop}: {troop.patrols} hlídek ({troop.members} členů ke kontrole
                {troop.mixedPatrols > 0 ? `, ${troop.mixedPatrols} smíšených` : ''})
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
