import type { StationManifest } from '../../auth/types';
import { Fragment,ClipboardEvent as ReactClipboardEvent,FormEvent as ReactFormEvent,useCallback,useEffect,useMemo,useRef,useState } from 'react';
import {
OutboxEntry,
StationScorePayload,
deleteOutboxEntries,
enqueueStationScore as enqueueStationScoreHelper,
flushOutboxBatch,
readOutbox,
releaseNetworkBackoff,
writeOutboxEntry
} from '../../outbox';
import {
CategoryKey,
formatAnswersForInput,
isCategoryKey,
normalizeAnswersInput,
packAnswersForStorage,
parseAnswerLetters,
type TargetAnswerOptionCount,
} from '../../utils/targetAnswers';
import { WAIT_MINUTES_MAX,WAIT_TIME_MAX,WAIT_TIME_ZERO,combineDateWithTime,formatDateTimeLabel,formatDurationMs,formatTime,formatWaitDraft,formatWaitDuration,formatWaitMinutes,normalizeWaitInput,parseWaitDraft,toLocalTimeInput,waitSecondsToMinutes } from '../time';

export type PendingSyncPanelProps = {
pendingCount: number;
syncing: boolean;
otherSessionItems: OutboxEntry[];
setShowPendingDetails: React.Dispatch<React.SetStateAction<boolean>>;
showPendingDetails: boolean;
flushOutbox: (options?: { force?: boolean; }) => Promise<void>;
outboxItems: OutboxEntry[];
currentSessionItems: OutboxEntry[];
stationCode: string;
stationId: string;
targetAnswerOptionCount: TargetAnswerOptionCount;
editingOutboxEntryId: string | null;
savingOutboxEntryId: string | null;
manifest: StationManifest;
beginOutboxEdit: (entry: OutboxEntry) => void;
editingOutboxWait: string;
setEditingOutboxWait: React.Dispatch<React.SetStateAction<string>>;
editingOutboxPoints: string;
setEditingOutboxPoints: React.Dispatch<React.SetStateAction<string>>;
targetAnswerInputHint: "A-C + X" | "A-D + X";
editingOutboxAnswers: string;
setEditingOutboxAnswers: React.Dispatch<React.SetStateAction<string>>;
handleTargetAnswersBeforeInput: (event: ReactFormEvent<HTMLInputElement>) => void;
targetAnswerInputExample: "např. ABCX" | "např. ABCDX";
targetAnswerInputPattern: "[A-CXa-cx]*" | "[A-DXa-dx]*";
handleSaveOutboxEntry: (entry: OutboxEntry) => Promise<void>;
cancelOutboxEdit: () => void;
editingOutboxError: string | null;
handleClearOtherSessions: () => Promise<void>;
};

