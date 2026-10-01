import {
type ScheduleEventKind
} from '../../../data/schedule';
import { SCHEDULE_KIND_LABELS } from '../../schedule/model';
import { escapeHtml,formatDocumentDate,formatFileSize,normalizeEditorBodyHtml,slugify } from '../../shared/format';
import { CONTENT_ARTICLE_ALLOWED_IMAGE_TYPES,CONTENT_ARTICLE_FONT_SIZE_OPTIONS,CONTENT_ARTICLE_IMAGES_BUCKET,CONTENT_DOCUMENT_MAX_SIZE,EDITOR_SECTIONS,EMPTY_DOCUMENT_FORM,EMPTY_EDITOR_FORM,EMPTY_SCHEDULE_FORM,EditorArticle,EditorDocument,EditorDocumentFormState,EditorDocumentLink,EditorFormState,EditorScheduleEvent,EditorScheduleFormState,EditorSection,EditorSignedImageUpload,editorDocumentLinks,readEditorSection } from '../model';

export type ScheduleEditorSectionProps = {
activeSection: "clanky" | "poradi-zl" | "body-zl" | "alba" | "dokumenty" | "terminy" | "kontrola-jmen";
resetScheduleForm: () => void;
loadScheduleEvents: () => Promise<void>;
scheduleEvents: EditorScheduleEvent[];
activeScheduleId: string | null;
selectScheduleEvent: (entry: EditorScheduleEvent) => void;
scheduleForm: EditorScheduleFormState;
updateScheduleField: <Key extends keyof EditorScheduleFormState>(key: Key, value: EditorScheduleFormState[Key]) => void;
scheduleMessage: string | null;
handleScheduleDelete: () => void;
scheduleSaving: boolean;
handleScheduleSave: () => void;
};

export function ScheduleEditorSection({ activeSection, resetScheduleForm, loadScheduleEvents, scheduleEvents, activeScheduleId, selectScheduleEvent, scheduleForm, updateScheduleField, scheduleMessage, handleScheduleDelete, scheduleSaving, handleScheduleSave }: ScheduleEditorSectionProps) {
return (<section
              className="editor-section homepage-card editor-documents editor-schedule"
              aria-label="Termíny"
              hidden={activeSection !== 'terminy'}
            >
              <div className="editor-documents-header">
                <div>
                  <h2>Termíny</h2>
                  <p>
                    Akce, sněmy a štáby v Plánu akcí. Seznam se sám dělí na nejbližší a proběhlé, řadí se podle data.
                  </p>
                </div>
                <div className="editor-documents-actions">
                  <button type="button" className="homepage-button homepage-button--ghost" onClick={resetScheduleForm}>
                    Nový
                  </button>
                  <button
                    type="button"
                    className="homepage-button homepage-button--ghost"
                    onClick={loadScheduleEvents}
                  >
                    Obnovit
                  </button>
                </div>
              </div>

              <div className="editor-documents-grid">
                <div className="editor-documents-list-panel">
                  <ul className="editor-list">
                    {scheduleEvents.length === 0 ? (
                      <li className="editor-empty">Zatím tu nic není. Klikni na „Nový“ a přidej první termín.</li>
                    ) : (
                      scheduleEvents.map((entry) => (
                        <li key={entry.id}>
                          <button
                            type="button"
                            className={`editor-list-item${entry.id === activeScheduleId ? ' is-active' : ''}`}
                            onClick={() => selectScheduleEvent(entry)}
                          >
                            <span>{entry.name}</span>
                            <small>
                              {SCHEDULE_KIND_LABELS[entry.kind]}
                              {` · ${formatDocumentDate(entry.start_date)}`}
                              {entry.end_date ? ` – ${formatDocumentDate(entry.end_date)}` : ''}
                              {entry.published ? '' : ' · skryto'}
                            </small>
                          </button>
                        </li>
                      ))
                    )}
                  </ul>
                </div>

                <div className="editor-form editor-documents-form">
                  <h3>{activeScheduleId ? 'Upravit termín' : 'Nový termín'}</h3>
                  <div className="editor-form-grid">
                    <label>
                      Název
                      <input
                        value={scheduleForm.name}
                        onChange={(event) => updateScheduleField('name', event.target.value)}
                        placeholder="Např. Setonův závod"
                      />
                    </label>
                    <label>
                      Druh
                      <select
                        value={scheduleForm.kind}
                        onChange={(event) => updateScheduleField('kind', event.target.value as ScheduleEventKind)}
                      >
                        {(Object.keys(SCHEDULE_KIND_LABELS) as ScheduleEventKind[]).map((kind) => (
                          <option value={kind} key={kind}>
                            {SCHEDULE_KIND_LABELS[kind]}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Datum
                      <input
                        type="date"
                        value={scheduleForm.start_date}
                        onChange={(event) => updateScheduleField('start_date', event.target.value)}
                      />
                    </label>
                    <label>
                      Konec (jen u vícedenních)
                      <input
                        type="date"
                        value={scheduleForm.end_date}
                        onChange={(event) => updateScheduleField('end_date', event.target.value)}
                      />
                    </label>
                  </div>

                  <label>
                    Odkaz
                    <input
                      value={scheduleForm.href}
                      onChange={(event) => updateScheduleField('href', event.target.value)}
                      placeholder="/souteze/setonuv-zavod"
                    />
                  </label>

                  <label>
                    Poznámka
                    <input
                      value={scheduleForm.note}
                      onChange={(event) => updateScheduleField('note', event.target.value)}
                      placeholder="Např. Grilovací sněm"
                    />
                  </label>

                  <div className="editor-documents-flags">
                    <label className="editor-check">
                      <input
                        type="checkbox"
                        checked={scheduleForm.published}
                        onChange={(event) => updateScheduleField('published', event.target.checked)}
                      />
                      <span>Zobrazovat na webu</span>
                    </label>
                  </div>

                  {scheduleMessage ? <p className="homepage-alert">{scheduleMessage}</p> : null}

                  <div className="editor-buttons">
                    {activeScheduleId ? (
                      <button
                        type="button"
                        className="homepage-button homepage-button--ghost"
                        onClick={handleScheduleDelete}
                        disabled={scheduleSaving}
                      >
                        Smazat
                      </button>
                    ) : null}
                    <button
                      type="button"
                      className="homepage-button"
                      onClick={handleScheduleSave}
                      disabled={scheduleSaving}
                    >
                      {scheduleSaving ? 'Ukládám…' : 'Uložit'}
                    </button>
                  </div>
                </div>
              </div>
            </section>);
}
