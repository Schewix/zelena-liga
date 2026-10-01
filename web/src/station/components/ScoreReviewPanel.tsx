import { Fragment,ClipboardEvent as ReactClipboardEvent,FormEvent as ReactFormEvent,useCallback,useEffect,useMemo,useRef,useState } from 'react';
import { WAIT_MINUTES_MAX,WAIT_TIME_MAX,WAIT_TIME_ZERO,combineDateWithTime,formatDateTimeLabel,formatDurationMs,formatTime,formatWaitDraft,formatWaitDuration,formatWaitMinutes,normalizeWaitInput,parseWaitDraft,toLocalTimeInput,waitSecondsToMinutes } from '../time';
import { AuthenticatedState,CalcPatrolLoadMode,Patrol,PatrolFormDraft,PatrolProfileChildRow,StationCategorySummary,StationCategorySummaryItem,StationScoreRow,StationScoreRowState,StationSummaryPatrol,SummaryCategoryKey } from '../types';

export type ScoreReviewPanelProps = {
handleRefreshScoreReview: () => void;
scoreReviewLoading: boolean;
scoreReviewError: string | null;
scoreReviewRows: StationScoreRow[];
scoreReviewState: Record<string, StationScoreRowState>;
stationCode: string;
targetSectionPoints: number | null;
timePoints: number | null;
handleScoreDraftChange: (stationId: string, value: string) => void;
handleWaitDraftChange: (stationId: string, value: string) => void;
handleScoreOkToggle: (stationId: string, ok: boolean) => void;
handleSaveStationScore: (stationId: string) => Promise<void>;
};

