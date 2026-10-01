import logo from '../../assets/znak_SPTO_transparent.png';
import {
type SptoDocumentKind
} from '../../data/documents';
import { Competition } from '../data/competitions';
import { CAROUSEL_IMAGE_SOURCES } from '../pages/carouselData';
import { slugify } from '../shared/format';

export const DOCUMENT_KIND_LABELS: Record<SptoDocumentKind, string> = {
  sbornicek: 'Sborníček',
  propozice: 'Propozice',
  pozvanka: 'Pozvánka s programem',
  pravidla: 'Pravidla',
  'zapis-snem': 'Zápis ze sněmu',
  'zapis-stab': 'Zápis ze štábu',
  prihlaska: 'Přihláška',
  ostatni: 'Dokument',
};

export const DOCUMENT_KIND_ORDER: SptoDocumentKind[] = [
  'propozice',
  'pravidla',
  'pozvanka',
  'prihlaska',
  'zapis-snem',
  'zapis-stab',
  'sbornicek',
  'ostatni',
];

export const CONTENT_DOCUMENTS_BUCKET = 'content-documents';

export const CONTENT_DOCUMENT_ACCEPT = 'application/pdf,image/jpeg,image/png,image/webp';

export type RuleFile = {
  filename: string;
  key: string;
  url: string;
};

export const RULE_FILES: RuleFile[] = Object.entries(
  import.meta.glob('../../assets/pravidla/*.pdf', {
    eager: true,
    import: 'default',
  }),
).map(([path, url]) => {
  const filename = path.split('/').pop() ?? '';
  const key = slugify(filename.replace(/\.pdf$/i, ''));
  return { filename, key, url: url as string };
});

export const ABOUT_PDF_FILES: RuleFile[] = Object.entries(
  import.meta.glob('../../assets/*.pdf', {
    eager: true,
    import: 'default',
  }),
).map(([path, url]) => {
  const filename = path.split('/').pop() ?? '';
  const key = slugify(filename.replace(/\.pdf$/i, ''));
  return { filename, key, url: url as string };
});

export const SPTO_POLICY_PDF = ABOUT_PDF_FILES.find((file) => file.key.includes('zasady-cinnosti-spto')) ?? null;

export const HOMEPAGE_CAROUSEL = (CAROUSEL_IMAGE_SOURCES.length ? CAROUSEL_IMAGE_SOURCES : [logo, logo, logo]).map(
  (src, index) => ({
    id: `carousel-${index + 1}`,
    src,
    alt: 'Fotka z akcí SPTO',
  }),
);

export function getCompetitionRules(competition: Competition): RuleFile[] {
  if (!competition.ruleMatchers.length) {
    return [];
  }
  return RULE_FILES.filter((rule) =>
    competition.ruleMatchers.some((matcher) => rule.key.includes(matcher)),
  ).sort((a, b) => a.filename.localeCompare(b.filename, 'cs'));
}
