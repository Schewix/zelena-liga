

export function slugify(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function readErrorText(error: unknown, key: 'code' | 'message' | 'details'): string {
  if (!error || typeof error !== 'object') {
    return '';
  }
  const value = (error as Record<string, unknown>)[key];
  return typeof value === 'string' ? value : '';
}

export function boardEventMutationErrorMessage(error: unknown, fallback: string): string {
  const code = readErrorText(error, 'code');
  const message = readErrorText(error, 'message').toLowerCase();
  const details = readErrorText(error, 'details').toLowerCase();
  const isDuplicate = code === '23505'
    || message.includes('duplicate key')
    || details.includes('already exists');

  if (isDuplicate) {
    return 'Slug eventu už existuje. Zvol jiný slug.';
  }
  return fallback;
}

export function getTodayStartIso(): string {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date.toISOString();
}
