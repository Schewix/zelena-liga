export type GeoPoint = { lat: number; lng: number };

const MAPY_API_KEY = (import.meta.env.VITE_MAPY_API_KEY as string | undefined)?.trim() || '';

export const MAPY_TILE_URL = MAPY_API_KEY
  ? `https://api.mapy.cz/v1/maptiles/outdoor/256/{z}/{x}/{y}?apikey=${MAPY_API_KEY}`
  : null;

function dmsToDecimal(deg: string, min: string | undefined, sec: string | undefined) {
  return Number(deg) + Number(min ?? 0) / 60 + Number(sec ?? 0) / 3600;
}

// Rozpozná GPS zadanou jako "50.0755, 14.4378", "50.0755N, 14.4378E" nebo "49°11'45.6"N 16°36'12.3"E".
export function parseGpsInput(input: string): GeoPoint | null {
  const text = input.trim().replace(/,(?=\d)/g, '.').replace(/[,;]/g, ' ');

  const dms = text.match(
    /(\d{1,2})\s*°\s*(?:(\d{1,2})\s*['′]\s*)?(?:(\d{1,2}(?:\.\d+)?)\s*["″]\s*)?([NS])?\s+(\d{1,3})\s*°\s*(?:(\d{1,2})\s*['′]\s*)?(?:(\d{1,2}(?:\.\d+)?)\s*["″]\s*)?([EW])?/i,
  );
  if (dms) {
    const lat = dmsToDecimal(dms[1], dms[2], dms[3]) * (dms[4]?.toUpperCase() === 'S' ? -1 : 1);
    const lng = dmsToDecimal(dms[5], dms[6], dms[7]) * (dms[8]?.toUpperCase() === 'W' ? -1 : 1);
    return { lat, lng };
  }

  const decimal = text.match(/^([NS])?\s*(-?\d{1,2}\.\d+)\s*°?\s*([NS])?\s+([EW])?\s*(-?\d{1,3}\.\d+)\s*°?\s*([EW])?$/i);
  if (decimal) {
    const lat = Number(decimal[2]) * ((decimal[1] ?? decimal[3])?.toUpperCase() === 'S' ? -1 : 1);
    const lng = Number(decimal[5]) * ((decimal[4] ?? decimal[6])?.toUpperCase() === 'W' ? -1 : 1);
    return { lat, lng };
  }
  return null;
}

export async function geocodeAddress(query: string): Promise<GeoPoint | null> {
  try {
    if (MAPY_API_KEY) {
      const url = `https://api.mapy.cz/v1/geocode?query=${encodeURIComponent(query)}&lang=cs&limit=1&locality=cz&apikey=${MAPY_API_KEY}`;
      const response = await fetch(url);
      if (!response.ok) return null;
      const payload = (await response.json()) as { items?: Array<{ position?: { lat: number; lon: number } }> };
      const position = payload.items?.[0]?.position;
      return position ? { lat: position.lat, lng: position.lon } : null;
    }
    const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=cz&accept-language=cs&q=${encodeURIComponent(query)}`;
    const response = await fetch(url);
    if (!response.ok) return null;
    const payload = (await response.json()) as Array<{ lat: string; lon: string }>;
    const first = payload[0];
    return first ? { lat: Number(first.lat), lng: Number(first.lon) } : null;
  } catch {
    return null;
  }
}

// Z polohy (GPS, klik do mapy) udělá čitelnou adresu, ať se v tipech neukazují jen souřadnice.
export async function reverseGeocode(point: GeoPoint): Promise<string | null> {
  try {
    if (MAPY_API_KEY) {
      const url = `https://api.mapy.cz/v1/rgeocode?lat=${point.lat}&lon=${point.lng}&lang=cs&limit=1&apikey=${MAPY_API_KEY}`;
      const response = await fetch(url);
      if (!response.ok) return null;
      const payload = (await response.json()) as { items?: Array<{ name?: string; location?: string }> };
      const item = payload.items?.[0];
      if (!item?.name) return null;
      return item.location && !item.name.includes(item.location) ? `${item.name}, ${item.location}` : item.name;
    }
    const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=18&accept-language=cs&lat=${point.lat}&lon=${point.lng}`;
    const response = await fetch(url);
    if (!response.ok) return null;
    const payload = (await response.json()) as { address?: Record<string, string> };
    const a = payload.address;
    if (!a) return null;
    const street = [a.road, a.house_number].filter(Boolean).join(' ');
    const town = a.village || a.town || a.city || a.hamlet;
    const parts = [street, [a.postcode, town].filter(Boolean).join(' ')].filter(Boolean);
    return parts.length > 0 ? parts.join(', ') : null;
  } catch {
    return null;
  }
}

export function mapyComUrl(point: GeoPoint) {
  return `https://mapy.com/cs/zakladni?source=coor&id=${point.lng}%2C${point.lat}&x=${point.lng}&y=${point.lat}&z=16`;
}
