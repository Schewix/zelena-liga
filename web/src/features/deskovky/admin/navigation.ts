import { AdminSectionKey } from '../pageTypes';

export const ADMIN_SECTION_ITEMS: ReadonlyArray<{ key: AdminSectionKey; hash: string; label: string }> = [
  { key: 'overview', hash: 'prehled', label: 'Přehled' },
  { key: 'event', hash: 'event', label: 'Event' },
  { key: 'draw', hash: 'losovani', label: 'Losování' },
  { key: 'disqualify', hash: 'diskvalifikace', label: 'Diskvalifikace' },
  { key: 'assignments', hash: 'stoly', label: 'Rozhodčí a stoly' },
] as const;

export function resolveAdminSectionFromHash(hash: string): AdminSectionKey {
  const normalized = hash.replace(/^#/, '').trim().toLowerCase();
  const found = ADMIN_SECTION_ITEMS.find((item) => item.hash === normalized);
  return found?.key ?? 'overview';
}

export function adminSectionHash(section: AdminSectionKey): string {
  return ADMIN_SECTION_ITEMS.find((item) => item.key === section)?.hash ?? 'prehled';
}
