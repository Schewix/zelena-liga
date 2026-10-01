import {
useEffect,
useState
} from 'react';
import { fetchContentArticle } from '../../data/content';
import { InfoPage } from '../pages/InfoPage';
import { ArticlePage } from './ArticlePage';
import { Article,mapContentArticle } from './model';

export function ArticlePageLoader({ slug }: { slug: string }) {
  const [article, setArticle] = useState<Article | null>(null);

  useEffect(() => {
    let active = true;
    setArticle(null);
    fetchContentArticle(slug)
      .then((data) => {
        if (!active || !data) {
          return;
        }
        setArticle(mapContentArticle(data));
      })
      .catch(() => {
        // The loading state stays visible and a reload retries the request.
      });
    return () => {
      active = false;
    };
  }, [slug]);

  if (!article) {
    return (
      <InfoPage
        title="Načítám článek"
        lead="Obsah článku se právě připravuje."
        backHref="/clanky"
      />
    );
  }

  return <ArticlePage article={article} />;
}
