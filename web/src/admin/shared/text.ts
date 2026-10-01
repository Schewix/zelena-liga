

export function normalizeText(value: string | null | undefined): string {
  return typeof value === 'string' ? value.trim() : '';
}