export function ScoreReviewPanel({ handleRefreshScoreReview, scoreReviewLoading, scoreReviewError, scoreReviewRows, scoreReviewState, stationCode, targetSectionPoints, timePoints, handleScoreDraftChange, handleWaitDraftChange, handleScoreOkToggle, handleSaveStationScore }: ScoreReviewPanelProps) {
return (<div className="score-review">
                    <div className="score-review-header">
                      <div>
                        <h3>Kontrola bodů stanovišť</h3>
                        <p className="card-hint">Zkontroluj body ze všech stanovišť a případně je uprav.</p>
                      </div>
                      <button
                        type="button"
                        className="ghost score-review-refresh"
                        onClick={handleRefreshScoreReview}
                        disabled={scoreReviewLoading}
                      >
                        {scoreReviewLoading ? 'Načítám…' : 'Obnovit'}
                      </button>
                    </div>
                    {scoreReviewError ? <p className="error-text">{scoreReviewError}</p> : null}
                    {!scoreReviewRows.length && !scoreReviewLoading ? (
                      <p className="card-hint">Pro tuto hlídku zatím nejsou žádné body k zobrazení.</p>
                    ) : null}
                    {scoreReviewRows.length ? (
                      <div className="score-review-table">
                        <table>
                          <thead>
                            <tr>
                              <th>Body</th>
                              <th>Čekání (HH:MM)</th>
                              <th>Stanoviště</th>
                              <th>Poznámka</th>
                              <th>OK</th>
                              <th>Akce</th>
                            </tr>
                          </thead>
                          <tbody>
                            {scoreReviewRows.map((row) => {
                              const state =
                                scoreReviewState[row.stationId] ??
                                ({
                                  ok: true,
                                  pointsDraft: row.points !== null ? String(row.points) : '',
                                  waitDraft: formatWaitDraft(row.waitMinutes),
                                  saving: false,
                                  error: null,
                                } satisfies StationScoreRowState);
                              const isAutoTargetRow = stationCode === 'T' && row.stationCode === 'R';
                              const isAutoTimeRow = stationCode === 'T' && row.stationCode === 'T';
                              const isAutoComputedRow = isAutoTargetRow || isAutoTimeRow;
                              const computedPoints = isAutoTargetRow
                                ? targetSectionPoints
                                : isAutoTimeRow
                                  ? timePoints
                                  : null;
                              const pointsDraft = isAutoComputedRow
                                ? (typeof computedPoints === 'number' ? String(computedPoints) : '')
                                : state.pointsDraft;
                              const rawWaitDraft = isAutoComputedRow ? WAIT_TIME_ZERO : state.waitDraft;
                              const pointsTrimmed = pointsDraft.trim();
                              const pointsNumber = pointsTrimmed === '' ? NaN : Number(pointsTrimmed);
                              const waitNumber = parseWaitDraft(rawWaitDraft);
                              const waitDraft = Number.isNaN(waitNumber)
                                ? rawWaitDraft || WAIT_TIME_ZERO
                                : formatWaitDraft(waitNumber);
                              const pointsValid =
                                Number.isInteger(pointsNumber) && pointsNumber >= 0 && pointsNumber <= 12;
                              const waitValid =
                                Number.isInteger(waitNumber) && waitNumber >= 0 && waitNumber <= WAIT_MINUTES_MAX;
                              const dirtyPoints = Number.isNaN(pointsNumber)
                                ? row.points !== null
                                : row.points === null
                                  ? true
                                  : pointsNumber !== row.points;
                              const baseWait = row.waitMinutes ?? 0;
                              const dirtyWait = Number.isNaN(waitNumber)
                                ? row.waitMinutes !== null
                                : waitNumber !== baseWait;
                              const isValid = pointsValid && waitValid;
                              const dirty = !state.ok && !isAutoComputedRow && (dirtyPoints || dirtyWait);
                              return (
                                <Fragment key={row.stationId}>
                                  {row.separatorBefore ? (
                                    <tr className="score-review-separator" aria-hidden>
                                      <td colSpan={6} />
                                    </tr>
                                  ) : null}
                                  <tr className={state.ok ? '' : 'score-review-editing'}>
                                    <td>
                                      {isAutoComputedRow ? (
                                        <span className="score-review-auto-value">
                                          {typeof computedPoints === 'number' ? computedPoints : '—'}
                                        </span>
                                      ) : (
                                        <input
                                          type="number"
                                          min={0}
                                          max={12}
                                          inputMode="numeric"
                                          value={pointsDraft}
                                          onChange={(event) => handleScoreDraftChange(row.stationId, event.target.value)}
                                          disabled={state.ok || state.saving}
                                          placeholder="—"
                                          className="score-review-input"
                                        />
                                      )}
                                    </td>
                                    <td>
                                      {isAutoComputedRow ? (
                                        <span className="score-review-auto-value">—</span>
                                      ) : (
                                        <input
                                          type="time"
                                          step={60}
                                          min={WAIT_TIME_ZERO}
                                          max={WAIT_TIME_MAX}
                                          value={waitDraft}
                                          onChange={(event) => handleWaitDraftChange(row.stationId, event.target.value)}
                                          disabled={state.ok || state.saving}
                                          placeholder="hh:mm"
                                          className="score-review-input score-review-input--wait"
                                        />
                                      )}
                                    </td>
                                    <td>
                                      <div className="score-review-station">
                                        <span className="score-review-code">{row.stationCode || '—'}</span>
                                        <span className="score-review-name">{row.stationName}</span>
                                      </div>
                                    </td>
                                    <td>
                                      <span className="score-review-note">{row.note?.trim() || '—'}</span>
                                    </td>
                                    <td>
                                      {isAutoComputedRow ? (
                                        <span className="score-review-status">AUTO</span>
                                      ) : (
                                        <label className="score-review-check">
                                          <input
                                            type="checkbox"
                                            checked={state.ok}
                                            onChange={(event) => handleScoreOkToggle(row.stationId, event.target.checked)}
                                            disabled={state.saving}
                                          />
                                          <span>OK</span>
                                        </label>
                                      )}
                                    </td>
                                    <td>
                                      {isAutoComputedRow ? (
                                        <span className="score-review-status">Automaticky dopočteno</span>
                                      ) : state.ok ? (
                                        <span className="score-review-status">
                                          {row.hasScore ? 'Potvrzeno' : 'Bez bodů'}
                                        </span>
                                      ) : (
                                        <div className="score-review-actions">
                                          <button
                                            type="button"
                                            className="ghost score-review-save"
                                            onClick={() => handleSaveStationScore(row.stationId)}
                                            disabled={state.saving || !isValid || !dirty}
                                          >
                                            {state.saving ? 'Ukládám…' : 'Uložit'}
                                          </button>
                                          {state.error ? (
                                            <span className="error-text score-review-row-error">{state.error}</span>
                                          ) : null}
                                        </div>
                                      )}
                                    </td>
                                  </tr>
                                </Fragment>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    ) : null}
                  </div>);
}
