import { useCallback, useEffect, useRef, useState } from 'react';
import { describeActivityError } from '../services/activityApi';
import { deleteScore, fetchRanking } from '../services/gameRankingApi';
import type { RankingEntry } from '../services/questGameData';
import './community.css';

/** Administrators remove abusive or test runs from the 미니게임 ranking every visitor sees. */
export default function GameRankingAdmin() {
  const [ranking, setRanking] = useState<RankingEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [feedback, setFeedback] = useState('');
  const [confirm, setConfirm] = useState<number | null>(null);
  const version = useRef(0);
  const load = useCallback(async () => {
    const request = ++version.current; setLoading(true); setError('');
    try { const next = await fetchRanking(); if (request === version.current) setRanking(next); }
    catch (cause) { if (request === version.current) setError(describeActivityError(cause)); }
    finally { if (request === version.current) setLoading(false); }
  }, []);
  useEffect(() => { void load(); return () => { version.current += 1; }; }, [load]);
  const remove = async (entry: RankingEntry) => {
    if (busy || !entry.id) return; setBusy(true); setError(''); setFeedback('');
    try { setRanking(await deleteScore(entry.id)); setConfirm(null); setFeedback(`'${entry.nickname}' 기록을 랭킹에서 지웠어요.`); }
    catch (cause) { setError(describeActivityError(cause)); } finally { setBusy(false); }
  };
  return <section className="card community-section" aria-label="관리자 미니게임 랭킹 관리"><h2>미니게임 랭킹 관리</h2><p className="muted">모든 방문자에게 보이는 TOP 10이에요. 부적절한 닉네임이나 시험 기록을 지울 수 있어요. 지운 기록은 되돌릴 수 없어요.</p>
    {error && <p className="field-error" role="alert">{error}</p>}
    {feedback && <p className="workflow-feedback" role="status">{feedback}</p>}
    {loading ? <p role="status">랭킹을 불러오고 있어요…</p> : <>
      {!ranking.length && !error && <p>아직 랭킹 기록이 없어요.</p>}
      {ranking.map((entry, index) => <article key={entry.id ?? `${entry.nickname}-${entry.playedAt}`} className="community-report"><div className="community-heading"><strong>{index + 1}위 · {entry.nickname}</strong><span className="badge badge-neutral">{entry.score.toLocaleString()}점</span></div><small>정답 {entry.solved}개 · 최대 콤보 {entry.bestCombo} · {new Date(entry.playedAt).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })}</small>
        {entry.id && confirm !== entry.id && <div className="button-row"><button className="button button-secondary" disabled={busy} onClick={() => setConfirm(entry.id!)}>랭킹에서 지우기</button></div>}
        {entry.id && confirm === entry.id && <div role="alert"><p>'{entry.nickname}' 기록({entry.score.toLocaleString()}점)을 지울까요?</p><div className="button-row"><button className="button button-secondary" disabled={busy} onClick={() => setConfirm(null)}>취소</button><button className="button button-primary" disabled={busy} onClick={() => { void remove(entry); }}>삭제 확인</button></div></div>}
      </article>)}
    </>}
    <div className="button-row"><button className="text-link" disabled={loading || busy} onClick={() => { void load(); }}>다시 조회</button></div>
  </section>;
}
