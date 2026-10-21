import { useEffect, useState } from 'react';
import { Sparkles } from 'lucide-react';
import { useApp } from '../context/AppContext';
import './XpGainToast.css';

const VISIBLE_MS = 3_500;

/** A short "+N XP" notice whenever the signed-in user's XP goes up (own action or a return completed elsewhere). */
export default function XpGainToast() {
  const { xpGain, profile } = useApp();
  const [shown, setShown] = useState<{ amount: number; key: number } | null>(null);

  useEffect(() => {
    if (!xpGain) return;
    setShown(xpGain);
    const timer = setTimeout(() => setShown(current => (current?.key === xpGain.key ? null : current)), VISIBLE_MS);
    return () => clearTimeout(timer);
  }, [xpGain]);

  return <div className="xp-gain-toast-region" role="status" aria-live="polite">
    {shown && <div key={shown.key} className="xp-gain-toast">
      <Sparkles size={20} aria-hidden="true" />
      <strong>+{shown.amount} XP</strong>
      <span>Lv.{Math.floor(profile.xp / 100) + 1} · {profile.xp} XP</span>
    </div>}
  </div>;
}
