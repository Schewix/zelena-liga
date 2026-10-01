import {
Suspense,
lazy,
useCallback,
useEffect,
useMemo,
useRef,
useState,
type ChangeEvent,
type DragEvent,
type FormEvent
} from 'react';
import {
type SptoDocumentKind
} from '../../../data/documents';
import { COMPETITIONS } from '../../data/competitions';
import { CONTENT_DOCUMENTS_BUCKET,CONTENT_DOCUMENT_ACCEPT,DOCUMENT_KIND_LABELS,DOCUMENT_KIND_ORDER } from '../../documents/model';
import { escapeHtml,formatDocumentDate,formatFileSize,normalizeEditorBodyHtml,slugify } from '../../shared/format';
import { CONTENT_ARTICLE_ALLOWED_IMAGE_TYPES,CONTENT_ARTICLE_FONT_SIZE_OPTIONS,CONTENT_ARTICLE_IMAGES_BUCKET,CONTENT_DOCUMENT_MAX_SIZE,EDITOR_SECTIONS,EMPTY_DOCUMENT_FORM,EMPTY_EDITOR_FORM,EMPTY_SCHEDULE_FORM,EditorArticle,EditorDocument,EditorDocumentFormState,EditorDocumentLink,EditorFormState,EditorScheduleEvent,EditorScheduleFormState,EditorSection,EditorSignedImageUpload,editorDocumentLinks,readEditorSection } from '../model';

export type DocumentsEditorSectionProps = {
activeSection: "clanky" | "poradi-zl" | "body-zl" | "alba" | "dokumenty" | "terminy";
handleNewDocument: () => void;
loadDocuments: () => Promise<void>;
documentFilter: SptoDocumentKind | "all";
setDocumentFilter: React.Dispatch<React.SetStateAction<SptoDocumentKind | "all">>;
visibleDocuments: EditorDocument[];
activeDocumentId: string | null;
selectDocument: (doc: EditorDocument) => void;
scheduleEvents: EditorScheduleEvent[];
documentForm: EditorDocumentFormState;
updateDocumentField: <Key extends keyof EditorDocumentFormState>(key: Key, value: EditorDocumentFormState[Key]) => void;
documentDragActive: boolean;
setDocumentDragActive: React.Dispatch<React.SetStateAction<boolean>>;
handleDocumentDrop: (event: DragEvent<HTMLDivElement>) => Promise<void>;
documentUploading: boolean;
handleDocumentFileInput: (event: ChangeEvent<HTMLInputElement>) => Promise<void>;
addDocumentLink: () => void;
updateDocumentLink: (index: number, key: keyof EditorDocumentLink, value: string) => void;
removeDocumentLink: (index: number) => void;
documentMessage: string | null;
handleDocumentDelete: () => void;
documentSaving: boolean;
handleDocumentSave: () => void;
};