export function PendingSyncPanel({ pendingCount, syncing, otherSessionItems, setShowPendingDetails, showPendingDetails, flushOutbox, outboxItems, currentSessionItems, stationCode, stationId, targetAnswerOptionCount, editingOutboxEntryId, savingOutboxEntryId, manifest, beginOutboxEdit, editingOutboxWait, setEditingOutboxWait, editingOutboxPoints, setEditingOutboxPoints, targetAnswerInputHint, editingOutboxAnswers, setEditingOutboxAnswers, handleTargetAnswersBeforeInput, targetAnswerInputExample, targetAnswerInputPattern, handleSaveOutboxEntry, cancelOutboxEdit, editingOutboxError, handleClearOtherSessions }: PendingSyncPanelProps) {
return (<div className="pending-banner">
                <div className="pending-banner-main">
                  <div>
                    Čeká na odeslání: {pendingCount} {syncing ? '(synchronizuji…)' : ''}
                  </div>
                  {otherSessionItems.length > 0 ? (
                    <div className="pending-banner-note">
                      Jiná relace: {otherSessionItems.length}
                    </div>
                  ) : null}
                  <div className="pending-banner-actions">
                    <button
                      type="button"
                      className="ghost"
                      onClick={() => setShowPendingDetails((prev) => !prev)}
                    >
                      {showPendingDetails ? 'Skrýt frontu' : 'Zobrazit frontu'}
                    </button>
                    <button
                      type="button"
                      onClick={() => void flushOutbox({ force: true })}
                      disabled={syncing || pendingCount === 0}
                    >
                      {syncing ? 'Pracuji…' : 'Odeslat nyní'}
                    </button>
                  </div>
                </div>
                {showPendingDetails ? (
                  <div className="pending-preview">
                    {outboxItems.length === 0 ? (
                      <p>Fronta je prázdná.</p>
                    ) : (
                      <>
                        {currentSessionItems.length > 0 ? (
                          <div className="table-scroll">
                            <table className="pending-table">
                              <thead>
                                <tr>
                                  <th>Hlídka</th>
                                  <th>Body / Terč</th>
                                  <th>Rozhodčí</th>
                                  <th>Stav</th>
                                  <th>Akce</th>
                                </tr>
                              </thead>
                              <tbody>
                                {currentSessionItems.map((item, index) => {
                                  const payload = item.payload;
                                  const allowNegativePoints = stationCode === 'T' && payload.station_id === stationId;
                                  const answers = payload.use_target_scoring
                                    ? formatAnswersForInput(payload.normalized_answers || '', {
                                        maxOptionCount: targetAnswerOptionCount,
                                        allowBlank: true,
                                      })
                                    : '';
                                  const isEditing = editingOutboxEntryId === item.client_event_id;
                                  const isSaving = savingOutboxEntryId === item.client_event_id;
                                  const blockedLabel =
                                    item.state === 'blocked_other_session'
                                      ? 'Záznam patří k jiné relaci.'
                                      : item.state === 'rejected_event_locked'
                                        ? 'Záznam vznikl po ukončení závodu, proto se neodešle.'
                                      : null;
                                  const patrolLabel = payload.team_name || 'Neznámá hlídka';
                                  const codeLabel = payload.patrol_code ? ` (${payload.patrol_code})` : '';
                                  const categoryLabel = payload.sex ? `${payload.category}/${payload.sex}` : payload.category;
                                  const statusLabel = (() => {
                                    switch (item.state) {
                                      case 'sending':
                                        return 'Odesílám…';
                                      case 'needs_auth':
                                        return 'Čeká na přihlášení';
                                      case 'blocked_other_session':
                                        return 'Nelze odeslat';
                                      case 'rejected_event_locked':
                                        return 'Uzamčeno po ukončení závodu';
                                      case 'failed':
                                        return `Další pokus v ${formatTime(new Date(item.next_attempt_at).toISOString())}`;
                                      case 'sent':
                                        return 'Odesláno';
                                      default:
                                        return 'Čeká na odeslání';
                                    }
                                  })();
                                  return (
                                    <Fragment key={`${item.client_event_id}-${index}`}>
                                      <tr>
                                        <td>
                                          <div className="pending-patrol">
                                            <strong>
                                              {patrolLabel}
                                              {codeLabel}
                                            </strong>
                                            <span className="pending-subline">{categoryLabel}</span>
                                            <span className="pending-subline">Čekání: {payload.wait_minutes} min</span>
                                          </div>
                                        </td>
                                        <td>
                                          <div className="pending-score">
                                            <span className="pending-score-points">{payload.points} b</span>
                                            <span className="pending-subline">
                                              {payload.use_target_scoring ? 'Terčový úsek' : 'Manuální body'}
                                            </span>
                                            {payload.use_target_scoring ? (
                                              <span className="pending-answers">{answers || '—'}</span>
                                            ) : null}
                                          </div>
                                        </td>
                                        <td>{manifest.judge.displayName || '—'}</td>
                                        <td>
                                          <div className="pending-status">
                                            <span>{statusLabel}</span>
                                            {blockedLabel ? (
                                              <span className="pending-subline">{blockedLabel}</span>
                                            ) : null}
                                            {item.last_error ? (
                                              <span className="pending-subline">Chyba: {item.last_error}</span>
                                            ) : null}
                                          </div>
                                        </td>
                                        <td>
                                          <button
                                            type="button"
                                            className="ghost pending-remove"
                                            onClick={() => beginOutboxEdit(item)}
                                            disabled={item.state === 'sending' || isSaving}
                                          >
                                            Upravit
                                          </button>
                                        </td>
                                      </tr>
                                      {isEditing ? (
                                        <tr className="pending-edit-row">
                                          <td colSpan={5}>
                                            <div className="pending-edit">
                                              <label>
                                                Čekání (HH:MM)
                                                <input
                                                  type="time"
                                                  step={60}
                                                  min={WAIT_TIME_ZERO}
                                                  max={WAIT_TIME_MAX}
                                                  value={editingOutboxWait}
                                                  onChange={(event) =>
                                                    setEditingOutboxWait((current) =>
                                                      normalizeWaitInput(event.target.value, current),
                                                    )
                                                  }
                                                  disabled={isSaving}
                                                />
                                              </label>
                                              <label>
                                                Body
                                                <input
                                                  type="number"
                                                  min={allowNegativePoints ? -12 : 0}
                                                  max={12}
                                                  inputMode="numeric"
                                                  value={editingOutboxPoints}
                                                  onChange={(event) => setEditingOutboxPoints(event.target.value)}
                                                  disabled={isSaving}
                                                />
                                              </label>
                                              {payload.use_target_scoring ? (
                                                <label>
                                                  Odpovědi ({targetAnswerInputHint})
                                                  <input
                                                    type="text"
                                                    value={editingOutboxAnswers}
                                                    onChange={(event) =>
                                                      setEditingOutboxAnswers(
                                                        normalizeAnswersInput(event.target.value, {
                                                          maxOptionCount: targetAnswerOptionCount,
                                                          allowBlank: true,
                                                        }),
                                                      )
                                                    }
                                                    onBeforeInput={handleTargetAnswersBeforeInput}
                                                    onPaste={(event) => {
                                                      const pasted = event.clipboardData.getData('text');
                                                      if (!pasted) {
                                                        return;
                                                      }
                                                      event.preventDefault();
                                                      setEditingOutboxAnswers((previous) =>
                                                        normalizeAnswersInput(`${previous}${pasted}`, {
                                                          maxOptionCount: targetAnswerOptionCount,
                                                          allowBlank: true,
                                                        }),
                                                      );
                                                    }}
                                                    placeholder={targetAnswerInputExample}
                                                    autoCapitalize="characters"
                                                    pattern={targetAnswerInputPattern}
                                                    disabled={isSaving}
                                                  />
                                                </label>
                                              ) : null}
                                              <div className="pending-edit-actions">
                                                <button
                                                  type="button"
                                                  className="ghost"
                                                  onClick={() => void handleSaveOutboxEntry(item)}
                                                  disabled={isSaving}
                                                >
                                                  {isSaving ? 'Ukládám…' : 'Uložit změny'}
                                                </button>
                                                <button type="button" onClick={cancelOutboxEdit} disabled={isSaving}>
                                                  Zrušit
                                                </button>
                                              </div>
                                              {editingOutboxError ? <p className="error-text">{editingOutboxError}</p> : null}
                                            </div>
                                          </td>
                                        </tr>
                                      ) : null}
                                    </Fragment>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        ) : (
                          <p>Aktuální relace je prázdná.</p>
                        )}
                        {otherSessionItems.length > 0 ? (
                          <div className="pending-section">
                            <div className="pending-section-header">
                              <h4>Jiná relace</h4>
                              <button type="button" className="ghost" onClick={handleClearOtherSessions}>
                                Vyčistit staré záznamy
                              </button>
                            </div>
                            <p className="pending-section-note">
                              Záznamy patří k jiné relaci, proto je teď neodesíláme.
                            </p>
                            <div className="table-scroll">
                              <table className="pending-table">
                                <thead>
                                  <tr>
                                    <th>Hlídka</th>
                                    <th>Body / Terč</th>
                                    <th>Relace</th>
                                    <th>Stav</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {otherSessionItems.map((item, index) => {
                                    const payload = item.payload;
                                    const answers = payload.use_target_scoring
                                      ? formatAnswersForInput(payload.normalized_answers || '', {
                                          maxOptionCount: targetAnswerOptionCount,
                                          allowBlank: true,
                                        })
                                      : '';
                                    const patrolLabel = payload.team_name || 'Neznámá hlídka';
                                    const codeLabel = payload.patrol_code ? ` (${payload.patrol_code})` : '';
                                    const categoryLabel = payload.sex
                                      ? `${payload.category}/${payload.sex}`
                                      : payload.category;
                                    const sessionLabel = `Závod: ${item.event_id ?? '—'}, Stanoviště: ${item.station_id ?? '—'}`;
                                    return (
                                      <tr key={`${item.client_event_id}-other-${index}`}>
                                        <td>
                                          <div className="pending-patrol">
                                            <strong>
                                              {patrolLabel}
                                              {codeLabel}
                                            </strong>
                                            <span className="pending-subline">{categoryLabel}</span>
                                            <span className="pending-subline">Čekání: {payload.wait_minutes} min</span>
                                          </div>
                                        </td>
                                        <td>
                                          <div className="pending-score">
                                            <span className="pending-score-points">{payload.points} b</span>
                                            <span className="pending-subline">
                                              {payload.use_target_scoring ? 'Terčový úsek' : 'Manuální body'}
                                            </span>
                                            {payload.use_target_scoring ? (
                                              <span className="pending-answers">{answers || '—'}</span>
                                            ) : null}
                                          </div>
                                        </td>
                                        <td>{sessionLabel}</td>
                                        <td>
                                          <div className="pending-status">
                                            <span>Neodesíláme</span>
                                            <span className="pending-subline">
                                              Záznam patří k jiné relaci, proto ho teď neodesíláme.
                                            </span>
                                          </div>
                                        </td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        ) : null}
                      </>
                    )}
                  </div>
                ) : null}
              </div>);
}
