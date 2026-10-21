import { Component, Suspense, lazy, useState, type ReactNode } from 'react';
import { ExternalLink, MapPin } from 'lucide-react';
import { findApprovedPlace, kakaoMapSearchUrl } from '../data/approvedPlaces';
import type { Item } from '../types';
import './ItemLocationPanel.css';

const LeafletMap = lazy(() => import('./LeafletMap'));

/** A failed map chunk (offline, blocked) falls back to the text panel instead of breaking the page. */
class MapErrorBoundary extends Component<{ onError: () => void; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch() { this.props.onError(); }
  render() { return this.state.failed ? null : this.props.children; }
}

/** The location tab: the stored place text always, a map only for reviewed positions, otherwise a Kakao Map search link. */
export default function ItemLocationPanel({ item }: { item: Pick<Item, 'id' | 'type' | 'source' | 'region' | 'location'> }) {
  const placeText = (item.location.startsWith(item.region) ? item.location : [item.region, item.location].join(' ')).trim();
  const place = findApprovedPlace(item);
  const [mapFailed, setMapFailed] = useState(false);

  return <div className="detail-location">
    {place && !mapFailed && <figure className="detail-location-map">
      <MapErrorBoundary onError={() => setMapFailed(true)}>
        <Suspense fallback={<div className="detail-location-map-canvas detail-location-map-loading" role="status">지도를 불러오고 있어요</div>}>
          <LeafletMap place={place} onFail={() => setMapFailed(true)} />
        </Suspense>
      </MapErrorBoundary>
      <figcaption>등록된 장소를 기준으로 한 대략적인 위치입니다. 지도 표시 기준: {place.label}</figcaption>
    </figure>}
    <div className="detail-location-text">
      <MapPin size={20} aria-hidden="true" />
      <div>
        <strong>{placeText || '장소 정보 없음'}</strong>
        {place && mapFailed && <span role="status">지도를 불러오지 못했어요. 아래 링크로 위치를 확인해 주세요.</span>}
        {!place && <span>정확한 위치를 지도에 표시할 수 없는 장소예요.</span>}
      </div>
    </div>
    {placeText && <a className="text-link detail-location-link" href={kakaoMapSearchUrl(placeText)} target="_blank" rel="noopener noreferrer">
      <ExternalLink size={15} aria-hidden="true" />카카오맵에서 장소 검색
    </a>}
  </div>;
}
