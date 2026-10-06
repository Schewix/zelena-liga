import { buildPatrolTeamNameFromTroops,buildUniqueTroopList,createEmptyPatrolProfileRows,normalizeProfileText,normalizeTroopName,parsePatrolProfileDraft,parseTroopsFromTeamName,stringifyPatrolProfileRows,validatePatrolProfileDraft } from '../patrolProfile';
import { AuthenticatedState,CalcPatrolLoadMode,Patrol,PatrolFormDraft,PatrolProfileChildRow,StationCategorySummary,StationCategorySummaryItem,StationScoreRow,StationScoreRowState,StationSummaryPatrol,SummaryCategoryKey } from '../types';

export type PatrolProfileCardProps = {
calcProfileRef: React.RefObject<HTMLElement | null>;
isCalcProfileOnlyMode: boolean;
handleOpenFullCalcForm: () => void;
handleSavePatrolProfile: () => Promise<void>;
savingPatrolProfile: boolean;
calcTroopSelectDraft: string;
setCalcTroopSelectDraft: React.Dispatch<React.SetStateAction<string>>;
clearPatrolProfileFeedback: () => void;
calcTroopOptions: string[];
handleAddSelectedTroop: () => void;
calcCustomTroopDraft: string;
setCalcCustomTroopDraft: React.Dispatch<React.SetStateAction<string>>;
handleAddCustomTroop: () => void;
calcSelectedTroops: string[];
handleRemoveTroop: (troopToRemove: string) => void;
calcMemberRows: PatrolProfileChildRow[];
calcProfileDraft: { troops: string[]; rows: { firstName: string; lastName: string; nickname: string; troop: string; }[]; teamName: string; membersText: string | null; requiresTroopPerChild: boolean; };
calcCategoryDraft: string;
setCalcCategoryDraft: (value: string) => void;
calcSexDraft: string;
setCalcSexDraft: (value: string) => void;
calcNumberDraft: string;
setCalcNumberDraft: (value: string) => void;
handleProfileRowChange: (rowIndex: number, field: keyof PatrolProfileChildRow, value: string) => void;
patrolProfileError: string | null;
patrolProfileMessage: string | null;
};

