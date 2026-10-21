// Minimal typings for the parts of Leaflet 1.9.4 used by components/LeafletMap.tsx (Leaflet ships no types).
declare module 'leaflet' {
  type LatLng = [number, number];
  interface Evented { on(type: string, handler: () => void): this }
  interface LeafletMap extends Evented {
    on(type: 'click', handler: (event: { latlng: { lat: number; lng: number } }) => void): this;
    on(type: string, handler: () => void): this;
    remove(): void;
    setView(at: LatLng, zoom: number): this;
    getZoom(): number;
    getCenter(): { lat: number; lng: number };
  }
  interface Layer extends Evented { addTo(map: LeafletMap): this; remove(): this }
  interface CircleMarker extends Layer { bindTooltip(text: string, options?: Record<string, unknown>): this }
  const L: {
    map(element: HTMLElement, options: Record<string, unknown>): LeafletMap;
    tileLayer(url: string, options: Record<string, unknown>): Layer;
    circleMarker(at: LatLng, options: Record<string, unknown>): CircleMarker;
    Browser: { touch: boolean; mobile: boolean };
  };
  export default L;
}
