import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, Camera, CheckCircle2, ChevronRight, ImagePlus, LoaderCircle, MapPin, RotateCcw, ScanSearch, ShieldCheck, Sparkles, X } from 'lucide-react';
import ItemImage from '../components/ItemImage';
import { photoFeatures, releaseAppearanceResources } from '../features/imageAnalysis/appearance';
import { ITEM_TYPES, type CategoryPrediction } from '../features/imageAnalysis/categories';
import { validateImageFile } from '../features/imageAnalysis/similarityMath';
import { TITLE_KINDS } from '../features/photoSearch/itemKind';
import { compareCandidates, downloadPhoto, MAX_CANDIDATES, recognisedKind, selectCandidates, titleKindForType, type PhotoSearchProgress, type PhotoSearchResult } from '../features/photoSearch/photoSearch';
import { setPhotoHandover } from '../features/photoSearch/handover';
import { listServerItems } from '../services/itemApi';
import type { Item } from '../types';
import './PhotoSearchPage.css';

const KIND_OPTIONS = ITEM_TYPES.filter(type => TITLE_KINDS.includes(type.id));
const COLOR_OPTIONS = ['검정', '흰색', '회색', '은색', '남색', '파랑', '빨강', '갈색', '베이지', '초록', '노랑', '분홍', '보라', '투명'];
/** Register form categories for a recognised family; everything else is 기타. */
const REGISTER_CATEGORY: Record<string, string> = {
  wallet: '지갑', card: '지갑', bag: '가방',
  phone: '전자기기', earbuds: '전자기기', headphones: '전자기기', laptop: '전자기기', tablet: '전자기기', camera: '전자기기',
  watch: '액세서리', jewelry: '액세서리', glasses: '액세서리', umbrella: '액세서리', hat: '액세서리',
};
const kindLabel = (id: string | null) => ITEM_TYPES.find(type => type.id === id)?.label ?? '';

type Phase = 'idle' | 'running' | 'need-kind' | 'done';
/** byAi: the kind came from the photo classifier rather than the user's choice. */
interface Outcome { kind: string | null; byAi: boolean; results: PhotoSearchResult[]; compared: number; failed: number; anyKind: boolean }

