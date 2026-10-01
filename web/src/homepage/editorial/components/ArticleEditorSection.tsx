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
import { CONTENT_ARTICLE_ALLOWED_IMAGE_TYPES,CONTENT_ARTICLE_FONT_SIZE_OPTIONS,CONTENT_ARTICLE_IMAGES_BUCKET,CONTENT_DOCUMENT_MAX_SIZE,EDITOR_SECTIONS,EMPTY_DOCUMENT_FORM,EMPTY_EDITOR_FORM,EMPTY_SCHEDULE_FORM,EditorArticle,EditorDocument,EditorDocumentFormState,EditorDocumentLink,EditorFormState,EditorScheduleEvent,EditorScheduleFormState,EditorSection,EditorSignedImageUpload,editorDocumentLinks,readEditorSection } from '../model';

export type ArticleEditorSectionProps = {
activeSection: "clanky" | "poradi-zl" | "body-zl" | "alba" | "dokumenty" | "terminy";
handleNew: () => void;
articles: EditorArticle[];
activeId: string | null;
selectArticle: (article: EditorArticle) => void;
form: EditorFormState;
updateField: (key: keyof EditorFormState, value: string) => void;
setForm: React.Dispatch<React.SetStateAction<EditorFormState>>;
runBodyCommand: (command: string, value?: string) => void;
handleInsertLink: () => void;
handleBodyFontSizeChange: (event: ChangeEvent<HTMLSelectElement>) => void;
bodyEditorRef: React.RefObject<HTMLDivElement | null>;
handleBodyInput: () => void;
handleArticleImageUpload: (event: ChangeEvent<HTMLInputElement>) => Promise<void>;
articleUploadSaving: boolean;
articleUploadMessage: string | null;
message: string | null;
handleDelete: () => void;
handleSave: () => void;
};

export function ArticleEditorSection({ activeSection, handleNew, articles, activeId, selectArticle, form, updateField, setForm, runBodyCommand, handleInsertLink, handleBodyFontSizeChange, bodyEditorRef, handleBodyInput, handleArticleImageUpload, articleUploadSaving, articleUploadMessage, message, handleDelete, handleSave }: ArticleEditorSectionProps) {
return (<section
              className="editor-section editor-grid"
              aria-label="Články"
              hidden={activeSection !== 'clanky'}
            >
              <div className="homepage-card">
                <div className="editor-list-header">
                  <h2>Články</h2>
                  <div className="editor-list-actions">
                    <button type="button" className="homepage-button homepage-button--ghost" onClick={handleNew}>
                      Nový
                    </button>
                  </div>
                </div>
                <ul className="editor-list">
                  {articles.length === 0 ? (
                    <li className="editor-empty">Zatím tu nejsou žádné články. Klikni na „Nový“ a založ první.</li>
                  ) : (
                    articles.map((article) => (
                      <li key={article.id}>
                        <button
                          type="button"
                          className={`editor-list-item${article.id === activeId ? ' is-active' : ''}`}
                          onClick={() => selectArticle(article)}
                        >
                          <span>{article.title}</span>
                          <small>{article.status === 'published' ? 'Publikováno' : 'Rozpracováno'}</small>
                        </button>
                      </li>
                    ))
                  )}
                </ul>
              </div>

              <div className="homepage-card editor-form">
                <h2>{activeId ? 'Upravit článek' : 'Nový článek'}</h2>
                <div className="editor-form-grid">
                  <label>
                    Titulek
                    <input
                      value={form.title}
                      onChange={(event) => updateField('title', event.target.value)}
                      placeholder="Název článku"
                    />
                  </label>
                  <label>
                    Slug
                    <input
                      value={form.slug}
                      onChange={(event) => updateField('slug', event.target.value)}
                      placeholder="napr. setonuv-zavod-2025"
                    />
                  </label>
                  <label>
                    Autor
                    <input
                      value={form.author}
                      onChange={(event) => updateField('author', event.target.value)}
                      placeholder="Jméno autora"
                    />
                  </label>
                  <label>
                    Stav
                    <select
                      value={form.status}
                      onChange={(event) =>
                        setForm((prev) => ({ ...prev, status: event.target.value as EditorFormState['status'] }))
                      }
                    >
                      <option value="draft">Rozpracováno</option>
                      <option value="published">Publikováno</option>
                    </select>
                  </label>
                </div>
                <label>
                  Perex
                  <textarea
                    value={form.excerpt}
                    onChange={(event) => updateField('excerpt', event.target.value)}
                    rows={3}
                  />
                </label>
                <label>
                  Text článku
                  <div className="editor-rich-toolbar" role="group" aria-label="Nástroje textu">
                    <button type="button" onClick={() => runBodyCommand('bold')} title="Tučné písmo">
                      <strong>B</strong>
                    </button>
                    <button type="button" onClick={() => runBodyCommand('italic')} title="Kurzíva">
                      <em>I</em>
                    </button>
                    <button type="button" onClick={() => runBodyCommand('underline')} title="Podtržené písmo">
                      <span style={{ textDecoration: 'underline' }}>U</span>
                    </button>
                    <button type="button" onClick={handleInsertLink} title="Vložit odkaz">
                      Odkaz
                    </button>
                    <select defaultValue="" onChange={handleBodyFontSizeChange} title="Velikost písma">
                      <option value="" disabled>
                        Velikost písma
                      </option>
                      {CONTENT_ARTICLE_FONT_SIZE_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div
                    ref={bodyEditorRef}
                    className="editor-rich-input"
                    contentEditable
                    suppressContentEditableWarning
                    role="textbox"
                    aria-label="Text článku"
                    aria-multiline="true"
                    data-placeholder="Napiš text článku…"
                    onInput={handleBodyInput}
                  />
                </label>
                <div className="editor-form-grid">
                  <label>
                    URL obrázku
                    <input
                      value={form.cover_image_url}
                      onChange={(event) => updateField('cover_image_url', event.target.value)}
                      placeholder="https://..."
                    />
                  </label>
                  <label>
                    Popisek obrázku
                    <input
                      value={form.cover_image_alt}
                      onChange={(event) => updateField('cover_image_alt', event.target.value)}
                      placeholder="Popisek pro obrázek"
                    />
                  </label>
                </div>
                <label className="editor-upload-field">
                  Fotky článku (můžeš vybrat více souborů)
                  <input
                    type="file"
                    multiple
                    accept={CONTENT_ARTICLE_ALLOWED_IMAGE_TYPES.join(',')}
                    onChange={handleArticleImageUpload}
                    disabled={articleUploadSaving}
                  />
                </label>
                {articleUploadMessage ? <p className="homepage-alert">{articleUploadMessage}</p> : null}
                <div className="editor-form-actions">
                  {message ? <p className="homepage-alert">{message}</p> : null}
                  <div className="editor-buttons">
                    {activeId ? (
                      <button type="button" className="homepage-button homepage-button--ghost" onClick={handleDelete}>
                        Smazat
                      </button>
                    ) : null}
                    <button type="button" className="homepage-button" onClick={handleSave}>
                      Uložit
                    </button>
                  </div>
                </div>
              </div>
            </section>);
}
