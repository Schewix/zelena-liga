import { useState } from 'react';
import { downloadWorkbook } from '../exports/patrolWorkbook';
import {
  PATROL_IMPORT_CATEGORIES,
  buildPatrolImportTemplate,
  parsePatrolImportWorkbook,
  type PatrolImportIssue,
  type PatrolImportRow,
} from './workbook';

type Props = {
  eventId: string;
  eventName: string;
  troopOptions: readonly string[];
  disabled?: boolean;
  postSetupAction: (action: string, payload: Record<string, unknown>) => Promise<{ created?: number; updated?: number }>;
  onImported: () => void | Promise<void>;
};

const MAX_ISSUES_SHOWN = 20;

export function PatrolImportSection({ eventId, eventName, troopOptions, disabled, postSetupAction, onImported }: Props) {
  const [rows, setRows] = useState<PatrolImportRow[]>([]);
  const [issues, setIssues] = useState<PatrolImportIssue[]>([]);
  const [fileName, setFileName] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const downloadTemplate = async () => {
    setError(null);
    const workbook = await buildPatrolImportTemplate(troopOptions);
    await downloadWorkbook(workbook, 'sablona-hlidky.xlsx');
  };

  const handleFile = async (file: File | null) => {
    setMessage(null);
    setError(null);
    setRows([]);
    setIssues([]);
    setFileName(file?.name ?? '');
    if (!file) {
      return;
    }
    setBusy(true);
    try {
      const result = await parsePatrolImportWorkbook(await file.arrayBuffer(), troopOptions);
      setRows(result.rows);
      setIssues(result.issues);
    } finally {
      setBusy(false);
    }
  };

  const upload = async () => {
    setBusy(true);
    setMessage(null);
    setError(null);
    try {
      const result = await postSetupAction('import_patrols', { event_id: eventId, patrols: rows });
      setMessage(`Nahráno: ${result.created ?? 0} nových, ${result.updated ?? 0} aktualizovaných hlídek.`);
      setRows([]);
      setFileName('');
      await onImported();
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : 'Nahrání hlídek selhalo.');
    } finally {
      setBusy(false);
    }
  };

  const countByCategory = PATROL_IMPORT_CATEGORIES.map((category) => ({
    category,
    count: rows.filter((row) => row.category === category).length,
  }));

  return (
    <div className="admin-patrol-import">
      <p className="admin-card-subtitle">
        Nahraj Excel s údaji o hlídkách (listy N, M, S, R). Údaje se vyplní do ročníku <strong>{eventName || '—'}</strong>:
        hlídka se stejnou kategorií a číslem se doplní, chybějící se vytvoří.
      </p>
      <div className="admin-card-actions">
        <button type="button" className="admin-button admin-button--secondary" onClick={() => void downloadTemplate()}>
          Stáhnout šablonu
        </button>
        <label className="admin-button admin-button--secondary" htmlFor="admin-patrol-import-file">
          {fileName ? `Soubor: ${fileName}` : 'Vybrat Excel soubor'}
        </label>
        <input
          id="admin-patrol-import-file"
          type="file"
          accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          hidden
          disabled={busy || disabled}
          onChange={(event) => {
            void handleFile(event.target.files?.[0] ?? null);
            event.target.value = '';
          }}
        />
      </div>

      {issues.length > 0 ? (
        <div className="admin-error" role="alert">
          <strong>V souboru jsou chyby ({issues.length}), oprav je a nahraj znovu:</strong>
          <ul>
            {issues.slice(0, MAX_ISSUES_SHOWN).map((issue, index) => (
              <li key={`${issue.sheet}-${issue.row}-${index}`}>
                {issue.sheet ? `List ${issue.sheet}` : 'Soubor'}
                {issue.row ? `, řádek ${issue.row}` : ''}: {issue.message}
              </li>
            ))}
            {issues.length > MAX_ISSUES_SHOWN ? <li>…a další ({issues.length - MAX_ISSUES_SHOWN})</li> : null}
          </ul>
        </div>
      ) : null}

      {rows.length > 0 && issues.length === 0 ? (
        <div className="admin-notice">
          Připraveno k nahrání: {rows.length} hlídek (
          {countByCategory.map((item) => `${item.category}: ${item.count}`).join(', ')}).
        </div>
      ) : null}
      {message ? <p className="admin-success">{message}</p> : null}
      {error ? <p className="admin-error">{error}</p> : null}

      <div className="admin-card-actions admin-card-actions--end">
        <button
          type="button"
          className="admin-button admin-button--secondary"
          disabled={busy || disabled || rows.length === 0 || issues.length > 0}
          onClick={() => void upload()}
        >
          {busy ? 'Pracuji…' : 'Nahrát hlídky do ročníku'}
        </button>
      </div>
    </div>
  );
}
