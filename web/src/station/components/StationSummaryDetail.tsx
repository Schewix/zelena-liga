import { BASE_CATEGORY_ORDER,CALC_SCORE_REVIEW_ORDER_BY_CATEGORY,CALC_SCORE_REVIEW_SEPARATOR_BEFORE_BY_CATEGORY,SCORE_REVIEW_TASK_KEYS,StationOrderOverrides,formatBaseCategoryDetailLabel,getStationDisplayName,normalizeStationOrderOverrides } from '../scoreReview';
import { AuthenticatedState,CalcPatrolLoadMode,Patrol,PatrolFormDraft,PatrolProfileChildRow,StationCategorySummary,StationCategorySummaryItem,StationScoreRow,StationScoreRowState,StationSummaryPatrol,SummaryCategoryKey } from '../types';

export type StationSummaryDetailProps = {
summaryDetailRef: React.RefObject<HTMLDivElement | null>;
selectedSummaryDetail: StationCategorySummaryItem;
setSelectedSummaryCategory: React.Dispatch<React.SetStateAction<SummaryCategoryKey | null>>;
summaryMissingRef: React.RefObject<HTMLDivElement | null>;
formatSummaryPatrolDisplayLabel: (patrol: StationSummaryPatrol) => string;
stationCode: string;
handleSelectSummaryPatrol: (patrol: StationSummaryPatrol) => Promise<void>;
summaryCompletedRef: React.RefObject<HTMLDivElement | null>;
setShowCompletedSummary: React.Dispatch<React.SetStateAction<boolean>>;
showCompletedSummary: boolean;
};

export function StationSummaryDetail({ summaryDetailRef, selectedSummaryDetail, setSelectedSummaryCategory, summaryMissingRef, formatSummaryPatrolDisplayLabel, stationCode, handleSelectSummaryPatrol, summaryCompletedRef, setShowCompletedSummary, showCompletedSummary }: StationSummaryDetailProps) {
return (<div
                ref={summaryDetailRef}
                className="station-summary-detail"
                role="region"
                aria-live="polite"
              >
                <div className="station-summary-detail-header">
                  <h3>{formatBaseCategoryDetailLabel(selectedSummaryDetail.key)}</h3>
                  <button
                    type="button"
                    className="ghost"
                    onClick={() => setSelectedSummaryCategory(null)}
                  >
                    Zavřít
                  </button>
                </div>
                <p className="card-hint">
                  {selectedSummaryDetail.expected === 0
                    ? 'Tato kategorie nemá žádné hlídky.'
                    : `Absolvováno ${selectedSummaryDetail.visited} z ${selectedSummaryDetail.expected} hlídek.`}
                  {selectedSummaryDetail.expected > 0 && selectedSummaryDetail.missing.length > 0
                    ? ` Chybí ${selectedSummaryDetail.missing.length}.`
                    : selectedSummaryDetail.expected > 0
                      ? ' Všechny hlídky již stanoviště navštívily.'
                      : null}
                </p>
                <div className="station-summary-sections">
                  {selectedSummaryDetail.missing.length ? (
                    <div ref={summaryMissingRef} className="station-summary-section">
                      <div className="station-summary-section-header">
                        <h4>Chybějící hlídky ({selectedSummaryDetail.missing.length})</h4>
                        <span className="card-hint">Kliknutím vybereš hlídku k obsluze.</span>
                      </div>
                      <ul className="station-summary-list">
                        {selectedSummaryDetail.missing.map((patrol) => {
                          const codeLabel = formatSummaryPatrolDisplayLabel(patrol);
                          const isSelectable = !patrol.visited || stationCode === 'T';
                          return (
                            <li key={patrol.id}>
                              <button
                                type="button"
                                className="station-summary-item"
                                data-visited={patrol.visited ? '1' : '0'}
                                onClick={() => handleSelectSummaryPatrol(patrol)}
                                disabled={!isSelectable}
                                aria-label={`Vybrat hlídku ${codeLabel}`}
                              >
                                <div className="station-summary-item-header">
                                  <strong>{codeLabel}</strong>
                                  <span className="station-summary-item-status">Chybí</span>
                                </div>
                                {patrol.teamName ? <span>{patrol.teamName}</span> : null}
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  ) : null}
                  <div ref={summaryCompletedRef} className="station-summary-section">
                    <div className="station-summary-section-header">
                      <h4>Splněné hlídky ({selectedSummaryDetail.completed.length})</h4>
                      {selectedSummaryDetail.completed.length ? (
                        <button
                          type="button"
                          className="ghost"
                          onClick={() => setShowCompletedSummary((prev) => !prev)}
                          aria-expanded={showCompletedSummary}
                        >
                          {showCompletedSummary ? 'Skrýt hotové' : 'Ukázat hotové'}
                        </button>
                      ) : null}
                    </div>
                    {selectedSummaryDetail.completed.length ? (
                      showCompletedSummary ? (
                        <ul className="station-summary-list">
                          {selectedSummaryDetail.completed.map((patrol) => {
                            const codeLabel = formatSummaryPatrolDisplayLabel(patrol);
                            return (
                              <li key={patrol.id}>
                                <button
                                  type="button"
                                  className="station-summary-item"
                                  data-visited="1"
                                  onClick={() => handleSelectSummaryPatrol(patrol)}
                                  disabled={stationCode !== 'T'}
                                  aria-label={`Vybrat hlídku ${codeLabel}`}
                                >
                                  <div className="station-summary-item-header">
                                    <strong>{codeLabel}</strong>
                                    <span className="station-summary-item-status">Hotovo</span>
                                  </div>
                                  {patrol.teamName ? <span>{patrol.teamName}</span> : null}
                                </button>
                              </li>
                            );
                          })}
                        </ul>
                      ) : (
                        <p className="card-hint">Hotové hlídky jsou skryté.</p>
                      )
                    ) : (
                      <p className="card-hint">Zatím tu nejsou hotové hlídky.</p>
                    )}
                  </div>
                </div>
              </div>);
}
