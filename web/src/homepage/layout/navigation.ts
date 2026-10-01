import { COMPETITIONS } from '../data/competitions';

export const NAV_ITEMS = [
  { id: 'domu', label: 'Domů', href: '/' },
  { id: 'plan-akci', label: 'Plán akcí', href: '/plan-akci' },
  { id: 'aktualni-poradi', label: 'Aktuální pořadí', href: '/aktualni-poradi' },
  { id: 'clanky', label: 'Články a novinky', href: '/clanky' },
  { id: 'fotogalerie', label: 'Fotogalerie', href: '/fotogalerie' },
  { id: 'souteze', label: 'Soutěže', href: '/souteze' },
  { id: 'oddily', label: 'Oddíly SPTO', href: '/oddily' },
  { id: 'o-spto', label: 'O SPTO', href: '/o-spto' },
  { id: 'tipy', label: 'Tipy', href: '/tipy' },
  { id: 'sponzori', label: 'Sponzoři', href: '/sponzori' },
  { id: 'kontakty', label: 'Kontakty', href: '/kontakty' },
];

export function resolveActiveNav(pathname: string) {
  const normalized = pathname.replace(/\/$/, '') || '/';
  const segments = normalized.split('/').filter(Boolean);
  if (segments.length === 0) {
    return 'domu';
  }
  const slug = segments[0];
  if (slug === 'souteze' || slug === 'aplikace' || COMPETITIONS.some((event) => event.slug === slug)) {
    return 'souteze';
  }
  if (slug === 'aktualni-poradi' || slug === 'zelena-liga') {
    return 'aktualni-poradi';
  }
  if (slug === 'plan-akci') {
    return 'plan-akci';
  }
  if (slug === 'oddily') {
    return 'oddily';
  }
  if (slug === 'fotogalerie') {
    return 'fotogalerie';
  }
  if (slug === 'clanky') {
    return 'clanky';
  }
  if (slug === 'o-spto' || slug === 'historie') {
    return 'o-spto';
  }
  if (slug === 'kontakty') {
    return 'kontakty';
  }
  if (slug === 'tipy') {
    return 'tipy';
  }
  if (slug === 'sponzori') {
    return 'sponzori';
  }
  return undefined;
}
