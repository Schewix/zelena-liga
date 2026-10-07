import { handleAdminAfterparty } from '../api-lib/content/afterparty.js';
import { handleClientError } from '../api-lib/content/clientError.js';
import { handleCommunityAuth } from '../api-lib/content/communityAuth.js';
import { handleCommunityDelete,handleCommunitySubmit,handlePublicCommunity } from '../api-lib/content/community.js';
import { handleAdminAlbumTitles } from '../api-lib/content/albumTitles.js';
import { handleAdminArticle,handleAdminArticles } from '../api-lib/content/articles/admin.js';
import { handleAdminArticleImages } from '../api-lib/content/articles/images.js';
import { handleAdminImport } from '../api-lib/content/articles/import.js';
import { handlePublicDetail,handlePublicList } from '../api-lib/content/articles/public.js';
import { handleAdminDocument,handleAdminDocuments,handlePublicDocuments } from '../api-lib/content/documents/handlers.js';
import { handleAdminDocumentUpload } from '../api-lib/content/documents/upload.js';
import { handleAdminLeague,handlePublicLeague } from '../api-lib/content/league.js';
import { handleAdminLeagueHistory,handlePublicLeagueHistory } from '../api-lib/content/leagueHistory.js';
import { handleAdminScheduleEvent,handleAdminScheduleEvents,handlePublicSchedule } from '../api-lib/content/schedule.js';
import { handleAdminLogin,handleAdminLogout,handleAdminSession } from '../api-lib/content/session.js';
import { handlePublicSeoPage } from '../api-lib/content/seoHandler.js';
import { handlePublicSitemap } from '../api-lib/content/sitemap.js';
import { isCronRequest, pingHeartbeat } from '../api-lib/heartbeat.js';
import { withLogging } from '../api-lib/logger.js';

async function handler(req: any, res: any) {
  const rawPath = req.query?.path;
  let segments = Array.isArray(rawPath)
    ? rawPath
    : typeof rawPath === 'string'
      ? rawPath.split('/').filter(Boolean)
      : [];

  if (segments.length === 0 && typeof req.url === 'string') {
    try {
      const url = new URL(req.url, 'http://localhost');
      const prefix = '/api/content';
      const index = url.pathname.indexOf(prefix);
      if (index >= 0) {
        const rest = url.pathname.slice(index + prefix.length).replace(/^\/+/, '');
        segments = rest.split('/').filter(Boolean);
      }
    } catch {
      // ignore malformed URL and fall back to empty segments
    }
  }

  if (segments.length === 0) {
    res.status(404).json({ error: 'Not found' });
    return;
  }

  if (segments[0] === 'articles') {
    if (segments.length === 1) {
      await handlePublicList(req, res);
      return;
    }
    if (segments.length >= 2) {
      let articleSlug = segments[1];
      try {
        articleSlug = decodeURIComponent(articleSlug);
      } catch {
        // Keep the raw slug when the URL contains malformed escape sequences.
      }
      await handlePublicDetail(req, res, articleSlug);
      return;
    }
  }

  if (segments[0] === 'client-error') {
    await handleClientError(req, res);
    return;
  }

  if (segments[0] === 'seo') {
    await handlePublicSeoPage(req, res);
    return;
  }

  if (segments[0] === 'sitemap') {
    await handlePublicSitemap(req, res);
    return;
  }

  if (segments[0] === 'league') {
    await handlePublicLeague(req, res);
    return;
  }

  if (segments[0] === 'league-history') {
    await handlePublicLeagueHistory(req, res);
    return;
  }

  if (segments[0] === 'documents') {
    await handlePublicDocuments(req, res);
    return;
  }

  if (segments[0] === 'community') {
    if (segments[1] === 'auth' && segments[2]) {
      await handleCommunityAuth(req, res, segments[2]);
      return;
    }
    if (segments[1] === 'lodging' || segments[1] === 'loans') {
      const kind = segments[1] === 'lodging' ? 'lodging' : 'loan';
      if (segments[2]) {
        if (req.method === 'PUT') {
          await handleCommunitySubmit(req, res, kind, segments[2]);
        } else {
          await handleCommunityDelete(req, res, kind, segments[2]);
        }
      } else {
        await handleCommunitySubmit(req, res, kind);
      }
      return;
    }
    await handlePublicCommunity(req, res);
    return;
  }

  if (segments[0] === 'schedule') {
    await handlePublicSchedule(req, res);
    return;
  }

  if (segments[0] === 'admin') {
    const action = segments[1] ?? '';
    if (action === 'session') {
      await handleAdminSession(req, res);
      return;
    }
    if (action === 'login') {
      await handleAdminLogin(req, res);
      return;
    }
    if (action === 'logout') {
      await handleAdminLogout(req, res);
      return;
    }
    if (action === 'articles') {
      if (segments.length === 2) {
        await handleAdminArticles(req, res);
        return;
      }
      if (segments.length >= 3) {
        await handleAdminArticle(req, res, segments[2]);
        return;
      }
    }
    if (action === 'article-images') {
      await handleAdminArticleImages(req, res);
      return;
    }
    if (action === 'documents') {
      if (segments.length === 2) {
        await handleAdminDocuments(req, res);
        return;
      }
      if (segments.length >= 3) {
        await handleAdminDocument(req, res, segments[2]);
        return;
      }
    }
    if (action === 'document-upload') {
      await handleAdminDocumentUpload(req, res);
      return;
    }
    if (action === 'schedule') {
      if (segments.length === 2) {
        await handleAdminScheduleEvents(req, res);
        return;
      }
      if (segments.length >= 3) {
        await handleAdminScheduleEvent(req, res, segments[2]);
        return;
      }
    }
    if (action === 'import') {
      await handleAdminImport(req, res);
      if (isCronRequest(req)) await pingHeartbeat();
      return;
    }
    if (action === 'league') {
      await handleAdminLeague(req, res);
      return;
    }
    if (action === 'league-history') {
      await handleAdminLeagueHistory(req, res);
      return;
    }
    if (action === 'afterparty') {
      await handleAdminAfterparty(req, res, segments.slice(2));
      return;
    }
    if (action === 'albums') {
      await handleAdminAlbumTitles(req, res);
      return;
    }
  }

  res.status(404).json({ error: 'Not found' });
}

export default withLogging('/api/content', handler);
