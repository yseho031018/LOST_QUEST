import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { ItemCoordinates } from '../services/itemCoordinates';

export default function RegistrationMapCanvas({ point, onPick, onFail }: {
  point: ItemCoordinates | null; onPick: (point: ItemCoordinates) => void; onFail: () => void;
}) {
  const element = useRef<HTMLDivElement>(null), mapRef = useRef<ReturnType<typeof L.map> | null>(null);
  const callbacks = useRef({ onPick, onFail }); callbacks.current = { onPick, onFail };
  const markerRef = useRef<ReturnType<typeof L.circleMarker> | null>(null);
  useEffect(() => {
    if (!element.current) return;
    const map = L.map(element.current, { center: [36.4, 127.8], zoom: 7, minZoom: 6, maxZoom: 18,
      scrollWheelZoom: false, dragging: true, touchZoom: true, keyboard: true });
    mapRef.current = map;
    let loaded = false;
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors' })
      .on('tileload', () => { loaded = true; }).addTo(map);
    map.on('click', (event: { latlng: { lat: number; lng: number } }) => callbacks.current.onPick({ latitude: event.latlng.lat, longitude: event.latlng.lng }));
    const timeout = window.setTimeout(() => { if (!loaded) callbacks.current.onFail(); }, 10000);
    return () => { window.clearTimeout(timeout); map.remove(); mapRef.current = null; markerRef.current = null; };
  }, []);
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    markerRef.current?.remove(); markerRef.current = null;
    if (point) {
      markerRef.current = L.circleMarker([point.latitude, point.longitude], { radius: 10, color: '#1d4ed8', fillColor: '#3b82f6', fillOpacity: .5 }).addTo(map);
      map.setView([point.latitude, point.longitude], Math.max(map.getZoom(), 16));
    }
  }, [point]);
  return <div className="registration-map-area"><div ref={element} className="registration-map-canvas" role="group" aria-label="등록 위치 선택 지도" />
    <button type="button" className="text-link" onClick={() => { const center = mapRef.current?.getCenter(); if (center) onPick({ latitude: center.lat, longitude: center.lng }); }}>지도 중심으로 핀 선택</button></div>;
}
