import { API_BASE_URL } from '../admin/apiConfig';

export async function loadMapData(action: 'load_live_map' | 'load_live_map_events', accessToken: string, eventId?: string) {
  if (!API_BASE_URL) throw new Error('Chybí konfigurace API.');
  const response = await fetch(`${API_BASE_URL}/admin/event-state?setup=1`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, event_id: eventId }),
  });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || 'Načtení mapy selhalo.');
  return body;
}
