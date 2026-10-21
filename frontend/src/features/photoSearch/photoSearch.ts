import type { Item } from '../../types';
import { colorPart } from '../crossMatch/combinedScore';
import { cosineSimilarity } from '../imageAnalysis/similarityMath';
import { ITEM_TYPES, type CategoryPrediction } from '../imageAnalysis/categories';
import { itemKindOf, TITLE_KINDS } from './itemKind';

/**
 * "사진으로 찾기": one photo, no login. The photo's object family (picked or recognised by CLIP) narrows LOST QUEST
 * found items with photos to the same family by title, then DINOv2 compares the photos one by one.
 * Everything runs in the browser; the photo never leaves the device.
 */
export const MAX_CANDIDATES = 12;
export const RESULT_COUNT = 5;
/** Share of the score from the colour field when the user picked a colour; the rest is photo appearance. */
export const COLOR_WEIGHT = 0.15;

export interface PhotoFeatures { vector: number[]; category: CategoryPrediction }
export interface PhotoSearchResult {
  item: Item;
  /** 0–100, appearance (and colour when picked). A reference value, not a guarantee. */
  score: number;
  /** DINOv2 cosine as a percentage (negative → 0). Not stretched, so different photos never tie at 100. */
  appearance: number;
  /** Unrounded cosine, the tie-breaker when rounded scores are equal. */
  cosine: number;
  colorMatch?: boolean;
}
export type PhotoSearchProgress =
  | { step: 'model' }
  | { step: 'kind' }
  | { step: 'compare'; done: number; total: number };

const SERVER_PHOTO = /\/api\/images\/[0-9a-f-]{36}\.(?:jpg|png|webp)$/;
export const hasServerPhoto = (item: Item) => SERVER_PHOTO.test(item.image);

/**
 * Open, visible found items with an uploaded photo. With a kind: only titles of that family (newest first).
 * Without (kind: null): the newest photos regardless of family, for "종류 상관없이 비교".
 */
export function selectCandidates(items: Item[], kind: string | null, limit = MAX_CANDIDATES): Item[] {
  return items
    .filter(item => item.type === 'found' && item.status === 'open' && !item.hidden && hasServerPhoto(item))
    .filter(item => kind === null || itemKindOf(item.title, item.category) === kind)
    .sort((a, b) => (b.createdAt ?? b.date).localeCompare(a.createdAt ?? a.date))
    .slice(0, limit);
}

/** The classifier type for a candidate: its title's family when the classifier knows it, otherwise 'other'. */
export function candidateItemType(item: Item): string {
  const kind = itemKindOf(item.title, item.category);
  return kind && ITEM_TYPES.some(type => type.id === kind) ? kind : 'other';
}

/** Classifier types that titles file under another family (titles call a suitcase 여행가방/캐리어 → 가방). */
const TYPE_TO_TITLE_KIND: Record<string, string> = { suitcase: 'bag' };
/** The searchable family for a classifier type, or null when titles cannot be filtered by it. */
export function titleKindForType(id: string | undefined): string | null {
  const kind = id ? TYPE_TO_TITLE_KIND[id] ?? id : '';
  return TITLE_KINDS.includes(kind) ? kind : null;
}

/** The photo's family when the classifier is confident; otherwise the user is asked to choose. */
export function recognisedKind(category: CategoryPrediction): string | null {
  return category.confident && category.id !== 'other' ? titleKindForType(category.id) : null;
}

/**
 * Ranking needs the raw appearance: the AI 비교 panel's visualPart maps cosine 0.75+ to 100%, which would make a
 * similar umbrella tie with the very same photo. Here the cosine is shown as is (same photo ≈ 100%, a similar
 * same-kind photo ≈ 60–76%, a different kind ≈ 0–32%, per the 2026-10-20 calibration).
 */
export function scoreCandidate(query: number[], candidate: number[], pickedColor: string | undefined, candidateColor: string): Omit<PhotoSearchResult, 'item'> {
  const cosine = cosineSimilarity(query, candidate);
  const appearance = Math.max(0, cosine);
  const color = pickedColor ? colorPart(pickedColor, candidateColor) : undefined;
  const score = color === undefined ? appearance : appearance * (1 - COLOR_WEIGHT) + color * COLOR_WEIGHT;
  return { score: Math.round(score * 1000) / 10, appearance: Math.round(appearance * 1000) / 10, cosine, ...(color === undefined ? {} : { colorMatch: color === 1 }) };
}

export interface CompareDeps {
  /** DINOv2 vector of a candidate photo; its item type is passed so CLIP is skipped. */
  features: (photo: Blob, itemType: string, signal: AbortSignal) => Promise<number[]>;
  /** Downloads a candidate photo. */
  download: (url: string, signal: AbortSignal) => Promise<Blob>;
}

// Candidate photo vectors survive between searches in this tab (same photo URL → same vector).
const vectorCache = new Map<string, number[]>();
export function clearCandidateCache() { vectorCache.clear(); }

/** Compares the query vector with every candidate and returns the best RESULT_COUNT, best first. */
export async function compareCandidates(
  query: number[], candidates: Item[], pickedColor: string | undefined,
  deps: CompareDeps, signal: AbortSignal, onProgress?: (p: PhotoSearchProgress) => void,
): Promise<{ results: PhotoSearchResult[]; failed: number }> {
  const results: PhotoSearchResult[] = [];
  let failed = 0;
  for (let i = 0; i < candidates.length; i++) {
    signal.throwIfAborted();
    onProgress?.({ step: 'compare', done: i, total: candidates.length });
    const item = candidates[i];
    try {
      let vector = vectorCache.get(item.image);
      if (!vector) {
        vector = await deps.features(await deps.download(item.image, signal), candidateItemType(item), signal);
        vectorCache.set(item.image, vector);
      }
      results.push({ item, ...scoreCandidate(query, vector, pickedColor, item.color) });
    } catch (error) {
      if (signal.aborted) throw error;
      failed++; // One unreadable photo must not hide the other results.
    }
  }
  onProgress?.({ step: 'compare', done: candidates.length, total: candidates.length });
  results.sort((a, b) => b.score - a.score || b.cosine - a.cosine);
  return { results: results.slice(0, RESULT_COUNT), failed };
}

export async function downloadPhoto(url: string, signal: AbortSignal): Promise<Blob> {
  const response = await fetch(url, { signal, credentials: 'omit' });
  if (!response.ok) throw new Error(`photo ${response.status}`);
  const blob = await response.blob();
  if (!/^image\/(jpeg|png|webp)$/.test(blob.type)) throw new Error('not an image');
  return blob;
}
