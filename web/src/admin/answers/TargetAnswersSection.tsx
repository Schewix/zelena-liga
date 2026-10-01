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
import { DEFAULT_TARGET_ANSWER_OPTION_COUNT,formatMinutesAsTimeInput,parseTimeInputToMinutes,toPositiveInt,toTargetAnswerOptionCount } from '../setup/validation';
import { AnswersFormState,AnswersSummary,AuthenticatedState,CategoryToggleState,DisqualifyPatrol,EventState,JudgeTaskPresetKey,MissingDialogState,PatrolCountsState,PatrolStartsState,PatrolSummary,SelectedSetupAssignmentSummary,SetupAssignmentRow,SetupEventRow,SetupEventScoringConfig,SetupJudgeRow,SetupStationOrderPayload,SetupStationOrderRow,SetupStationRow,StationPassageRow,StationSplitDraft } from '../types';

export type TargetAnswersSectionProps = {
targetAnswerInputHint: "A-C" | "A-D";
loadAnswers: () => Promise<void>;
answersLoading: boolean;
answersError: string | null;
answersSuccess: string | null;
activeEventName: string;
answersTargetOptionCount: TargetAnswerOptionCount;
setAnswersTargetOptionCount: React.Dispatch<React.SetStateAction<TargetAnswerOptionCount>>;
setupSaving: boolean;
setupLoading: boolean;
answersSummary: AnswersSummary;
answersForm: AnswersFormState;
setAnswersForm: React.Dispatch<React.SetStateAction<AnswersFormState>>;
targetAnswerInputPattern: "[A-Ca-c]*" | "[A-Da-d]*";
handleSaveAnswers: () => Promise<void>;
answersSaving: boolean;
};

export function TargetAnswersSection({ targetAnswerInputHint, loadAnswers, answersLoading, answersError, answersSuccess, activeEventName, answersTargetOptionCount, setAnswersTargetOptionCount, setupSaving, setupLoading, answersSummary, answersForm, setAnswersForm, targetAnswerInputPattern, handleSaveAnswers, answersSaving }: TargetAnswersSectionProps) {
return (<section className="admin-card admin-card--with-divider admin-card--section admin-section-block admin-section-block--stations">
          <header className="admin-card-header">
            <div>
              <h2>Správné odpovědi – Terčový úsek</h2>
              <p className="admin-card-subtitle">
                Zadej 12 odpovědí ({targetAnswerInputHint}) pro každou kategorii.
              </p>
            </div>
            <div className="admin-card-actions">
              <button
                type="button"
                className="admin-button admin-button--secondary"
                onClick={loadAnswers}
                disabled={answersLoading}
              >
                {answersLoading ? 'Načítám…' : 'Obnovit'}
              </button>
            </div>
          </header>
          {answersError ? <p className="admin-error">{answersError}</p> : null}
          {answersSuccess ? <p className="admin-success">{answersSuccess}</p> : null}
          <p className="admin-card-subtitle">
            Ročník nastavení: <strong>{activeEventName}</strong>
          </p>
          <div className="admin-disqualify-form">
            <label className="admin-field" htmlFor="admin-target-answer-option-count">
              <span>Počet možností pro otázku</span>
              <select
                id="admin-target-answer-option-count"
                value={answersTargetOptionCount}
                onChange={(event) => setAnswersTargetOptionCount(toTargetAnswerOptionCount(event.target.value))}
                disabled={setupSaving || setupLoading}
              >
                <option value={4}>4 možnosti (A-D)</option>
                <option value={3}>3 možnosti (A-C)</option>
              </select>
            </label>
          </div>
          <p className="admin-card-subtitle">
            Ve výpočetce rozhodčí zadává <strong>X</strong>, pokud hlídka odpověď nevyplní.
          </p>
          <div className="admin-answers-grid">
            {ANSWER_CATEGORIES.map((category) => {
              const summary = answersSummary[category];
              const hasAnswers = summary.letters.length > 0;
              const formattedLetters = summary.letters.join(' ');
              const updatedAt = summary.updatedAt ? new Date(summary.updatedAt) : null;

              return (
                <div key={category} className="admin-answers-field">
                  <label htmlFor={`answers-${category}`}>
                    <span className="admin-answers-label">{category}</span>
                    <input
                      id={`answers-${category}`}
                      value={answersForm[category]}
                      onChange={(event) =>
                        setAnswersForm((prev) => ({
                          ...prev,
                          [category]: normalizeAnswersInput(event.target.value, {
                            maxOptionCount: answersTargetOptionCount,
                          }),
                        }))
                      }
                      placeholder={`např. ${targetAnswerInputHint}…`}
                      pattern={targetAnswerInputPattern}
                    />
                  </label>
                  <p className="admin-answers-meta">
                    {hasAnswers ? (
                      <>
                        <span className="admin-answers-meta-item admin-answers-meta-count">
                          {`${summary.letters.length} odpovědí`}
                        </span>
                        <span className="admin-answers-meta-item admin-answers-meta-letters">
                          {formattedLetters}
                        </span>
                      </>
                    ) : (
                      <span className="admin-answers-meta-item">Nenastaveno</span>
                    )}
                    {updatedAt ? (
                      <time
                        className="admin-answers-meta-item admin-answers-meta-time"
                        dateTime={updatedAt.toISOString()}
                        suppressHydrationWarning
                      >
                        {updatedAt.toLocaleString('cs-CZ')}
                      </time>
                    ) : null}
                  </p>
                </div>
              );
            })}
          </div>
          <div className="admin-card-actions admin-card-actions--end">
            <button
              type="button"
              className="admin-button admin-button--primary"
              onClick={handleSaveAnswers}
              disabled={answersSaving}
            >
              {answersSaving ? 'Ukládám…' : 'Uložit správné odpovědi'}
            </button>
          </div>
        </section>);
}
