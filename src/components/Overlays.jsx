// ---------------------------------------------------------------------------
// Overlays — love-meter badge, floating emoji reactions, gift toasts, challenge
// accept banner and the partner "moment" flash. Rendered above the video grid.
// ---------------------------------------------------------------------------

import React, { useMemo } from 'react';
import { Flame, Heart } from 'lucide-react';
import { loveLevel } from '../lib/coupleContent';

export function LoveMeterBadge({ value }) {
  const level = useMemo(() => loveLevel(value || 0), [value]);
  return (
    <div className="flex items-center gap-1.5 rounded-full border border-pink-400/30 bg-black/50 px-3 py-1 backdrop-blur-md">
      <span className="text-sm">{level.emoji}</span>
      <div className="h-1.5 w-14 overflow-hidden rounded-full bg-white/10">
        <div
          className="h-full rounded-full bg-gradient-to-r from-pink-500 to-purple-500 transition-all duration-700"
          style={{ width: `${Math.min(100, value || 0)}%` }}
        />
      </div>
      <span className="text-[10px] font-bold text-pink-200">{value || 0}</span>
    </div>
  );
}

export function FloatingReactions({ reactions }) {
  return (
    <div className="pointer-events-none absolute inset-0 z-20 overflow-hidden">
      {reactions.map((r) => (
        <span
          key={r.id}
          className="animate-float-up absolute bottom-24 text-3xl"
          // Deterministic per-reaction offset from its id: no re-randomising on re-render.
          style={{ left: `${10 + (hashId(r.id) % 76)}%` }}
        >
          {r.emoji}
        </span>
      ))}
    </div>
  );
}

/** Stable 0..n hash so a reaction keeps its lane across renders. */
function hashId(id = '') {
  let h = 0;
  for (let i = 0; i < id.length; i += 1) h = (h * 31 + id.charCodeAt(i)) % 1000;
  return h;
}

export function GiftToast({ gift }) {
  return (
    <div className="pointer-events-none absolute left-1/2 top-16 z-30 -translate-x-1/2">
      <div className="animate-bounce rounded-2xl border border-pink-400/40 bg-pink-500/20 px-4 py-2 text-sm font-semibold text-pink-50 shadow-2xl backdrop-blur-md">
        {gift.senderName} sent {gift.gift.emoji} {gift.gift.label}!
      </div>
    </div>
  );
}

export function ComboFlash({ combo }) {
  return (
    <div className="pointer-events-none absolute left-1/2 top-1/2 z-30 -translate-x-1/2 -translate-y-1/2">
      <div className="animate-ping-slow rounded-full border border-amber-300/60 bg-amber-400/20 px-6 py-3 text-lg font-extrabold text-amber-200 backdrop-blur-md">
        Combo! {combo.emoji}
      </div>
    </div>
  );
}

export function ChallengeBanner({ challenge, onAccept }) {
  if (!challenge) return null;
  return (
    <div className="absolute left-1/2 top-16 z-30 w-[92%] max-w-md -translate-x-1/2">
      <div className={`rounded-2xl bg-gradient-to-br ${challenge.accent || 'from-pink-500/30 to-purple-600/30'} border border-white/20 p-4 text-center shadow-2xl backdrop-blur-xl`}>
        <div className="text-xl">{challenge.emoji}</div>
        <div className="text-[10px] font-bold uppercase tracking-wide text-pink-100/80">
          {challenge.label} challenge from {challenge.fromName}
        </div>
        <p className="mt-1 text-sm font-semibold text-white">“{challenge.prompt}”</p>
        {challenge.status === 'offered' ? (
          <button
            onClick={onAccept}
            className="mt-2 rounded-xl bg-pink-500 px-4 py-1.5 text-xs font-bold text-white shadow-lg hover:bg-pink-400"
          >
            Accept challenge
          </button>
        ) : (
          <div className="mt-2 flex items-center justify-center gap-1.5 text-xs font-semibold text-emerald-300">
            <Flame className="h-4 w-4" /> Challenge on!
          </div>
        )}
      </div>
    </div>
  );
}

export function MomentFlash({ name }) {
  if (!name) return null;
  return (
    <div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center">
      <div className="rounded-3xl border border-pink-300/50 bg-black/70 px-8 py-6 text-center backdrop-blur-md">
        <Heart className="mx-auto h-10 w-10 animate-pulse fill-pink-400 text-pink-400" />
        <div className="mt-2 text-lg font-extrabold text-white">Moment captured!</div>
        <div className="text-sm text-pink-200">Shared with {name}</div>
      </div>
    </div>
  );
}
