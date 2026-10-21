import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { ApprovedPlace } from '../data/approvedPlaces';

const TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors';
/** No tile at all within this time counts as a failed map; the text and Kakao link stay visible either way. */
const TILE_TIMEOUT_MS = 10_000;

/**
 * Loaded only from the location tab (lazy chunk). Touch devices get a static map so swipes always scroll the page;
 * the zoom buttons still work. Calls onFail when no map tile loads.
 */
export default function LeafletMap({ place, onFail }: { place: ApprovedPlace; onFail: () => void }) {
  const element = useRef<HTMLDivElement>(null);
  const failed = useRef(onFail);
  failed.current = onFail;

  useEffect(() => {
    if (!element.current) return;
    // Finger-first devices get a static map (page swipes keep scrolling); mouse users can drag it.
    const touch = window.matchMedia?.('(pointer: coarse)').matches ?? L.Browser.mobile;
    const map = L.map(element.current, {
      center: [place.lat, place.lng], zoom: 16, minZoom: 6, maxZoom: 18,
      dragging: !touch, touchZoom: false, scrollWheelZoom: false, doubleClickZoom: false, boxZoom: false, keyboard: false, tap: false,
    });
    let loaded = false;
    const tiles = L.tileLayer(TILE_URL, { maxZoom: 19, attribution: ATTRIBUTION }).addTo(map);
    tiles.on('tileload', () => { loaded = true; });
    const timer = window.setTimeout(() => { if (!loaded) failed.current(); }, TILE_TIMEOUT_MS);
    L.circleMarker([place.lat, place.lng], { radius: 11, color: '#1d4ed8', weight: 3, fillColor: '#3b82f6', fillOpacity: 0.35 })
      .addTo(map)
      .bindTooltip(`${place.label} 부근`, { direction: 'top', offset: [0, -10] });
    return () => { window.clearTimeout(timer); map.remove(); };
  }, [place.lat, place.lng, place.label]);

  return <div ref={element} className="detail-location-map-canvas" role="img" aria-label={`${place.label} 부근을 표시한 지도`} />;
}
