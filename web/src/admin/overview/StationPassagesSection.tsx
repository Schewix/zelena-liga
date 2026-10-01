import {
ANSWER_CATEGORIES,
CategoryKey,
formatAnswersForInput,
isCategoryKey,
normalizeAnswersInput,
packAnswersForStorage,
parseAnswerLetters,
type TargetAnswerOptionCount,
} from '../../utils/targetAnswers';
import {
EMPTY_RACE_DASHBOARD_SUMMARY,
toAdminSectionId,
type RaceDashboardSummary,
} from '../adminSections';
import { BASE_CATEGORY_ORDER,MAYBE_LOST_PATROL_THRESHOLD_MS } from './constants';
import { AnswersFormState,AnswersSummary,AuthenticatedState,CategoryToggleState,DisqualifyPatrol,EventState,JudgeTaskPresetKey,MissingDialogState,PatrolCountsState,PatrolStartsState,PatrolSummary,SelectedSetupAssignmentSummary,SetupAssignmentRow,SetupEventRow,SetupEventScoringConfig,SetupJudgeRow,SetupStationOrderPayload,SetupStationOrderRow,SetupStationRow,StationPassageRow,StationSplitDraft } from '../types';

export type StationPassagesSectionProps = {
loadStationStats: () => Promise<void>;
stationLoading: boolean;
stationError: string | null;
raceDashboardSummary: RaceDashboardSummary;
stationRows: StationPassageRow[];
handleOpenStationMissing: (row: StationPassageRow, category: CategoryKey | "TOTAL") => void;
};

export function StationPassagesSection({ loadStationStats, stationLoading, stationError, raceDashboardSummary, stationRows, handleOpenStationMissing }: StationPassagesSectionProps) {
return (<section
          id="admin-passages-section"
          className="admin-card admin-card--with-divider admin-card--section admin-section-block admin-section-block--live"
        >
          <header className="admin-card-header">
            <div>
              <h2>Průchody stanovišť</h2>
              <p className="admin-card-subtitle">Počet hlídek na jednotlivých stanovištích podle kategorie.</p>
            </div>
            <div className="admin-card-actions">
              <button
                type="button"
                className="admin-button admin-button--secondary"
                onClick={loadStationStats}
                disabled={stationLoading}
              >
                {stationLoading ? 'Načítám…' : 'Obnovit přehled'}
              </button>
            </div>
          </header>
          {stationError ? <p className="admin-error">{stationError}</p> : null}
          {raceDashboardSummary.problematicStations > 0 ? (
            <p className="admin-error">
              Některá stanoviště mohou být offline nebo bez průchodů v průběhu závodu.
            </p>
          ) : null}
          {stationRows.some((row) => row.totalMissing.length > 0) ? (
            <p className="admin-notice">
              U některých stanovišť chybí průchody - zkontroluj chybějící hlídky kliknutím do tabulky.
            </p>
          ) : null}
          {stationRows.length === 0 && !stationLoading ? <p>Žádná data o průchodech stanovišť.</p> : null}
          {stationRows.length > 0 ? (
            <div className="admin-table-wrapper">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Stanoviště</th>
                    {BASE_CATEGORY_ORDER.map((category) => (
                      <th key={category}>{category}</th>
                    ))}
                    <th>CELKEM</th>
                  </tr>
                </thead>
                <tbody>
                  {stationRows.map((row) => (
                    <tr key={row.stationId}>
                      <td>
                        <div className="admin-station-label">
                          <span className="admin-station-code">{row.stationCode}</span>
                          <span>{row.stationName}</span>
                        </div>
                      </td>
                      {BASE_CATEGORY_ORDER.map((category) => {
                        const isAllowed = row.categories.includes(category);

                        if (!isAllowed) {
                          return (
                            <td key={`${row.stationId}-${category}`}>
                              <span className="admin-table-placeholder">–</span>
                            </td>
                          );
                        }

                        const expectedInCategory = row.expectedTotals[category];
                        const passed = row.totals[category];
                        const missingCount = row.missing[category].length;
                        const isDisabled = expectedInCategory === 0 && passed === 0;
                        const ariaLabel =
                          `Stanoviště ${row.stationCode} ${row.stationName}` +
                          ` – kategorie ${category}: ${passed} z ${expectedInCategory}`;
                        const buttonClassNames = [
                          'admin-table-button',
                          missingCount > 0
                            ? 'admin-table-button--missing'
                            : 'admin-table-button--complete',
                        ]
                          .filter(Boolean)
                          .join(' ');

                        return (
                          <td key={`${row.stationId}-${category}`}>
                            <button
                              type="button"
                              className={buttonClassNames}
                              onClick={() => handleOpenStationMissing(row, category)}
                              disabled={isDisabled}
                              aria-label={ariaLabel}
                            >
                              {passed}/{expectedInCategory}
                            </button>
                          </td>
                        );
                      })}
                      <td>
                        <button
                          type="button"
                          className={`admin-table-button ${
                            row.totalMissing.length > 0
                              ? 'admin-table-button--missing'
                              : 'admin-table-button--complete'
                          }`}
                          onClick={() => handleOpenStationMissing(row, 'TOTAL')}
                          disabled={row.totalExpected === 0}
                          aria-label={
                            `Stanoviště ${row.stationCode} ${row.stationName}` +
                            ` – celkem: ${row.totalPassed} z ${row.totalExpected}`
                          }
                        >
                          {row.totalPassed}/{row.totalExpected}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </section>);
}
