

export function toTelHref(phone: string) {
  return `tel:${phone.replace(/[^\d+]/g, '')}`;
}

export function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function normalizeEditorBodyHtml(value: string): string {
  const normalized = value
    .replace(/<p><br><\/p>/gi, '')
    .replace(/<div><br><\/div>/gi, '')
    .replace(/&nbsp;/gi, '')
    .replace(/\s+/g, '')
    .toLowerCase();
  if (!normalized || normalized === '<br>') {
    return '';
  }
  return value;
}

export function formatRuleLabel(filename: string): string {
  return filename.replace(/\.pdf$/i, '').replace(/_/g, ' ').replace(/\s+/g, ' ').trim();
}

export function formatDateLabel(dateISO: string) {
  const date = new Date(dateISO);
  if (Number.isNaN(date.getTime())) {
    return dateISO;
  }
  return date.toLocaleDateString('cs-CZ', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export function formatDocumentDate(dateISO: string) {
  const [year, month, day] = dateISO.split('-').map(Number);
  if (!year || !month || !day) {
    return dateISO;
  }
  return new Intl.DateTimeFormat('cs-CZ', { day: 'numeric', month: 'numeric', year: 'numeric' }).format(
    new Date(year, month - 1, day),
  );
}

export function formatFileSize(bytes: number) {
  if (bytes < 1024 * 1024) {
    return `${Math.max(1, Math.round(bytes / 1024))} kB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function stripHtmlToText(html: string) {
  if (!html) {
    return '';
  }
  if (typeof DOMParser === 'undefined') {
    return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  }
  const doc = new DOMParser().parseFromString(html, 'text/html');
  return (doc.body?.textContent ?? '').replace(/\s+/g, ' ').trim();
}
