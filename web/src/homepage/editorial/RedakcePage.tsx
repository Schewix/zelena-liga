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
} from '../../data/documents';
import { supabase } from '../../supabaseClient';
import { CONTENT_DOCUMENTS_BUCKET,CONTENT_DOCUMENT_ACCEPT,DOCUMENT_KIND_LABELS,DOCUMENT_KIND_ORDER } from '../documents/model';
import { DriveAlbum } from '../gallery/model';
import { SiteShell } from '../layout/SiteShell';
import { DEFAULT_LEAGUE_SEASON_ID,LEAGUE_EVENTS,LEAGUE_TROOPS,LeagueData,LeagueEvent,LeagueEventEntry,LeagueSeason,addCompetitionRanks,buildLeagueRows,cloneLeagueEvents,cloneLeagueTroops,createDefaultLeagueData,formatLeagueScore,getActiveLeagueSeason,normalizeLeagueData } from '../league/model';
import { escapeHtml,formatDocumentDate,formatFileSize,normalizeEditorBodyHtml,slugify } from '../shared/format';
import { CONTENT_ARTICLE_ALLOWED_IMAGE_TYPES,CONTENT_ARTICLE_FONT_SIZE_OPTIONS,CONTENT_ARTICLE_IMAGES_BUCKET,CONTENT_DOCUMENT_MAX_SIZE,EDITOR_SECTIONS,EMPTY_DOCUMENT_FORM,EMPTY_EDITOR_FORM,EMPTY_SCHEDULE_FORM,EditorArticle,EditorDocument,EditorDocumentFormState,EditorDocumentLink,EditorFormState,EditorScheduleEvent,EditorScheduleFormState,EditorSection,EditorSignedImageUpload,editorDocumentLinks,readEditorSection } from './model';
import { ArticleEditorSection } from './components/ArticleEditorSection';
import { LeagueEditorSection } from './components/LeagueEditorSection';
import { DocumentsEditorSection } from './components/DocumentsEditorSection';
import { ScheduleEditorSection } from './components/ScheduleEditorSection';

export const LeaguePointsEditor = lazy(() => import('../../league/LeaguePointsEditor'));