export function PatrolProfileCard({ calcProfileRef, isCalcProfileOnlyMode, handleOpenFullCalcForm, handleSavePatrolProfile, savingPatrolProfile, calcTroopSelectDraft, setCalcTroopSelectDraft, clearPatrolProfileFeedback, calcTroopOptions, handleAddSelectedTroop, calcCustomTroopDraft, setCalcCustomTroopDraft, handleAddCustomTroop, calcSelectedTroops, handleRemoveTroop, calcMemberRows, calcProfileDraft, calcCategoryDraft, setCalcCategoryDraft, calcSexDraft, setCalcSexDraft, calcNumberDraft, setCalcNumberDraft, handleProfileRowChange, patrolProfileError, patrolProfileMessage }: PatrolProfileCardProps) {
return (<section ref={calcProfileRef} className="card calc-profile-card">
              <header className="card-header">
                <div>
                  <h2>Profil hlídky</h2>
                  <p className="card-subtitle">Vyplň oddíl a členy zvlášť. Údaje se uloží do karty hlídky.</p>
                </div>
                <div className="card-actions">
                  {isCalcProfileOnlyMode ? (
                    <button
                      type="button"
                      className="ghost"
                      onClick={handleOpenFullCalcForm}
                    >
                      Přejít na bodování
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className="primary"
                    onClick={() => void handleSavePatrolProfile()}
                    disabled={savingPatrolProfile}
                  >
                    {savingPatrolProfile ? 'Ukládám…' : 'Uložit profil'}
                  </button>
                </div>
              </header>
              <div className="calc-patrol-profile">
                <div className="calc-profile-troops">
                  <div className="calc-time-input">
                    <label htmlFor="calc-patrol-category">Kategorie a číslo hlídky</label>
                    <div className="calc-profile-inline">
                      <select
                        id="calc-patrol-category"
                        value={calcCategoryDraft}
                        onChange={(event) => {
                          setCalcCategoryDraft(event.target.value);
                          clearPatrolProfileFeedback();
                        }}
                      >
                        {['N', 'M', 'S', 'R'].map((category) => (
                          <option key={category} value={category}>
                            {category}
                          </option>
                        ))}
                      </select>
                      <select
                        id="calc-patrol-sex"
                        aria-label="Pohlaví hlídky"
                        value={calcSexDraft}
                        onChange={(event) => {
                          setCalcSexDraft(event.target.value);
                          clearPatrolProfileFeedback();
                        }}
                      >
                        {['H', 'D'].map((sex) => (
                          <option key={sex} value={sex}>
                            {sex}
                          </option>
                        ))}
                      </select>
                      <input
                        id="calc-patrol-number"
                        type="number"
                        inputMode="numeric"
                        min={1}
                        max={300}
                        aria-label="Číslo hlídky"
                        value={calcNumberDraft}
                        onChange={(event) => {
                          setCalcNumberDraft(event.target.value);
                          clearPatrolProfileFeedback();
                        }}
                      />
                    </div>
                  </div>
                </div>
                <div className="calc-profile-troops">
                  <div className="calc-time-input">
                    <label htmlFor="calc-troop-select">Oddíl z nabídky</label>
                    <div className="calc-profile-inline">
                      <select
                        id="calc-troop-select"
                        value={calcTroopSelectDraft}
                        onChange={(event) => {
                          setCalcTroopSelectDraft(event.target.value);
                          clearPatrolProfileFeedback();
                        }}
                      >
                        {calcTroopOptions.map((troop) => (
                          <option key={troop} value={troop}>
                            {troop}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        className="ghost"
                        onClick={handleAddSelectedTroop}
                        disabled={!calcTroopOptions.length}
                      >
                        Přidat oddíl
                      </button>
                    </div>
                  </div>
                  <div className="calc-time-input">
                    <label htmlFor="calc-troop-custom">Přidat nový oddíl</label>
                    <div className="calc-profile-inline">
                      <input
                        id="calc-troop-custom"
                        type="text"
                        value={calcCustomTroopDraft}
                        onChange={(event) => {
                          setCalcCustomTroopDraft(event.target.value);
                          clearPatrolProfileFeedback();
                        }}
                        maxLength={120}
                        placeholder="Např. 4. PTO Brno"
                      />
                      <button
                        type="button"
                        className="ghost"
                        onClick={handleAddCustomTroop}
                        disabled={!normalizeTroopName(calcCustomTroopDraft)}
                      >
                        Přidat
                      </button>
                    </div>
                  </div>
                  <div className="calc-profile-troop-list">
                    {calcSelectedTroops.length ? (
                      calcSelectedTroops.map((troop) => (
                        <span key={troop} className="calc-profile-troop-chip">
                          <span>{troop}</span>
                          <button
                            type="button"
                            className="ghost"
                            onClick={() => handleRemoveTroop(troop)}
                            aria-label={`Odebrat oddíl ${troop}`}
                          >
                            ×
                          </button>
                        </span>
                      ))
                    ) : (
                      <p className="card-hint">Vyber alespoň jeden oddíl.</p>
                    )}
                  </div>
                </div>
                <div className="calc-profile-children">
                  <h3>Děti v hlídce</h3>
                  <div className="calc-profile-table-wrapper">
                    <table className="calc-profile-table">
                      <thead>
                        <tr>
                          <th>#</th>
                          <th>Jméno</th>
                          <th>Příjmení</th>
                          <th>Přezdívka</th>
                          <th>Oddíl</th>
                        </tr>
                      </thead>
                      <tbody>
                        {calcMemberRows.map((row, index) => {
                          const requiresTroop = calcProfileDraft.requiresTroopPerChild;
                          const rowTroopValue = calcSelectedTroops.includes(row.troop) ? row.troop : '';
                          return (
                            <tr key={`calc-member-row-${index}`}>
                              <td>{index + 1}</td>
                              <td>
                                <input
                                  type="text"
                                  value={row.firstName}
                                  onChange={(event) => handleProfileRowChange(index, 'firstName', event.target.value)}
                                  placeholder="Jméno"
                                  maxLength={80}
                                />
                              </td>
                              <td>
                                <input
                                  type="text"
                                  value={row.lastName}
                                  onChange={(event) => handleProfileRowChange(index, 'lastName', event.target.value)}
                                  placeholder="Příjmení"
                                  maxLength={80}
                                />
                              </td>
                              <td>
                                <input
                                  type="text"
                                  value={row.nickname}
                                  onChange={(event) => handleProfileRowChange(index, 'nickname', event.target.value)}
                                  placeholder="Nepovinné"
                                  maxLength={80}
                                />
                              </td>
                              <td>
                                {requiresTroop ? (
                                  <select
                                    value={rowTroopValue}
                                    onChange={(event) => handleProfileRowChange(index, 'troop', event.target.value)}
                                  >
                                    <option value="">Vyber oddíl</option>
                                    {calcSelectedTroops.map((troop) => (
                                      <option key={`${index}-${troop}`} value={troop}>
                                        {troop}
                                      </option>
                                    ))}
                                  </select>
                                ) : (
                                  <input
                                    type="text"
                                    value={calcSelectedTroops[0] ?? ''}
                                    readOnly
                                    disabled
                                    placeholder="Oddíl"
                                  />
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  <p className="card-hint">
                    Vyplň maximálně 3 děti. Přezdívka je volitelná. Při více oddílech je oddíl u dítěte povinný.
                  </p>
                </div>
              </div>
              {patrolProfileError ? <p className="error-text">{patrolProfileError}</p> : null}
              {patrolProfileMessage ? <p className="success-text">{patrolProfileMessage}</p> : null}
            </section>);
}