export function DocumentsEditorSection({ activeSection, handleNewDocument, loadDocuments, documentFilter, setDocumentFilter, visibleDocuments, activeDocumentId, selectDocument, scheduleEvents, documentForm, updateDocumentField, documentDragActive, setDocumentDragActive, handleDocumentDrop, documentUploading, handleDocumentFileInput, addDocumentLink, updateDocumentLink, removeDocumentLink, documentMessage, handleDocumentDelete, documentSaving, handleDocumentSave }: DocumentsEditorSectionProps) {
return (<section
              className="editor-section homepage-card editor-documents"
              aria-label="Dokumenty"
              hidden={activeSection !== 'dokumenty'}
            >
              <div className="editor-documents-header">
                <div>
                  <h2>Dokumenty</h2>
                  <p>
                    Propozice, pozvánky a zápisy se zobrazí v Plánu akcí u akce, kterou dokumentu přiřadíš.
                    Pravidla přiřazená k soutěži se ukážou na její stránce. Sborníčky se řadí podle roku na
                    stránku O SPTO.
                  </p>
                </div>
                <div className="editor-documents-actions">
                  <button type="button" className="homepage-button homepage-button--ghost" onClick={handleNewDocument}>
                    Nový
                  </button>
                  <button type="button" className="homepage-button homepage-button--ghost" onClick={loadDocuments}>
                    Obnovit
                  </button>
                </div>
              </div>

              <div className="editor-documents-grid">
                <div className="editor-documents-list-panel">
                  <div className="gallery-year-tabs editor-documents-filter" aria-label="Filtr typů dokumentů">
                    <button
                      type="button"
                      className={`gallery-year-tab${documentFilter === 'all' ? ' is-active' : ''}`}
                      onClick={() => setDocumentFilter('all')}
                    >
                      Vše
                    </button>
                    {DOCUMENT_KIND_ORDER.map((kind) => (
                      <button
                        key={kind}
                        type="button"
                        className={`gallery-year-tab${documentFilter === kind ? ' is-active' : ''}`}
                        onClick={() => setDocumentFilter(kind)}
                      >
                        {DOCUMENT_KIND_LABELS[kind]}
                      </button>
                    ))}
                  </div>
                  <ul className="editor-list">
                    {visibleDocuments.length === 0 ? (
                      <li className="editor-empty">Zatím tu nic není. Klikni na „Nový“ a nahraj první dokument.</li>
                    ) : (
                      visibleDocuments.map((doc) => (
                        <li key={doc.id}>
                          <button
                            type="button"
                            className={`editor-list-item${doc.id === activeDocumentId ? ' is-active' : ''}`}
                            onClick={() => selectDocument(doc)}
                          >
                            <span>{doc.title}</span>
                            <small>
                              {DOCUMENT_KIND_LABELS[doc.kind]}
                              {doc.schedule_event_id
                                ? ` · ${scheduleEvents.find((event) => event.id === doc.schedule_event_id)?.name ?? 'akce'}`
                                : ''}
                              {doc.competition_slug
                                ? ` · ${COMPETITIONS.find((competition) => competition.slug === doc.competition_slug)?.name ?? 'soutěž'}`
                                : ''}
                              {doc.event_date ? ` · ${formatDocumentDate(doc.event_date)}` : ''}
                              {doc.year ? ` · ${doc.year}` : ''}
                              {doc.published ? '' : ' · skryto'}
                              {doc.visibility === 'internal' ? ' · interní' : ''}
                            </small>
                          </button>
                        </li>
                      ))
                    )}
                  </ul>
                </div>

                <div className="editor-form editor-documents-form">
                  <h3>{activeDocumentId ? 'Upravit dokument' : 'Nový dokument'}</h3>
                  <div className="editor-form-grid">
                    <label>
                      Typ
                      <select
                        value={documentForm.kind}
                        onChange={(event) => updateDocumentField('kind', event.target.value as SptoDocumentKind)}
                      >
                        {DOCUMENT_KIND_ORDER.map((kind) => (
                          <option key={kind} value={kind}>
                            {DOCUMENT_KIND_LABELS[kind]}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Název
                      <input
                        value={documentForm.title}
                        onChange={(event) => updateDocumentField('title', event.target.value)}
                        placeholder="Např. Propozice Setonova závodu 2027"
                      />
                    </label>
                    {documentForm.kind === 'sbornicek' ? (
                      <label>
                        Rok vydání
                        <input
                          type="number"
                          value={documentForm.year}
                          onChange={(event) => updateDocumentField('year', event.target.value)}
                          placeholder="2019"
                        />
                      </label>
                    ) : (
                      <label>
                        Datum akce
                        <input
                          type="date"
                          value={documentForm.event_date}
                          onChange={(event) => updateDocumentField('event_date', event.target.value)}
                        />
                      </label>
                    )}
                  </div>

                  {documentForm.kind === 'sbornicek' ? null : (
                    <div className="editor-form-grid">
                      <label>
                        Akce v plánu (nepovinné)
                        <select
                          value={documentForm.schedule_event_id}
                          onChange={(event) => updateDocumentField('schedule_event_id', event.target.value)}
                        >
                          <option value="">Bez navázání na akci</option>
                          {scheduleEvents.map((event) => (
                            <option key={event.id} value={event.id}>
                              {event.name} · {formatDocumentDate(event.start_date)}
                            </option>
                          ))}
                        </select>
                        <small className="editor-field-hint">
                          Navázaný dokument se ukáže přímo u termínu v Plánu akcí.
                        </small>
                      </label>
                      <label>
                        Soutěž (nepovinné)
                        <select
                          value={documentForm.competition_slug}
                          onChange={(event) => updateDocumentField('competition_slug', event.target.value)}
                        >
                          <option value="">Bez navázání na soutěž</option>
                          {COMPETITIONS.map((competition) => (
                            <option key={competition.slug} value={competition.slug}>
                              {competition.name}
                            </option>
                          ))}
                        </select>
                        <small className="editor-field-hint">
                          Pravidla a další dokumenty se ukážou na stránce soutěže.
                        </small>
                      </label>
                    </div>
                  )}

                  <div
                    className={`editor-dropzone${documentDragActive ? ' is-active' : ''}`}
                    onDragOver={(event) => {
                      event.preventDefault();
                      setDocumentDragActive(true);
                    }}
                    onDragLeave={() => setDocumentDragActive(false)}
                    onDrop={handleDocumentDrop}
                  >
                    <p className="editor-dropzone-title">
                      {documentUploading ? 'Nahrávám…' : 'Přetáhni sem PDF (u sborníčku i obálku)'}
                    </p>
                    <label className="editor-dropzone-button">
                      Vybrat soubor
                      <input
                        type="file"
                        multiple
                        accept={CONTENT_DOCUMENT_ACCEPT}
                        onChange={handleDocumentFileInput}
                        disabled={documentUploading}
                      />
                    </label>
                    {documentForm.file_url ? (
                      <p className="editor-dropzone-file">
                        Nahráno: {documentForm.file_name || 'soubor'}
                        {documentForm.file_size ? ` (${formatFileSize(documentForm.file_size)})` : ''}
                        <button
                          type="button"
                          className="editor-dropzone-clear"
                          onClick={() => {
                            updateDocumentField('file_url', '');
                            updateDocumentField('file_path', '');
                            updateDocumentField('file_name', '');
                            updateDocumentField('file_size', null);
                          }}
                        >
                          odebrat
                        </button>
                      </p>
                    ) : null}
                    {documentForm.cover_url ? <p className="editor-dropzone-file">Obálka nahraná.</p> : null}
                  </div>

                  <div className="editor-links">
                    <div className="editor-links-head">
                      <span>Odkazy (přihlašovna, tabulka na odjezd, Disk…)</span>
                      <button type="button" className="editor-link-add" onClick={addDocumentLink}>
                        + Přidat odkaz
                      </button>
                    </div>
                    {documentForm.links.length === 0 ? (
                      <p className="editor-field-hint">Zatím žádný odkaz. Samotný soubor stačí.</p>
                    ) : (
                      documentForm.links.map((link, index) => (
                        <div className="editor-link-row" key={index}>
                          <input
                            value={link.label}
                            onChange={(event) => updateDocumentLink(index, 'label', event.target.value)}
                            placeholder="Název odkazu (např. Zápis na autobus)"
                            aria-label={`Název odkazu ${index + 1}`}
                          />
                          <input
                            value={link.url}
                            onChange={(event) => updateDocumentLink(index, 'url', event.target.value)}
                            placeholder="https://…"
                            aria-label={`Adresa odkazu ${index + 1}`}
                          />
                          <button
                            type="button"
                            className="editor-link-remove"
                            onClick={() => removeDocumentLink(index)}
                            aria-label={`Odebrat odkaz ${index + 1}`}
                          >
                            ×
                          </button>
                        </div>
                      ))
                    )}
                    <small className="editor-field-hint">
                      Bez názvu se ukáže doména. Odkazy se zobrazí v podrobnostech u akce.
                    </small>
                  </div>

                  <label>
                    Doplňující informace
                    <textarea
                      rows={6}
                      value={documentForm.description}
                      onChange={(event) => updateDocumentField('description', event.target.value)}
                      placeholder="Sem můžeš vlepit mail od pořadatele – sraz, startovné, uzávěrka přihlášek…"
                    />
                  </label>

                  <div className="editor-documents-flags">
                    <label className="editor-check">
                      <input
                        type="checkbox"
                        checked={documentForm.published}
                        onChange={(event) => updateDocumentField('published', event.target.checked)}
                      />
                      <span>Zobrazovat na webu</span>
                    </label>
                    <label className="editor-check">
                      <input
                        type="checkbox"
                        checked={documentForm.visibility === 'internal'}
                        onChange={(event) =>
                          updateDocumentField('visibility', event.target.checked ? 'internal' : 'public')
                        }
                      />
                      <span>Jen interní (odkaz se nezveřejní)</span>
                    </label>
                  </div>

                  {documentMessage ? <p className="homepage-alert">{documentMessage}</p> : null}

                  <div className="editor-buttons">
                    {activeDocumentId ? (
                      <button
                        type="button"
                        className="homepage-button homepage-button--ghost"
                        onClick={handleDocumentDelete}
                        disabled={documentSaving}
                      >
                        Smazat
                      </button>
                    ) : null}
                    <button
                      type="button"
                      className="homepage-button"
                      onClick={handleDocumentSave}
                      disabled={documentSaving || documentUploading}
                    >
                      {documentSaving ? 'Ukládám…' : 'Uložit'}
                    </button>
                  </div>
                </div>
              </div>
            </section>);
}
