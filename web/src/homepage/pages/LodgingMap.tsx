import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useEffect, useRef } from 'react';
import type { LodgingTip } from '../../data/community';
import { MAPY_TILE_URL } from '../../data/geocode';

type Point = { lat: number; lng: number };

type LodgingMapProps = {
  lodgings: LodgingTip[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  picked: Point | null;
  picking: boolean;
  onPick: (point: Point) => void;
};

const CZ_CENTER: L.LatLngTuple = [49.8, 15.5];

export function LodgingMap({ lodgings, selectedId, onSelect, picked, picking, onPick }: LodgingMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markersRef = useRef<L.LayerGroup | null>(null);
  const pickedRef = useRef<L.CircleMarker | null>(null);
  const pickingRef = useRef(picking);
  const onPickRef = useRef(onPick);
  const onSelectRef = useRef(onSelect);
  pickingRef.current = picking;
  onPickRef.current = onPick;
  onSelectRef.current = onSelect;

  useEffect(() => {
    if (!containerRef.current) return undefined;
    const map = L.map(containerRef.current, { scrollWheelZoom: false }).setView(CZ_CENTER, 7);
    if (MAPY_TILE_URL) {
      L.tileLayer(MAPY_TILE_URL, {
        minZoom: 0,
        maxZoom: 19,
        attribution:
          '<a href="https://api.mapy.com/copyright" target="_blank" rel="noreferrer">&copy; Seznam.cz a.s. a další</a>',
      }).addTo(map);
    } else {
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 18,
        attribution: '&copy; přispěvatelé <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      }).addTo(map);
    }
    map.on('click', (event: L.LeafletMouseEvent) => {
      if (pickingRef.current) {
        onPickRef.current({ lat: event.latlng.lat, lng: event.latlng.lng });
      }
    });
    markersRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
      markersRef.current = null;
      pickedRef.current = null;
    };
  }, []);

  useEffect(() => {
    const layer = markersRef.current;
    if (!layer) return;
    layer.clearLayers();
    lodgings.forEach((lodging) => {
      const selected = lodging.id === selectedId;
      const marker = L.circleMarker([lodging.lat, lodging.lng], {
        radius: selected ? 11 : 8,
        color: '#04372c',
        weight: 2,
        fillColor: selected ? '#f2c200' : '#2e9b6a',
        fillOpacity: 0.95,
      });
      marker.bindTooltip(lodging.name);
      marker.on('click', () => onSelectRef.current(lodging.id));
      marker.addTo(layer);
    });
  }, [lodgings, selectedId]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    pickedRef.current?.remove();
    pickedRef.current = null;
    if (picked) {
      pickedRef.current = L.circleMarker([picked.lat, picked.lng], {
        radius: 10,
        color: '#b3261e',
        weight: 3,
        fillColor: '#ffffff',
        fillOpacity: 0.9,
      }).addTo(map);
      map.flyTo([picked.lat, picked.lng], Math.max(map.getZoom(), 15), { duration: 0.6 });
    }
  }, [picked]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !selectedId) return;
    const selected = lodgings.find((lodging) => lodging.id === selectedId);
    if (selected) {
      map.flyTo([selected.lat, selected.lng], Math.max(map.getZoom(), 10), { duration: 0.6 });
    }
  }, [lodgings, selectedId]);

  return (
    <div
      ref={containerRef}
      className={`lodging-map${picking ? ' lodging-map--picking' : ''}`}
      role="application"
      aria-label="Mapa tipů na ubytování v České republice"
    />
  );
}
