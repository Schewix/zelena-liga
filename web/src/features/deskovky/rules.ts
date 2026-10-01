import { slugify } from './admin/helpers';

export type RuleAsset = {
  filename: string;
  key: string;
  url: string;
};

export const RULE_ASSETS: RuleAsset[] = Object.entries(
  import.meta.glob('../../assets/pravidla/*.pdf', { eager: true, import: 'default' }),
).map(([path, url]) => {
  const filename = path.split('/').pop() ?? '';
  return {
    filename,
    key: slugify(filename.replace(/\.pdf$/i, '')),
    url: url as string,
  };
});

export const BOARD_RULES_TOURNAMENT =
  RULE_ASSETS.find((asset) => asset.key.includes('deskove-hry-2023-pravidla-turnaje'))?.url ?? null;

export const BOARD_RULES_SCORING =
  RULE_ASSETS.find((asset) => asset.key.includes('deskove-hry-2023-hodnoceni-turnaje'))?.url ?? null;