export default function PhotoSearchPage() {
  const navigate = useNavigate();
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState('');
  const [kindChoice, setKindChoice] = useState('auto');
  const [color, setColor] = useState('');
  const [items, setItems] = useState<Item[] | null>(null);
  const [itemsError, setItemsError] = useState('');
  const [phase, setPhase] = useState<Phase>('idle');
  const [progress, setProgress] = useState<PhotoSearchProgress | null>(null);
  const [detected, setDetected] = useState<CategoryPrediction | null>(null);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [error, setError] = useState('');
  const query = useRef<number[] | null>(null);
  const controller = useRef<AbortController | null>(null);
  const cameraInput = useRef<HTMLInputElement>(null);
  const albumInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    void listServerItems('found').then(list => { if (!cancelled) setItems(list); })
      .catch(() => { if (!cancelled) setItemsError('주운 물건 목록을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.'); });
    return () => { cancelled = true; controller.current?.abort(); releaseAppearanceResources(); };
  }, []);
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  const photoCount = items ? selectCandidates(items, null, Number.MAX_SAFE_INTEGER).length : 0;
  // The classifier's best guess, offered first when it was not confident enough to decide alone.
  const suggestedKind = detected && detected.id !== 'other' ? titleKindForType(detected.id) : null;
  const busy = phase === 'running';

  function reset() {
    controller.current?.abort();
    query.current = null;
    setPhase('idle'); setProgress(null); setDetected(null); setOutcome(null); setError('');
  }
  function choose(next?: File) {
    if (!next) return;
    try { validateImageFile(next); } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); return; }
    reset();
    setFile(next);
    setPreview(URL.createObjectURL(next));
  }

  /** kind: a family to compare with, or null for "종류 상관없이" (newest photos). */
  async function compare(kind: string | null, byAi: boolean, signal: AbortSignal) {
    if (!items || !query.current) return;
    const candidates = selectCandidates(items, kind);
    if (!candidates.length) { setOutcome({ kind, byAi, results: [], compared: 0, failed: 0, anyKind: kind === null }); setPhase('done'); return; }
    const { results, failed } = await compareCandidates(query.current, candidates, color || undefined, {
      download: downloadPhoto,
      features: async (photo, itemType, s) => (await photoFeatures(photo, itemType, s)).vector,
    }, signal, setProgress);
    setOutcome({ kind, byAi, results, compared: candidates.length - failed, failed, anyKind: kind === null });
    setPhase('done');
  }

  async function run(kindOverride?: string | null) {
    if (!file || !items) return;
    controller.current?.abort();
    const next = new AbortController();
    controller.current = next;
    setPhase('running'); setError(''); setOutcome(null);
    try {
      // undefined: decide the kind from the options/photo; a string or null comes from the "choose a kind" step.
      let kind = kindOverride;
      let byAi = false;
      if (kindOverride === undefined || !query.current) {
        setProgress({ step: 'model' });
        const picked = kindOverride !== undefined ? kindOverride : kindChoice !== 'auto' ? kindChoice : null;
        // The user's photo: DINOv2 vector, plus CLIP's item type when the kind was left to automatic.
        const features = await photoFeatures(file, picked ?? 'auto', next.signal, () => setProgress({ step: 'model' }));
        query.current = features.vector;
        setDetected(features.category);
        if (kindOverride === undefined) {
          setProgress({ step: 'kind' });
          kind = picked ?? recognisedKind(features.category);
          byAi = !picked;
          if (!kind || !TITLE_KINDS.includes(kind)) { setPhase('need-kind'); return; }
        }
      }
      await compare(kind ?? null, byAi, next.signal);
    } catch (reason) {
      if (next.signal.aborted) return;
      setError(reason instanceof Error ? reason.message : String(reason));
      setPhase('idle');
    } finally {
      if (controller.current === next) { controller.current = null; setProgress(null); releaseAppearanceResources(); }
    }
  }

  function register() {
    const kind = outcome?.kind ?? (kindChoice !== 'auto' ? kindChoice : null);
    if (!file) return;
    setPhotoHandover({ file, title: [color, kindLabel(kind)].filter(Boolean).join(' '), category: (kind && REGISTER_CATEGORY[kind]) || '기타', color });
    navigate('/register?type=lost');
  }

  const progressText = !progress ? '' : progress.step === 'model' ? 'AI 모델을 준비하고 있어요'
    : progress.step === 'kind' ? '사진 속 물건 종류를 확인하고 있어요'
    : `같은 종류의 주운 물건 사진과 비교하고 있어요 (${progress.done}/${progress.total})`;

  return <div className="page-container photo-search-page">
    <div className="journey-breadcrumb"><Link to="/">홈</Link><ChevronRight size={14} /><span>사진으로 찾기</span></div>
    <section className="photo-search-hero">
      <span className="eyebrow"><Sparkles size={14} /> 로그인 없이 바로</span>
      <h1>사진 한 장으로<br />주운 물건을 찾아보세요</h1>
      <p>잃어버린 물건 사진을 올리면, 이웃이 등록한 주운 물건 중 <strong>같은 종류</strong>만 골라 생김새가 닮은 순서로 보여 드려요.</p>
      <div className="photo-search-privacy"><ShieldCheck size={17} aria-hidden="true" /><span>사진은 서버로 보내지 않고 이 기기 안에서만 비교해요.</span></div>
    </section>

    <section className="card photo-search-panel" aria-labelledby="photo-search-step1">
      <h2 id="photo-search-step1"><span>1</span>잃어버린 물건 사진</h2>
      {preview
        ? <div className="photo-search-preview"><img src={preview} alt="선택한 물건 사진" /><button type="button" className="photo-search-clear" aria-label="사진 지우기" disabled={busy} onClick={() => { reset(); setFile(null); setPreview(''); }}><X size={18} /></button></div>
        : <div className="photo-search-pick">
          <button type="button" className="button button-primary" onClick={() => cameraInput.current?.click()}><Camera size={18} />사진 찍기</button>
          <button type="button" className="button button-secondary" onClick={() => albumInput.current?.click()}><ImagePlus size={18} />앨범에서 고르기</button>
          <small>물건이 화면 가운데에 크게 나온 사진일수록 잘 찾아요.</small>
        </div>}
      <input ref={cameraInput} className="sr-only" type="file" accept="image/jpeg,image/png,image/webp" capture="environment" aria-label="사진 찍기" onChange={event => { choose(event.target.files?.[0]); event.target.value = ''; }} />
      <input ref={albumInput} className="sr-only" type="file" accept="image/jpeg,image/png,image/webp" aria-label="앨범에서 사진 고르기" onChange={event => { choose(event.target.files?.[0]); event.target.value = ''; }} />

      <h2 className="photo-search-step2"><span>2</span>알고 있다면 골라 주세요 <small>(선택)</small></h2>
      <div className="photo-search-options">
        <label className="form-field">물건 종류
          <select value={kindChoice} disabled={busy} onChange={event => { setKindChoice(event.target.value); reset(); }}>
            <option value="auto">AI가 사진으로 알아보기</option>
            {KIND_OPTIONS.map(type => <option key={type.id} value={type.id}>{type.label}</option>)}
          </select>
        </label>
        <label className="form-field">색상
          <select value={color} disabled={busy} onChange={event => { setColor(event.target.value); reset(); }}>
            <option value="">상관없음</option>
            {COLOR_OPTIONS.map(name => <option key={name}>{name}</option>)}
          </select>
        </label>
      </div>

      <button type="button" className="button button-primary photo-search-run" disabled={!file || !items || busy} onClick={() => void run()}>
        {busy ? <><LoaderCircle className="photo-search-spin" size={18} />찾는 중</> : <><ScanSearch size={18} />비슷한 물건 찾기</>}
      </button>
      <p className="photo-search-note">
        {itemsError || (items ? `사진이 있는 주운 물건 ${photoCount}개 중에서 찾아요.` : '주운 물건 목록을 불러오고 있어요…')}
        {' '}처음 한 번은 AI 모델을 내려받느라 시간이 걸릴 수 있어요(Wi-Fi 권장).
      </p>
      <Link className="text-link photo-search-other" to="/image-analysis">가지고 있는 사진 두 장을 직접 비교하려면 AI 이미지 분석<ChevronRight size={14} /></Link>
    </section>

    {progress && <div className="photo-search-progress" role="status"><LoaderCircle className="photo-search-spin" size={18} /><div><strong>{progressText}</strong>
      {progress.step === 'compare' && <span className="photo-search-bar"><span style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%` }} /></span>}</div></div>}
    {error && <div className="photo-search-error" role="alert"><strong>찾기를 마치지 못했어요.</strong><p>{error}</p><button type="button" className="text-link" onClick={() => void run()}>다시 시도</button></div>}

    {phase === 'need-kind' && <section className="card photo-search-panel" aria-labelledby="photo-search-kind">
      <h2 id="photo-search-kind">어떤 물건인지 골라 주세요</h2>
      <p className="muted">{suggestedKind ? `사진만으로는 확실하지 않아요. ${kindLabel(suggestedKind)}일 수도 있어요.` : '사진만으로는 물건 종류를 알아보기 어려워요.'} 종류를 고르면 같은 종류의 물건만 비교해요.</p>
      <div className="photo-search-kind-chips">{KIND_OPTIONS.map(type => <button key={type.id} type="button" className={suggestedKind === type.id ? 'suggested' : ''} aria-pressed={suggestedKind === type.id ? 'true' : undefined} onClick={() => { setKindChoice(type.id); void run(type.id); }}>{type.label}</button>)}</div>
      <button type="button" className="text-link" onClick={() => void run(null)}>종류 상관없이 최근 사진 {MAX_CANDIDATES}개와 비교하기</button>
    </section>}

    {phase === 'done' && outcome && <section className="photo-search-results" aria-labelledby="photo-search-results-title">
      <div className="photo-search-results-heading">
        <h2 id="photo-search-results-title">{outcome.anyKind ? '최근 주운 물건과 비교한 결과' : `${kindLabel(outcome.kind)} 중 닮은 순서`}</h2>
        {outcome.compared > 0 && <span>{outcome.compared}개 사진 비교{outcome.failed ? ` · ${outcome.failed}개는 사진을 불러오지 못했어요` : ''}</span>}
      </div>
      {outcome.kind && !outcome.anyKind && <p className="photo-search-detected"><CheckCircle2 size={16} aria-hidden="true" />{outcome.byAi ? <>AI가 사진 속 물건을 <strong>{kindLabel(outcome.kind)}</strong>(으)로 알아봤어요.</> : <>고른 종류 <strong>{kindLabel(outcome.kind)}</strong>의 물건과 비교했어요.</>}
        <button type="button" className="text-link" onClick={() => setPhase('need-kind')}>종류 바꾸기</button></p>}
      {outcome.results.length ? <ol className="photo-search-list">{outcome.results.map((result, index) => <li key={result.item.id} className="card">
        <span className="photo-search-rank">{index + 1}</span>
        <ItemImage src={result.item.image} fallbackSrc="" alt={`${result.item.title} 사진`} loading="lazy" />
        <div className="photo-search-item">
          <strong>{result.item.title}</strong>
          <span><MapPin size={13} aria-hidden="true" />{[result.item.region, result.item.location].filter(Boolean).join(' ')} · {result.item.date} 습득</span>
          <div className="photo-search-score"><span className="photo-search-bar"><span style={{ width: `${result.score}%` }} /></span><b>{result.score.toFixed(1)}%</b></div>
          <small>사진 생김새 {result.appearance.toFixed(1)}%{result.colorMatch === undefined ? '' : result.colorMatch ? ' · 색상 같음' : ' · 색상 다름'}</small>
        </div>
        <Link className="button button-secondary" to={`/items/${result.item.id}`}>자세히<ArrowRight size={15} /></Link>
      </li>)}</ol>
        : <div className="card photo-search-empty"><p>{outcome.anyKind ? '비교할 수 있는 주운 물건 사진이 아직 없어요.' : `아직 등록된 ${kindLabel(outcome.kind)} 사진이 없어요.`}</p>
          {!outcome.anyKind && <button type="button" className="text-link" onClick={() => void run(null)}>종류 상관없이 최근 사진과 비교하기</button>}</div>}
      <p className="photo-search-disclaimer">닮은 정도는 사진 생김새를 비교한 참고값이에요. 같은 물건이라는 보장은 아니니, 자세히 보기에서 장소와 날짜도 확인해 주세요.</p>
      <div className="card photo-search-cta">
        <div><strong>찾는 물건이 없나요?</strong><p>‘내 물건 찾기’로 등록해 두면 비슷한 물건이 새로 올라올 때 알려 드려요. 이 사진과 종류가 미리 채워져요.</p></div>
        <div className="photo-search-cta-actions">
          <button type="button" className="button button-primary" onClick={register}>내 물건 찾기로 등록하기<ArrowRight size={16} /></button>
          <button type="button" className="button button-secondary" onClick={() => { reset(); setFile(null); setPreview(''); }}><RotateCcw size={16} />다른 사진으로</button>
        </div>
      </div>
    </section>}
  </div>;
}
