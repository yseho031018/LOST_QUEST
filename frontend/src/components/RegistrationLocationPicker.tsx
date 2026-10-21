import { Component, Suspense, lazy, useEffect, useRef, useState, type ReactNode } from 'react';
import { MapPin } from 'lucide-react';
import { searchRegistrationPlaces, type PlaceResult } from '../services/placeSearch';
import type { ItemCoordinates } from '../services/itemCoordinates';
import { normalizeRegistrationRegion } from '../services/registrationLocation';
import './RegistrationLocationPicker.css';

const MapCanvas = lazy(() => import('./RegistrationMapCanvas'));
class MapBoundary extends Component<{ onFail: () => void; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch() { this.props.onFail(); }
  render() { return this.state.failed ? null : this.props.children; }
}
export interface LocationSelection extends ItemCoordinates { location: string; region?: string }

export default function RegistrationLocationPicker({ location, selected, onConfirm, onClear }: {
  location: string; selected: LocationSelection | null; onConfirm: (selection: LocationSelection) => void; onClear: () => void;
}) {
  const [open, setOpen] = useState(false), [query, setQuery] = useState(''), [results, setResults] = useState<PlaceResult[]>([]);
  const [draft, setDraft] = useState<LocationSelection | null>(null), [busy, setBusy] = useState(false), [searched, setSearched] = useState(false);
  const [error, setError] = useState(''), [mapFailed, setMapFailed] = useState(false);
  const version = useRef(0), loading = useRef(false), opener = useRef<HTMLButtonElement>(null);
  useEffect(() => () => { version.current++; }, []);
  useEffect(() => { setDraft(selected); }, [location, selected]);
  function close() { version.current++; loading.current = false; setBusy(false); setOpen(false); opener.current?.focus(); }
  async function search() {
    if (loading.current) return;
    const current = ++version.current;
    loading.current = true; setBusy(true); setError(''); setResults([]); setSearched(false);
    try { const places = await searchRegistrationPlaces(query); if (current === version.current) { setResults(places); setSearched(true); } }
    catch (cause) { if (current === version.current) setError(cause instanceof Error ? cause.message : '검색하지 못했어요. 장소를 직접 입력해 주세요.'); }
    finally { if (current === version.current) { loading.current = false; setBusy(false); } }
  }
  function choose(place: PlaceResult) {
    setDraft({ latitude: place.latitude, longitude: place.longitude, location: (place.address.length <= 100 ? place.address : place.name).slice(0, 100), region: normalizeRegistrationRegion(place.region) });
  }
  return <div className="registration-location-picker">
    <button ref={opener} type="button" className="button button-secondary" aria-expanded={open} aria-controls="registration-map-picker" onClick={() => {
      if (open) close(); else { setQuery(location); setDraft(selected); setResults([]); setSearched(false); setError(''); setMapFailed(false); setOpen(true); }
    }}><MapPin size={16} aria-hidden="true" />{open ? '지도 닫기' : '지도에서 찾기'}</button>
    {selected && <div className="registration-location-selected" role="status"><span>지도 위치가 선택됐어요. 지역이나 상세 장소를 수정하면 위치 선택이 해제돼요.</span><button type="button" className="text-link" onClick={() => { setDraft(null); onClear(); }}>선택 해제</button></div>}
    {open && <section id="registration-map-picker" aria-label="지도에서 등록 위치 찾기" onKeyDown={e => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); } }}>
      <label htmlFor="registration-place-query">장소 검색</label>
      <div className="registration-place-search"><input id="registration-place-query" value={query} maxLength={100} placeholder="예: 단대오거리역" onChange={e => { version.current++; loading.current = false; setBusy(false); setQuery(e.target.value); setDraft(null); setResults([]); setSearched(false); setError(''); }} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); void search(); } }} />
        <button type="button" className="button button-secondary" disabled={busy || query.trim().length < 2} onClick={() => { void search(); }}>{busy ? '검색 중…' : '장소 검색'}</button></div>
      <p className="muted registration-map-note">검색 버튼을 누를 때만 검색해요. 개인정보는 입력하지 마세요. 지도는 선택 사항이며 직접 장소를 입력해도 등록할 수 있어요.</p>
      {error && <p role="alert" className="field-error">{error}</p>}
      {searched && results.length === 0 && <p role="status">검색 결과가 없어요. 다른 장소명으로 검색하거나 직접 입력해 주세요.</p>}
      {results.length > 0 && <ul className="registration-place-results" aria-label="장소 검색 결과">{results.map(place => <li key={place.id}><button type="button" onClick={() => choose(place)}><strong>{place.name}</strong><span>{place.address}</span></button></li>)}</ul>}
      {!mapFailed && <MapBoundary onFail={() => setMapFailed(true)}><Suspense fallback={<p role="status">지도를 불러오는 중이에요.</p>}><MapCanvas point={draft} onPick={point => setDraft(previous => ({ ...point, location: previous?.location || location.trim() || query.trim(), ...(previous?.region ? { region: previous.region } : {}) }))} onFail={() => setMapFailed(true)} /></Suspense></MapBoundary>}
      {mapFailed && <p role="status">지도를 불러오지 못했어요. 검색 결과를 선택하거나 상세 장소를 직접 입력해 주세요.</p>}
      <p className="registration-map-note">지도를 누르거나 중심으로 핀을 선택한 뒤 확인해 주세요. 핀을 옮겨도 주소는 자동 변경되지 않으니 상세 장소를 직접 확인해 주세요.</p>
      {draft && <p role="status" className="registration-map-draft">선택할 장소: {draft.location || '상세 장소를 먼저 입력해 주세요.'}<br />위도 {draft.latitude.toFixed(6)} · 경도 {draft.longitude.toFixed(6)}</p>}
      <p className="registration-map-attribution">검색·지도 데이터: <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">© OpenStreetMap contributors</a> · <a href="https://operations.osmfoundation.org/policies/nominatim/" target="_blank" rel="noopener noreferrer">Nominatim</a></p>
      <div className="registration-map-actions"><button type="button" className="button button-ghost" onClick={close}>취소</button><button type="button" className="button button-primary" disabled={!draft?.location.trim()} onClick={() => { if (draft?.location.trim()) { onConfirm(draft); close(); } }}>이 장소 사용</button></div>
    </section>}
  </div>;
}