export function RedakcePage() {
  const [activeSection, setActiveSection] = useState<EditorSection>(readEditorSection);
  const [leagueToolOpened, setLeagueToolOpened] = useState(() => readEditorSection() === 'body-zl');

  useEffect(() => {
    if (activeSection === 'body-zl') setLeagueToolOpened(true);
  }, [activeSection]);

  useEffect(() => {
    const handleHashChange = () => setActiveSection(readEditorSection());
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  const [session, setSession] = useState<'checking' | 'unauth' | 'auth'>('checking');
  const [password, setPassword] = useState('');
  const [articles, setArticles] = useState<EditorArticle[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [form, setForm] = useState<EditorFormState>(EMPTY_EDITOR_FORM);
  const [message, setMessage] = useState<string | null>(null);
  const [leagueData, setLeagueData] = useState<LeagueData>(createDefaultLeagueData());
  const [selectedLeagueSeasonId, setSelectedLeagueSeasonId] = useState(DEFAULT_LEAGUE_SEASON_ID);
  const [newLeagueSeasonName, setNewLeagueSeasonName] = useState('');
  const [newLeagueTroopName, setNewLeagueTroopName] = useState('');
  const [newLeagueEventLabel, setNewLeagueEventLabel] = useState('');
  const [newLeagueEventName, setNewLeagueEventName] = useState('');
  const [leagueMessage, setLeagueMessage] = useState<string | null>(null);
  const [leagueSaving, setLeagueSaving] = useState(false);
  const [albumTitleAlbums, setAlbumTitleAlbums] = useState<DriveAlbum[]>([]);
  const [albumTitleEdits, setAlbumTitleEdits] = useState<Record<string, string>>({});
  const [albumTitleOriginals, setAlbumTitleOriginals] = useState<Record<string, string>>({});
  const [albumTitleMessage, setAlbumTitleMessage] = useState<string | null>(null);
  const [albumTitleLoading, setAlbumTitleLoading] = useState(false);
  const [albumTitleSaving, setAlbumTitleSaving] = useState(false);
  const [articleUploadMessage, setArticleUploadMessage] = useState<string | null>(null);
  const [articleUploadSaving, setArticleUploadSaving] = useState(false);
  const [documents, setDocuments] = useState<EditorDocument[]>([]);
  const [activeDocumentId, setActiveDocumentId] = useState<string | null>(null);
  const [documentForm, setDocumentForm] = useState<EditorDocumentFormState>(EMPTY_DOCUMENT_FORM);
  const [documentFilter, setDocumentFilter] = useState<SptoDocumentKind | 'all'>('all');
  const [documentMessage, setDocumentMessage] = useState<string | null>(null);
  const [documentSaving, setDocumentSaving] = useState(false);
  const [documentUploading, setDocumentUploading] = useState(false);
  const [documentDragActive, setDocumentDragActive] = useState(false);
  const [scheduleEvents, setScheduleEvents] = useState<EditorScheduleEvent[]>([]);
  const [activeScheduleId, setActiveScheduleId] = useState<string | null>(null);
  const [scheduleForm, setScheduleForm] = useState<EditorScheduleFormState>(EMPTY_SCHEDULE_FORM);
  const [scheduleMessage, setScheduleMessage] = useState<string | null>(null);
  const [scheduleSaving, setScheduleSaving] = useState(false);
  const bodyEditorRef = useRef<HTMLDivElement | null>(null);

  const loadArticles = () =>
    fetch('/api/content/admin/articles', { credentials: 'include' })
      .then((response) => (response.ok ? response.json() : Promise.reject()))
      .then((data) => {
        setArticles(data.articles ?? []);
      })
      .catch(() => {
        setArticles([]);
      });

  const loadLeagueScores = () =>
    fetch('/api/content/admin/league', { credentials: 'include' })
      .then((response) => (response.ok ? response.json() : Promise.reject()))
      .then((data) => {
        const normalized = normalizeLeagueData(data);
        setLeagueData(normalized);
        setSelectedLeagueSeasonId((current) =>
          normalized.seasons.some((season) => season.id === current) ? current : normalized.activeSeasonId,
        );
      })
      .catch(() => {
        const fallback = createDefaultLeagueData();
        setLeagueData(fallback);
        setSelectedLeagueSeasonId(fallback.activeSeasonId);
      });

  const loadAlbumTitles = () => {
    setAlbumTitleLoading(true);
    setAlbumTitleMessage(null);
    return Promise.all([
      fetch('/api/gallery?nocache=1')
        .then((response) => (response.ok ? response.json() : Promise.reject()))
        .then((data) => (data.albums ?? []) as DriveAlbum[]),
      fetch('/api/content/admin/albums', { credentials: 'include' })
        .then((response) => (response.ok ? response.json() : Promise.reject()))
        .then((data) => (data.items ?? []) as Array<{ folder_id: string; title: string }>),
    ])
      .then(([albumsData, overrides]) => {
        const overrideMap: Record<string, string> = {};
        overrides.forEach((row) => {
          if (row.folder_id && typeof row.title === 'string') {
            overrideMap[row.folder_id] = row.title;
          }
        });
        const nextEdits: Record<string, string> = {};
        albumsData.forEach((album) => {
          const override = overrideMap[album.folderId];
          if (override) {
            nextEdits[album.folderId] = override;
          }
        });
        setAlbumTitleAlbums(albumsData);
        setAlbumTitleOriginals(overrideMap);
        setAlbumTitleEdits(nextEdits);
      })
      .catch(() => {
        setAlbumTitleAlbums([]);
        setAlbumTitleOriginals({});
        setAlbumTitleEdits({});
        setAlbumTitleMessage('Nepodařilo se načíst názvy alb.');
      })
      .finally(() => {
        setAlbumTitleLoading(false);
      });
  };

  const loadDocuments = () =>
    fetch('/api/content/admin/documents', { credentials: 'include' })
      .then((response) => (response.ok ? response.json() : Promise.reject()))
      .then((data) => {
        setDocuments((data.documents ?? []) as EditorDocument[]);
      })
      .catch(() => {
        setDocuments([]);
      });

  const loadScheduleEvents = () =>
    fetch('/api/content/admin/schedule', { credentials: 'include' })
      .then((response) => (response.ok ? response.json() : Promise.reject()))
      .then((data) => {
        setScheduleEvents((data.events ?? []) as EditorScheduleEvent[]);
      })
      .catch(() => {
        setScheduleEvents([]);
      });

  const syncBodyFromEditor = useCallback(() => {
    const html = bodyEditorRef.current?.innerHTML ?? '';
    const normalizedHtml = normalizeEditorBodyHtml(html);
    setForm((prev) => (prev.body === normalizedHtml ? prev : { ...prev, body: normalizedHtml }));
  }, []);

  const applyBodyToEditor = useCallback((value: string) => {
    const editor = bodyEditorRef.current;
    if (!editor) {
      return;
    }
    const next = value || '';
    if (/<[a-z][\s\S]*>/i.test(next)) {
      if (editor.innerHTML !== next) {
        editor.innerHTML = next;
      }
      return;
    }
    if (editor.textContent !== next) {
      editor.textContent = next;
    }
  }, []);

  const runBodyCommand = useCallback(
    (command: string, value?: string) => {
      const editor = bodyEditorRef.current;
      if (!editor) {
        return;
      }
      editor.focus();
      try {
        document.execCommand('styleWithCSS', false, 'true');
      } catch {
        // Some browsers can reject styleWithCSS; commands still work without it.
      }
      document.execCommand(command, false, value);
      syncBodyFromEditor();
    },
    [syncBodyFromEditor],
  );

  const handleBodyInput = () => {
    syncBodyFromEditor();
  };

  const handleInsertLink = () => {
    const editor = bodyEditorRef.current;
    if (!editor) {
      return;
    }
    const selectionText = window.getSelection()?.toString().trim() ?? '';
    if (!selectionText) {
      setArticleUploadMessage('Nejdřív označ text, na který chceš vložit odkaz.');
      return;
    }
    const rawUrl = window.prompt('Zadej URL odkazu (https://...)');
    if (!rawUrl) {
      return;
    }
    const normalizedUrl = rawUrl.trim();
    if (!/^https?:\/\//i.test(normalizedUrl)) {
      setArticleUploadMessage('Odkaz musí začínat na http:// nebo https://');
      return;
    }
    setArticleUploadMessage(null);
    runBodyCommand('createLink', normalizedUrl);
  };

  const handleBodyFontSizeChange = (event: ChangeEvent<HTMLSelectElement>) => {
    const value = event.target.value.trim();
    if (!value) {
      return;
    }
    runBodyCommand('fontSize', value);
    event.target.value = '';
  };

  const handleArticleImageUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    if (!files.length) {
      return;
    }
    setArticleUploadMessage(null);
    const invalid = files.find(
      (file) => !CONTENT_ARTICLE_ALLOWED_IMAGE_TYPES.includes(file.type as (typeof CONTENT_ARTICLE_ALLOWED_IMAGE_TYPES)[number]),
    );
    if (invalid) {
      setArticleUploadMessage(`Soubor ${invalid.name} není podporovaný obrázek.`);
      event.target.value = '';
      return;
    }

    setArticleUploadSaving(true);
    try {
      const response = await fetch('/api/content/admin/article-images', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          files: files.map((file) => ({
            name: file.name,
            type: file.type,
            size: file.size,
          })),
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
        uploads?: EditorSignedImageUpload[];
      };
      if (!response.ok) {
        throw new Error(payload.error || 'Nepodařilo se připravit upload obrázků.');
      }

      const uploads = Array.isArray(payload.uploads) ? payload.uploads : [];
      if (uploads.length !== files.length) {
        throw new Error('Server vrátil nekompletní seznam uploadů.');
      }

      const insertedBlocks: string[] = [];
      for (let index = 0; index < files.length; index += 1) {
        const file = files[index];
        const uploadMeta = uploads[index];
        const { error: uploadError } = await supabase.storage
          .from(CONTENT_ARTICLE_IMAGES_BUCKET)
          .uploadToSignedUrl(uploadMeta.path, uploadMeta.token, file, {
            contentType: file.type || uploadMeta.contentType || undefined,
            upsert: false,
          });
        if (uploadError) {
          throw uploadError;
        }
        const alt = escapeHtml(file.name.replace(/\.[^.]+$/, '').trim());
        insertedBlocks.push(`<figure><img src="${uploadMeta.publicUrl}" alt="${alt}" loading="lazy"></figure>`);
      }

      if (insertedBlocks.length > 0) {
        const htmlToInsert = insertedBlocks.join('<p><br></p>');
        if (bodyEditorRef.current) {
          bodyEditorRef.current.focus();
          document.execCommand('insertHTML', false, htmlToInsert);
          syncBodyFromEditor();
        } else {
          setForm((prev) => {
            const merged = [prev.body, htmlToInsert].filter(Boolean).join('\n');
            return { ...prev, body: normalizeEditorBodyHtml(merged) };
          });
        }

        if (!form.cover_image_url && uploads[0]?.publicUrl) {
          setForm((prev) => ({
            ...prev,
            cover_image_url: prev.cover_image_url || uploads[0].publicUrl,
            cover_image_alt: prev.cover_image_alt || files[0].name.replace(/\.[^.]+$/, '').trim(),
          }));
        }
      }

      setArticleUploadMessage(`Nahráno ${files.length} souborů.`);
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'Nepodařilo se nahrát obrázky.';
      setArticleUploadMessage(detail);
    } finally {
      setArticleUploadSaving(false);
      event.target.value = '';
    }
  };

  useEffect(() => {
    let active = true;
    fetch('/api/content/admin/session', { credentials: 'include' })
      .then((response) => {
        if (!active) return;
        setSession(response.ok ? 'auth' : 'unauth');
        if (response.ok) {
          loadArticles();
          loadLeagueScores();
          loadAlbumTitles();
          loadDocuments();
          loadScheduleEvents();
        }
      })
      .catch(() => {
        if (active) {
          setSession('unauth');
        }
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    applyBodyToEditor(form.body);
  }, [applyBodyToEditor, form.body]);

  const handleLogin = (event: FormEvent) => {
    event.preventDefault();
    setMessage(null);
    fetch('/api/content/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ password }),
    })
      .then((response) => {
        if (!response.ok) {
          throw new Error('Neplatné heslo.');
        }
        setSession('auth');
        setPassword('');
        loadLeagueScores();
        loadAlbumTitles();
        loadDocuments();
        loadScheduleEvents();
        return loadArticles();
      })
      .catch((error) => {
        setMessage(error instanceof Error ? error.message : 'Přihlášení se nezdařilo.');
      });
  };

  const handleLogout = () => {
    fetch('/api/content/admin/logout', {
      method: 'POST',
      credentials: 'include',
    }).finally(() => {
      setSession('unauth');
      setArticles([]);
      setActiveId(null);
      setForm(EMPTY_EDITOR_FORM);
      const fallback = createDefaultLeagueData();
      setLeagueData(fallback);
      setSelectedLeagueSeasonId(fallback.activeSeasonId);
      setNewLeagueSeasonName('');
      setNewLeagueTroopName('');
      setNewLeagueEventLabel('');
      setNewLeagueEventName('');
      setLeagueMessage(null);
      setAlbumTitleAlbums([]);
      setAlbumTitleEdits({});
      setAlbumTitleOriginals({});
      setAlbumTitleMessage(null);
      setArticleUploadMessage(null);
    });
  };

  const selectArticle = (article: EditorArticle) => {
    setActiveId(article.id);
    setForm({
      title: article.title ?? '',
      slug: article.slug ?? '',
      excerpt: article.excerpt ?? '',
      body: article.body ?? '',
      author: article.author ?? '',
      cover_image_url: article.cover_image_url ?? '',
      cover_image_alt: article.cover_image_alt ?? '',
      status: article.status ?? 'draft',
    });
    setMessage(null);
    setArticleUploadMessage(null);
  };

  const handleNew = () => {
    setActiveId(null);
    setForm(EMPTY_EDITOR_FORM);
    setMessage(null);
    setArticleUploadMessage(null);
  };

  const handleSave = () => {
    setMessage(null);
    const currentEditorBody = normalizeEditorBodyHtml(bodyEditorRef.current?.innerHTML ?? form.body);
    if (currentEditorBody !== form.body) {
      setForm((prev) => ({ ...prev, body: currentEditorBody }));
    }
    const payload = {
      title: form.title.trim(),
      slug: form.slug.trim() || slugify(form.title),
      excerpt: form.excerpt,
      body: currentEditorBody,
      author: form.author,
      cover_image_url: form.cover_image_url,
      cover_image_alt: form.cover_image_alt,
      status: form.status,
    };
    const method = activeId ? 'PUT' : 'POST';
    const url = activeId ? `/api/content/admin/articles/${activeId}` : '/api/content/admin/articles';
    fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(payload),
    })
      .then((response) => (response.ok ? response.json() : Promise.reject()))
      .then((data) => {
        setMessage('Uloženo.');
        if (data.article?.id) {
          setActiveId(data.article.id);
        }
        loadArticles();
      })
      .catch(() => {
        setMessage('Uložení se nezdařilo.');
      });
  };

  const handleDelete = () => {
    if (!activeId) return;
    if (!confirm('Opravdu smazat článek?')) {
      return;
    }
    fetch(`/api/content/admin/articles/${activeId}`, {
      method: 'DELETE',
      credentials: 'include',
    })
      .then(() => {
        setMessage('Článek smazán.');
        handleNew();
        loadArticles();
      })
      .catch(() => {
        setMessage('Smazání se nezdařilo.');
      });
  };

  const updateField = (key: keyof EditorFormState, value: string) => {
    setForm((prev) => {
      const next = { ...prev, [key]: value } as EditorFormState;
      if (key === 'title') {
        const nextSlug = slugify(value);
        if (!prev.slug || prev.slug === slugify(prev.title)) {
          next.slug = nextSlug;
        }
      }
      return next;
    });
  };

  const updateLeagueSeason = (seasonId: string, updater: (season: LeagueSeason) => LeagueSeason) => {
    setLeagueData((current) => ({
      ...current,
      seasons: current.seasons.map((season) => (season.id === seasonId ? updater(season) : season)),
    }));
  };

  const updateLeagueScore = (troopId: string, eventKey: LeagueEvent, rawValue: string) => {
    const normalized = rawValue.replace(',', '.').trim();
    const parsed = normalized.length > 0 ? Number(normalized) : null;
    const nextValue = parsed !== null && Number.isFinite(parsed) ? parsed : null;
    updateLeagueSeason(selectedLeagueSeasonId, (season) => ({
      ...season,
      scores: {
        ...season.scores,
        [troopId]: {
          ...(season.scores[troopId] ?? {}),
          [eventKey]: nextValue,
        },
      },
    }));
    setLeagueMessage(null);
  };

  const updateLeagueSeasonName = (value: string) => {
    updateLeagueSeason(selectedLeagueSeasonId, (season) => ({ ...season, name: value }));
    setLeagueMessage(null);
  };

  const updateLeagueSeasonActive = (isActive: boolean) => {
    setLeagueData((current) => ({
      activeSeasonId: isActive
        ? selectedLeagueSeasonId
        : current.activeSeasonId === selectedLeagueSeasonId
          ? current.seasons.find((season) => season.id !== selectedLeagueSeasonId && season.isActive)?.id ??
          current.seasons.find((season) => season.id !== selectedLeagueSeasonId)?.id ??
          selectedLeagueSeasonId
          : current.activeSeasonId,
      seasons: current.seasons.map((season) => ({
        ...season,
        isActive: season.id === selectedLeagueSeasonId ? isActive : isActive ? false : season.isActive,
      })),
    }));
    setLeagueMessage(null);
  };

  const handleCreateLeagueSeason = () => {
    const name = newLeagueSeasonName.trim();
    if (!name) {
      setLeagueMessage('Zadej název ročníku.');
      return;
    }
    const baseId = slugify(name) || `rocnik-${Date.now()}`;
    setLeagueData((current) => {
      let id = baseId;
      let suffix = 2;
      while (current.seasons.some((season) => season.id === id)) {
        id = `${baseId}-${suffix}`;
        suffix += 1;
      }
      const sourceSeason =
        current.seasons.find((season) => season.id === selectedLeagueSeasonId) ??
        getActiveLeagueSeason(current);
      const nextSeason: LeagueSeason = {
        id,
        name,
        isActive: false,
        troops: cloneLeagueTroops(sourceSeason.troops.length > 0 ? sourceSeason.troops : LEAGUE_TROOPS),
        events: cloneLeagueEvents(sourceSeason.events.length > 0 ? sourceSeason.events : LEAGUE_EVENTS),
        scores: {},
      };
      setSelectedLeagueSeasonId(id);
      return {
        ...current,
        seasons: [nextSeason, ...current.seasons],
      };
    });
    setNewLeagueSeasonName('');
    setLeagueMessage('Ročník je připravený. Nezapomeň ho uložit.');
  };

  const handleAddLeagueTroop = () => {
    const name = newLeagueTroopName.trim();
    if (!name) {
      setLeagueMessage('Zadej název oddílu.');
      return;
    }
    const baseId = slugify(name) || `oddil-${Date.now()}`;
    updateLeagueSeason(selectedLeagueSeasonId, (season) => {
      let id = baseId;
      let suffix = 2;
      while (season.troops.some((troop) => troop.id === id)) {
        id = `${baseId}-${suffix}`;
        suffix += 1;
      }
      return {
        ...season,
        troops: [...season.troops, { id, name, order: season.troops.length }],
      };
    });
    setNewLeagueTroopName('');
    setLeagueMessage(null);
  };

  const handleRemoveLeagueTroop = (troopId: string) => {
    updateLeagueSeason(selectedLeagueSeasonId, (season) => {
      const nextScores = { ...season.scores };
      delete nextScores[troopId];
      return {
        ...season,
        troops: season.troops
          .filter((troop) => troop.id !== troopId)
          .map((troop, index) => ({ ...troop, order: index })),
        scores: nextScores,
      };
    });
    setLeagueMessage(null);
  };

  const updateLeagueEvent = (eventKey: string, patch: Partial<Pick<LeagueEventEntry, 'label' | 'name'>>) => {
    updateLeagueSeason(selectedLeagueSeasonId, (season) => ({
      ...season,
      events: season.events.map((event) => (event.key === eventKey ? { ...event, ...patch } : event)),
    }));
    setLeagueMessage(null);
  };

  const handleAddLeagueEvent = () => {
    const name = newLeagueEventName.trim();
    const label = newLeagueEventLabel.trim() || name;
    if (!name && !label) {
      setLeagueMessage('Zadej název soutěže.');
      return;
    }
    const baseKey = slugify(name || label) || `soutez-${Date.now()}`;
    updateLeagueSeason(selectedLeagueSeasonId, (season) => {
      let key = baseKey;
      let suffix = 2;
      while (season.events.some((event) => event.key === key)) {
        key = `${baseKey}-${suffix}`;
        suffix += 1;
      }
      return {
        ...season,
        events: [...season.events, { key, label, name: name || label, order: season.events.length }],
      };
    });
    setNewLeagueEventLabel('');
    setNewLeagueEventName('');
    setLeagueMessage(null);
  };

  const handleRemoveLeagueEvent = (eventKey: string) => {
    updateLeagueSeason(selectedLeagueSeasonId, (season) => ({
      ...season,
      events: season.events
        .filter((event) => event.key !== eventKey)
        .map((event, index) => ({ ...event, order: index })),
      scores: Object.fromEntries(
        Object.entries(season.scores).map(([troopId, troopScores]) => {
          const nextScores = { ...(troopScores ?? {}) };
          delete nextScores[eventKey];
          return [troopId, nextScores];
        }),
      ),
    }));
    setLeagueMessage(null);
  };

  const updateAlbumTitle = (folderId: string, value: string) => {
    setAlbumTitleEdits((prev) => ({ ...prev, [folderId]: value }));
    setAlbumTitleMessage(null);
  };

  const handleLeagueSave = () => {
    setLeagueMessage(null);
    setLeagueSaving(true);
    const selectedSeason =
      leagueData.seasons.find((season) => season.id === selectedLeagueSeasonId) ??
      getActiveLeagueSeason(leagueData);
    const seasonName = selectedSeason.name.trim();
    if (!seasonName) {
      setLeagueSaving(false);
      setLeagueMessage('Název ročníku nesmí být prázdný.');
      return;
    }
    if (selectedSeason.troops.length === 0) {
      setLeagueSaving(false);
      setLeagueMessage('Ročník musí mít aspoň jeden oddíl.');
      return;
    }
    if (selectedSeason.events.length === 0) {
      setLeagueSaving(false);
      setLeagueMessage('Ročník musí mít aspoň jednu soutěž.');
      return;
    }
    const payloadScores = selectedSeason.troops.flatMap((troop) =>
      selectedSeason.events.map((event) => ({
        season_id: selectedSeason.id,
        troop_id: troop.id,
        event_key: event.key,
        points: selectedSeason.scores[troop.id]?.[event.key] ?? null,
      })),
    );
    fetch('/api/content/admin/league', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        season: {
          id: selectedSeason.id,
          name: seasonName,
          is_active: selectedSeason.isActive,
          starts_on: selectedSeason.startsOn ?? null,
          ends_on: selectedSeason.endsOn ?? null,
        },
        troops: selectedSeason.troops.map((troop, index) => ({
          troop_id: troop.id,
          troop_name: troop.name,
          order_index: troop.order ?? index,
        })),
        events: selectedSeason.events.map((event, index) => ({
          event_key: event.key,
          event_label: event.label.trim() || event.name.trim() || event.key,
          event_name: event.name.trim() || event.label.trim() || event.key,
          order_index: event.order ?? index,
        })),
        scores: payloadScores,
      }),
    })
      .then((response) => {
        if (!response.ok) {
          throw new Error('Uložení se nezdařilo.');
        }
        setLeagueMessage('Tabulka byla uložena.');
        return loadLeagueScores();
      })
      .catch((error) => {
        setLeagueMessage(error instanceof Error ? error.message : 'Uložení se nezdařilo.');
      })
      .finally(() => {
        setLeagueSaving(false);
      });
  };

  const handleAlbumTitleSave = () => {
    setAlbumTitleMessage(null);
    setAlbumTitleSaving(true);
    const baseTitles = new Map(
      albumTitleAlbums.map((album) => [album.folderId, album.baseTitle ?? album.title]),
    );
    const upserts: Array<{ folder_id: string; title: string }> = [];
    const deletes: string[] = [];

    for (const [folderId, baseTitle] of baseTitles.entries()) {
      const rawEdit = albumTitleEdits[folderId] ?? '';
      const normalized = rawEdit.trim();
      const originalOverride = albumTitleOriginals[folderId];
      if (!normalized || normalized === baseTitle) {
        if (originalOverride) {
          deletes.push(folderId);
        }
        continue;
      }
      if (originalOverride && originalOverride === normalized) {
        continue;
      }
      upserts.push({ folder_id: folderId, title: normalized });
    }

    if (upserts.length === 0 && deletes.length === 0) {
      setAlbumTitleSaving(false);
      setAlbumTitleMessage('Žádné změny k uložení.');
      return;
    }

    fetch('/api/content/admin/albums', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ items: upserts, remove: deletes }),
    })
      .then((response) => {
        if (!response.ok) {
          throw new Error('Uložení se nezdařilo.');
        }
        setAlbumTitleMessage('Názvy alb byly uloženy.');
        return loadAlbumTitles();
      })
      .catch((error) => {
        setAlbumTitleMessage(error instanceof Error ? error.message : 'Uložení se nezdařilo.');
      })
      .finally(() => {
        setAlbumTitleSaving(false);
      });
  };

  const updateDocumentField = <Key extends keyof EditorDocumentFormState>(
    key: Key,
    value: EditorDocumentFormState[Key],
  ) => {
    setDocumentForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleNewDocument = () => {
    setActiveDocumentId(null);
    setDocumentForm(EMPTY_DOCUMENT_FORM);
    setDocumentMessage(null);
  };

  const addDocumentLink = () => {
    setDocumentForm((prev) => ({ ...prev, links: [...prev.links, { label: '', url: '' }] }));
  };

  const updateDocumentLink = (index: number, key: keyof EditorDocumentLink, value: string) => {
    setDocumentForm((prev) => ({
      ...prev,
      links: prev.links.map((link, position) => (position === index ? { ...link, [key]: value } : link)),
    }));
  };

  const removeDocumentLink = (index: number) => {
    setDocumentForm((prev) => ({ ...prev, links: prev.links.filter((_, position) => position !== index) }));
  };

  const selectDocument = (doc: EditorDocument) => {
    setActiveDocumentId(doc.id);
    setDocumentMessage(null);
    setDocumentForm({
      kind: doc.kind,
      title: doc.title,
      description: doc.description ?? '',
      event_date: doc.event_date ?? '',
      year: doc.year ? String(doc.year) : '',
      file_url: doc.file_url ?? '',
      file_path: doc.file_path ?? '',
      file_name: doc.file_name ?? '',
      file_size: doc.file_size ?? null,
      links: editorDocumentLinks(doc),
      cover_url: doc.cover_url ?? '',
      visibility: doc.visibility,
      published: doc.published,
      schedule_event_id: doc.schedule_event_id ?? '',
      competition_slug: doc.competition_slug ?? '',
    });
  };

  const uploadDocumentFiles = async (files: File[]) => {
    if (files.length === 0) {
      return;
    }
    // Obálka sborníčku je obrázek, samotný dokument PDF — podle typu je rozdělíme do správných polí.
    const tooLarge = files.find((file) => file.size > CONTENT_DOCUMENT_MAX_SIZE);
    if (tooLarge) {
      setDocumentMessage(`Soubor ${tooLarge.name} je větší než 50 MB.`);
      return;
    }

    setDocumentUploading(true);
    setDocumentMessage(null);
    try {
      const response = await fetch('/api/content/admin/document-upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          files: files.map((file) => ({ name: file.name, type: file.type, size: file.size })),
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
        uploads?: EditorSignedImageUpload[];
      };
      if (!response.ok) {
        throw new Error(payload.error || 'Nepodařilo se připravit upload.');
      }
      const uploads = Array.isArray(payload.uploads) ? payload.uploads : [];
      if (uploads.length !== files.length) {
        throw new Error('Server vrátil nekompletní seznam uploadů.');
      }

      for (let index = 0; index < files.length; index += 1) {
        const file = files[index];
        const uploadMeta = uploads[index];
        const { error: uploadError } = await supabase.storage
          .from(CONTENT_DOCUMENTS_BUCKET)
          .uploadToSignedUrl(uploadMeta.path, uploadMeta.token, file, {
            contentType: file.type || uploadMeta.contentType || undefined,
            upsert: false,
          });
        if (uploadError) {
          throw uploadError;
        }

        if (file.type.startsWith('image/')) {
          updateDocumentField('cover_url', uploadMeta.publicUrl);
        } else {
          setDocumentForm((prev) => ({
            ...prev,
            file_url: uploadMeta.publicUrl,
            file_path: uploadMeta.path,
            file_name: file.name,
            file_size: file.size,
            title: prev.title || file.name.replace(/\.[^.]+$/, '').trim(),
          }));
        }
      }

      setDocumentMessage(`Nahráno ${files.length} ${files.length === 1 ? 'soubor' : 'souborů'}. Nezapomeň uložit.`);
    } catch (error) {
      setDocumentMessage(error instanceof Error ? error.message : 'Nahrání se nezdařilo.');
    } finally {
      setDocumentUploading(false);
    }
  };

  const handleDocumentFileInput = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    await uploadDocumentFiles(files);
    event.target.value = '';
  };

  const handleDocumentDrop = async (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDocumentDragActive(false);
    await uploadDocumentFiles(Array.from(event.dataTransfer.files ?? []));
  };

  const handleDocumentSave = () => {
    const title = documentForm.title.trim();
    if (!title) {
      setDocumentMessage('Vyplň název dokumentu.');
      return;
    }
    const links = documentForm.links
      .map((link) => ({ label: link.label.trim(), url: link.url.trim() }))
      .filter((link) => link.url.length > 0);
    if (links.some((link) => !/^https?:\/\/\S/i.test(link.url))) {
      setDocumentMessage('Odkaz musí začínat na http:// nebo https://.');
      return;
    }
    if (!documentForm.file_url.trim() && links.length === 0) {
      setDocumentMessage('Nahraj soubor nebo vyplň aspoň jeden odkaz.');
      return;
    }

    const parsedYear = Number.parseInt(documentForm.year, 10);
    const body = {
      kind: documentForm.kind,
      title,
      description: documentForm.description,
      event_date: documentForm.event_date,
      year: Number.isFinite(parsedYear) ? parsedYear : null,
      file_url: documentForm.file_url,
      file_path: documentForm.file_path,
      file_name: documentForm.file_name,
      file_size: documentForm.file_size,
      links,
      cover_url: documentForm.cover_url,
      visibility: documentForm.visibility,
      published: documentForm.published,
      schedule_event_id: documentForm.schedule_event_id,
      competition_slug: documentForm.competition_slug,
    };

    setDocumentSaving(true);
    setDocumentMessage(null);
    fetch(
      activeDocumentId ? `/api/content/admin/documents/${activeDocumentId}` : '/api/content/admin/documents',
      {
        method: activeDocumentId ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
      },
    )
      .then(async (response) => {
        const payload = (await response.json().catch(() => ({}))) as { error?: string; document?: EditorDocument };
        if (!response.ok) {
          throw new Error(payload.error || 'Uložení se nezdařilo.');
        }
        setDocumentMessage('Dokument byl uložen.');
        if (payload.document) {
          setActiveDocumentId(payload.document.id);
        }
        return loadDocuments();
      })
      .catch((error) => {
        setDocumentMessage(error instanceof Error ? error.message : 'Uložení se nezdařilo.');
      })
      .finally(() => {
        setDocumentSaving(false);
      });
  };

  const handleDocumentDelete = () => {
    if (!activeDocumentId) {
      return;
    }
    if (!window.confirm('Opravdu smazat tento dokument? Smaže se i nahraný soubor.')) {
      return;
    }
    setDocumentSaving(true);
    fetch(`/api/content/admin/documents/${activeDocumentId}`, {
      method: 'DELETE',
      credentials: 'include',
    })
      .then((response) => {
        if (!response.ok) {
          throw new Error('Smazání se nezdařilo.');
        }
        setActiveDocumentId(null);
        setDocumentForm(EMPTY_DOCUMENT_FORM);
        setDocumentMessage('Dokument byl smazán.');
        return loadDocuments();
      })
      .catch((error) => {
        setDocumentMessage(error instanceof Error ? error.message : 'Smazání se nezdařilo.');
      })
      .finally(() => {
        setDocumentSaving(false);
      });
  };

  const visibleDocuments =
    documentFilter === 'all' ? documents : documents.filter((doc) => doc.kind === documentFilter);

  const updateScheduleField = <Key extends keyof EditorScheduleFormState>(
    key: Key,
    value: EditorScheduleFormState[Key],
  ) => {
    setScheduleForm((prev) => ({ ...prev, [key]: value }));
  };

  const resetScheduleForm = () => {
    setActiveScheduleId(null);
    setScheduleForm(EMPTY_SCHEDULE_FORM);
    setScheduleMessage(null);
  };

  const selectScheduleEvent = (entry: EditorScheduleEvent) => {
    setActiveScheduleId(entry.id);
    setScheduleMessage(null);
    setScheduleForm({
      name: entry.name,
      start_date: entry.start_date,
      end_date: entry.end_date ?? '',
      kind: entry.kind,
      note: entry.note ?? '',
      href: entry.href ?? '',
      published: entry.published,
    });
  };

  const handleScheduleSave = () => {
    const name = scheduleForm.name.trim();
    if (!name) {
      setScheduleMessage('Vyplň název akce.');
      return;
    }
    if (!scheduleForm.start_date) {
      setScheduleMessage('Vyplň datum akce.');
      return;
    }
    if (scheduleForm.end_date && scheduleForm.end_date < scheduleForm.start_date) {
      setScheduleMessage('Konec akce nemůže být dřív než začátek.');
      return;
    }

    const body = {
      name,
      start_date: scheduleForm.start_date,
      end_date: scheduleForm.end_date,
      kind: scheduleForm.kind,
      note: scheduleForm.note,
      href: scheduleForm.href,
      published: scheduleForm.published,
    };

    setScheduleSaving(true);
    setScheduleMessage(null);
    fetch(
      activeScheduleId ? `/api/content/admin/schedule/${activeScheduleId}` : '/api/content/admin/schedule',
      {
        method: activeScheduleId ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
      },
    )
      .then(async (response) => {
        const payload = (await response.json().catch(() => ({}))) as { error?: string; event?: EditorScheduleEvent };
        if (!response.ok) {
          throw new Error(payload.error || 'Uložení se nezdařilo.');
        }
        setScheduleMessage('Termín byl uložen.');
        if (payload.event) {
          setActiveScheduleId(payload.event.id);
        }
        return loadScheduleEvents();
      })
      .catch((error) => {
        setScheduleMessage(error instanceof Error ? error.message : 'Uložení se nezdařilo.');
      })
      .finally(() => {
        setScheduleSaving(false);
      });
  };

  const handleScheduleDelete = () => {
    if (!activeScheduleId) {
      return;
    }
    if (!window.confirm('Opravdu smazat tento termín?')) {
      return;
    }
    setScheduleSaving(true);
    fetch(`/api/content/admin/schedule/${activeScheduleId}`, {
      method: 'DELETE',
      credentials: 'include',
    })
      .then((response) => {
        if (!response.ok) {
          throw new Error('Smazání se nezdařilo.');
        }
        setActiveScheduleId(null);
        setScheduleForm(EMPTY_SCHEDULE_FORM);
        setScheduleMessage('Termín byl smazán.');
        return loadScheduleEvents();
      })
      .catch((error) => {
        setScheduleMessage(error instanceof Error ? error.message : 'Smazání se nezdařilo.');
      })
      .finally(() => {
        setScheduleSaving(false);
      });
  };

  const selectedLeagueSeason =
    leagueData.seasons.find((season) => season.id === selectedLeagueSeasonId) ??
    getActiveLeagueSeason(leagueData);
  const leagueGridTemplate = `minmax(220px, 1.4fr) repeat(${selectedLeagueSeason.events.length}, minmax(90px, 0.8fr)) minmax(90px, 0.8fr)`;
  const leagueRows = addCompetitionRanks(
    buildLeagueRows(selectedLeagueSeason.scores, selectedLeagueSeason.troops, selectedLeagueSeason.events),
  );
  const albumTitleGroups = useMemo(() => {
    const groups = new Map<string, DriveAlbum[]>();
    albumTitleAlbums.forEach((album) => {
      const yearKey = album.year || 'Ostatní';
      if (!groups.has(yearKey)) {
        groups.set(yearKey, []);
      }
      groups.get(yearKey)!.push(album);
    });
    groups.forEach((items) => items.sort((a, b) => a.title.localeCompare(b.title, 'cs')));
    return Array.from(groups.entries()).sort((a, b) => b[0].localeCompare(a[0], 'cs'));
  }, [albumTitleAlbums]);

  return (
    <SiteShell>
      <main className="homepage-main">
        <h1>Redakce</h1>
        <p className="homepage-lead">Správa obsahu a Zelené ligy pro zelenaliga.cz.</p>

        {session === 'checking' ? (
          <div className="homepage-card">Načítám…</div>
        ) : session === 'unauth' ? (
          <div className="homepage-card editor-login">
            <h2>Přihlášení</h2>
            <form onSubmit={handleLogin}>
              <label htmlFor="editor-password">Heslo</label>
              <input
                id="editor-password"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Zadej heslo"
                required
              />
              <button type="submit" className="homepage-button">
                Přihlásit
              </button>
            </form>
            {message ? <p className="homepage-alert">{message}</p> : null}
          </div>
        ) : (
          <div className="editor-workspace">
            <aside className="editor-sidebar">
              <nav className="editor-navigation" aria-label="Sekce redakce">
                {EDITOR_SECTIONS.map((section) => (
                  <a
                    key={section.id}
                    href={`#${section.id}`}
                    className={`editor-navigation-link${activeSection === section.id ? ' is-active' : ''}`}
                    aria-current={activeSection === section.id ? 'page' : undefined}
                  >
                    {section.label}
                  </a>
                ))}
              </nav>
              <button type="button" className="homepage-button homepage-button--ghost" onClick={handleLogout}>
                Odhlásit
              </button>
            </aside>
            <section className="editor-section" aria-label="Výpočet bodů ZL" hidden={activeSection !== 'body-zl'}>
              {leagueToolOpened && <Suspense fallback={<p role="status">Načítám výpočet bodů ZL…</p>}><LeaguePointsEditor /></Suspense>}
            </section>
            {/* Keep editors mounted so navigation preserves drafts, uploads and rich text. */}
            <ArticleEditorSection
activeSection={activeSection}
handleNew={handleNew}
articles={articles}
activeId={activeId}
selectArticle={selectArticle}
form={form}
updateField={updateField}
setForm={setForm}
runBodyCommand={runBodyCommand}
handleInsertLink={handleInsertLink}
handleBodyFontSizeChange={handleBodyFontSizeChange}
bodyEditorRef={bodyEditorRef}
handleBodyInput={handleBodyInput}
handleArticleImageUpload={handleArticleImageUpload}
articleUploadSaving={articleUploadSaving}
articleUploadMessage={articleUploadMessage}
message={message}
handleDelete={handleDelete}
handleSave={handleSave}
/>
            <LeagueEditorSection
activeSection={activeSection}
handleLeagueSave={handleLeagueSave}
leagueSaving={leagueSaving}
leagueMessage={leagueMessage}
leagueData={leagueData}
selectedLeagueSeason={selectedLeagueSeason}
setSelectedLeagueSeasonId={setSelectedLeagueSeasonId}
setLeagueMessage={setLeagueMessage}
updateLeagueSeasonName={updateLeagueSeasonName}
updateLeagueSeasonActive={updateLeagueSeasonActive}
newLeagueSeasonName={newLeagueSeasonName}
setNewLeagueSeasonName={setNewLeagueSeasonName}
handleCreateLeagueSeason={handleCreateLeagueSeason}
handleRemoveLeagueTroop={handleRemoveLeagueTroop}
newLeagueTroopName={newLeagueTroopName}
setNewLeagueTroopName={setNewLeagueTroopName}
handleAddLeagueTroop={handleAddLeagueTroop}
updateLeagueEvent={updateLeagueEvent}
handleRemoveLeagueEvent={handleRemoveLeagueEvent}
newLeagueEventLabel={newLeagueEventLabel}
setNewLeagueEventLabel={setNewLeagueEventLabel}
newLeagueEventName={newLeagueEventName}
setNewLeagueEventName={setNewLeagueEventName}
handleAddLeagueEvent={handleAddLeagueEvent}
leagueGridTemplate={leagueGridTemplate}
leagueRows={leagueRows}
updateLeagueScore={updateLeagueScore}
/>
            <section
              className="editor-section homepage-card editor-albums"
              aria-label="Názvy alb"
              hidden={activeSection !== 'alba'}
            >
              <div className="editor-albums-header">
                <div>
                  <h2>Názvy alb</h2>
                  <p>Uprav zobrazované názvy alb ve fotogalerii. Původní názvy na Drive zůstanou zachované.</p>
                </div>
                <div className="editor-albums-actions">
                  <button
                    type="button"
                    className="homepage-button homepage-button--ghost"
                    onClick={loadAlbumTitles}
                    disabled={albumTitleLoading || albumTitleSaving}
                  >
                    Obnovit
                  </button>
                  <button
                    type="button"
                    className="homepage-button"
                    onClick={handleAlbumTitleSave}
                    disabled={albumTitleLoading || albumTitleSaving}
                  >
                    {albumTitleSaving ? 'Ukládám…' : 'Uložit názvy'}
                  </button>
                </div>
              </div>
              {albumTitleMessage ? <p className="homepage-alert">{albumTitleMessage}</p> : null}
              {albumTitleLoading ? <div className="editor-albums-loading">Načítám alba…</div> : null}
              {!albumTitleLoading && albumTitleAlbums.length === 0 ? (
                <div className="editor-albums-loading">Žádná alba k úpravě.</div>
              ) : null}
              {!albumTitleLoading && albumTitleAlbums.length > 0 ? (
                <div className="editor-albums-groups">
                  {albumTitleGroups.map(([year, items]) => (
                    <section key={year} className="editor-albums-year">
                      <h3>{year}</h3>
                      <div className="editor-albums-list">
                        {items.map((album) => {
                          const baseTitle = album.baseTitle ?? album.title;
                          const editValue = albumTitleEdits[album.folderId] ?? '';
                          const normalizedEdit = editValue.trim();
                          const displayTitle = normalizedEdit || baseTitle;
                          const isOverride = normalizedEdit.length > 0 && normalizedEdit !== baseTitle;
                          return (
                            <div key={album.folderId} className="editor-album-row">
                              <div className="editor-album-info">
                                <strong>{displayTitle}</strong>
                                <span className="editor-album-meta">
                                  {isOverride ? `Původní název: ${baseTitle}` : `Původní název: ${baseTitle}`}
                                </span>
                              </div>
                              <input
                                type="text"
                                value={editValue}
                                onChange={(event) => updateAlbumTitle(album.folderId, event.target.value)}
                                placeholder="Nechat původní"
                                aria-label={`Zobrazovaný název alba ${baseTitle}`}
                              />
                            </div>
                          );
                        })}
                      </div>
                    </section>
                  ))}
                </div>
              ) : null}
            </section>
            <DocumentsEditorSection
activeSection={activeSection}
handleNewDocument={handleNewDocument}
loadDocuments={loadDocuments}
documentFilter={documentFilter}
setDocumentFilter={setDocumentFilter}
visibleDocuments={visibleDocuments}
activeDocumentId={activeDocumentId}
selectDocument={selectDocument}
scheduleEvents={scheduleEvents}
documentForm={documentForm}
updateDocumentField={updateDocumentField}
documentDragActive={documentDragActive}
setDocumentDragActive={setDocumentDragActive}
handleDocumentDrop={handleDocumentDrop}
documentUploading={documentUploading}
handleDocumentFileInput={handleDocumentFileInput}
addDocumentLink={addDocumentLink}
updateDocumentLink={updateDocumentLink}
removeDocumentLink={removeDocumentLink}
documentMessage={documentMessage}
handleDocumentDelete={handleDocumentDelete}
documentSaving={documentSaving}
handleDocumentSave={handleDocumentSave}
/>
            <ScheduleEditorSection
activeSection={activeSection}
resetScheduleForm={resetScheduleForm}
loadScheduleEvents={loadScheduleEvents}
scheduleEvents={scheduleEvents}
activeScheduleId={activeScheduleId}
selectScheduleEvent={selectScheduleEvent}
scheduleForm={scheduleForm}
updateScheduleField={updateScheduleField}
scheduleMessage={scheduleMessage}
handleScheduleDelete={handleScheduleDelete}
scheduleSaving={scheduleSaving}
handleScheduleSave={handleScheduleSave}
/>
          </div>
        )}
      </main>
    </SiteShell>
  );
}
