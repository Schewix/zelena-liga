import {
STATION_PASSAGE_CATEGORIES,
StationCategoryKey,
toStationCategoryKey
} from '../../utils/stationCategories';
import { BASE_CATEGORY_ORDER,MAYBE_LOST_PATROL_THRESHOLD_MS } from '../overview/constants';
import { DEFAULT_SETUP_TROOP_OPTIONS,compareTroopSheetOrder,normalizeTroopList,normalizeTroopName,parseTroopNumber,pickCanonicalTroopName,splitMixedTroopNames } from './troops';
import { DEFAULT_TARGET_ANSWER_OPTION_COUNT,formatMinutesAsTimeInput,parseTimeInputToMinutes,toPositiveInt,toTargetAnswerOptionCount } from './validation';
import { AnswersFormState,AnswersSummary,AuthenticatedState,CategoryToggleState,DisqualifyPatrol,EventState,JudgeTaskPresetKey,MissingDialogState,PatrolCountsState,PatrolStartsState,PatrolSummary,SelectedSetupAssignmentSummary,SetupAssignmentRow,SetupEventRow,SetupEventScoringConfig,SetupJudgeRow,SetupStationOrderPayload,SetupStationOrderRow,SetupStationRow,StationPassageRow,StationSplitDraft } from '../types';

export type EventScoringSettingsProps = {
setupEventScoringConfig: SetupEventScoringConfig;
setSetupEventScoringConfig: React.Dispatch<React.SetStateAction<SetupEventScoringConfig>>;
setupTroopOptions: string[];
handleToggleSetupTroop: (troopName: string) => void;
setupTroopDraft: string;
setSetupTroopDraft: React.Dispatch<React.SetStateAction<string>>;
handleAddSetupTroop: () => void;
handleSaveEventScoringConfig: () => Promise<void>;
setupSaving: boolean;
};

export function EventScoringSettings({ setupEventScoringConfig, setSetupEventScoringConfig, setupTroopOptions, handleToggleSetupTroop, setupTroopDraft, setSetupTroopDraft, handleAddSetupTroop, handleSaveEventScoringConfig, setupSaving }: EventScoringSettingsProps) {
return (<div className="admin-setup-block">
            <h3>Nastavení výsledků a času</h3>
            <p className="admin-card-subtitle">
              Kolik míst se zvýrazní ve výsledcích a do jakého času je za kategorii plných 12 bodů.
            </p>
            <h4>Vyhlašovaná místa (po kategoriích)</h4>
            <div className="admin-setup-scoring-grid">
              {STATION_PASSAGE_CATEGORIES.map((category) => (
                <div key={category} className="admin-setup-scoring-row">
                  <strong>{category}</strong>
                  <label className="admin-field" htmlFor={`admin-announced-places-${category}`}>
                    <span>Vyhlašovaná místa</span>
                    <input
                      id={`admin-announced-places-${category}`}
                      type="number"
                      min={1}
                      max={100}
                      value={setupEventScoringConfig.announcedPlaces[category]}
                      onChange={(event) =>
                        setSetupEventScoringConfig((prev) => ({
                          ...prev,
                          announcedPlaces: {
                            ...prev.announcedPlaces,
                            [category]: toPositiveInt(event.target.value, prev.announcedPlaces[category], 100),
                          },
                        }))
                      }
                    />
                  </label>
                </div>
              ))}
            </div>
            <h4>Čas pro plných 12 bodů</h4>
            <div className="admin-setup-scoring-grid">
              {BASE_CATEGORY_ORDER.map((category) => (
                <div key={`setup-time-limit-${category}`} className="admin-setup-scoring-row">
                  <strong>{category}</strong>
                  <label className="admin-field" htmlFor={`admin-time-limit-${category}`}>
                    <span>Čas pro 12 bodů (HH:MM)</span>
                    <input
                      id={`admin-time-limit-${category}`}
                      type="time"
                      step={60}
                      value={formatMinutesAsTimeInput(setupEventScoringConfig.timeLimitMinutes[category])}
                      onChange={(event) =>
                        setSetupEventScoringConfig((prev) => {
                          const nextMinutes = parseTimeInputToMinutes(event.target.value);
                          if (nextMinutes === null) {
                            return prev;
                          }
                          return {
                            ...prev,
                            timeLimitMinutes: {
                              ...prev.timeLimitMinutes,
                              [category]: nextMinutes,
                            },
                          };
                        })
                      }
                    />
                  </label>
                </div>
              ))}
            </div>
            <div className="admin-disqualify-form">
              <label className="admin-field" htmlFor="admin-time-step-minutes">
                <span>Penalizace po (min)</span>
                <input
                  id="admin-time-step-minutes"
                  type="number"
                  min={1}
                  max={1440}
                  value={setupEventScoringConfig.timePenaltyStepMinutes}
                  onChange={(event) =>
                    setSetupEventScoringConfig((prev) => ({
                      ...prev,
                      timePenaltyStepMinutes: toPositiveInt(event.target.value, prev.timePenaltyStepMinutes, 24 * 60),
                    }))
                  }
                />
              </label>
            </div>
            <div className="admin-setup-troops">
              <div>
                <h4>Účastnící se oddíly</h4>
                <p className="admin-card-subtitle">
                  Označ oddíly, které se účastní ročníku. Seznam se použije ve výpočetce při úpravě profilu hlídky.
                </p>
                <p className="admin-card-subtitle">
                  {setupEventScoringConfig.participatingTroops.length > 0
                    ? `Vybráno (${setupEventScoringConfig.participatingTroops.length}): ${setupEventScoringConfig.participatingTroops.join(', ')}`
                    : 'Zatím není vybraný žádný oddíl.'}
                </p>
              </div>
              <div className="admin-setup-troop-grid">
                {setupTroopOptions.map((troopName) => (
                  <label key={troopName} className="admin-check">
                    <input
                      type="checkbox"
                      checked={setupEventScoringConfig.participatingTroops.some(
                        (item) => item.toLocaleLowerCase('cs') === troopName.toLocaleLowerCase('cs'),
                      )}
                      onChange={() => handleToggleSetupTroop(troopName)}
                    />
                    <span>{troopName}</span>
                  </label>
                ))}
              </div>
              <div className="admin-disqualify-form">
                <label className="admin-field" htmlFor="admin-add-troop">
                  <span>Přidat další oddíl</span>
                  <div className="admin-setup-troop-inline">
                    <input
                      id="admin-add-troop"
                      value={setupTroopDraft}
                      onChange={(event) => setSetupTroopDraft(event.target.value)}
                      placeholder="Např. 4. PTO Brno"
                      maxLength={120}
                      autoComplete="off"
                    />
                    <button
                      type="button"
                      className="admin-button admin-button--secondary"
                      onClick={handleAddSetupTroop}
                      disabled={!normalizeTroopName(setupTroopDraft)}
                    >
                      Přidat oddíl
                    </button>
                  </div>
                </label>
              </div>
            </div>
            <div className="admin-card-actions admin-card-actions--end">
              <button
                type="button"
                className="admin-button admin-button--secondary"
                onClick={() => void handleSaveEventScoringConfig()}
                disabled={setupSaving}
              >
                {setupSaving ? 'Ukládám…' : 'Uložit nastavení výsledků'}
              </button>
            </div>
          </div>);
}
