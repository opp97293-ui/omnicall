// ---------------------------------------------------------------------------
// CouplePanel — the drawer holding everything romantic in the call:
// love meter, challenge deck, gifts, love notes and reaction emojis.
// ---------------------------------------------------------------------------

import React, { useMemo, useRef, useState } from 'react';
import {
  Gift, NotebookPen, Heart, Send, X, Sparkles, Trophy, ShieldCheck, Flame
} from 'lucide-react';
import { CHALLENGE_CATEGORIES, GIFTS, REACTIONS, loveLevel, randomChallenge } from '../lib/coupleContent';

const PAGES = { meter: 'meter', challenges: 'challenges', gifts: 'gifts', notes: 'notes' };

export default function CouplePanel({
  open,
  onClose,
  loveMeter,
  scores,
  challenge,
  gifts,
  loveNotes,
  sendGift,
  sendLoveNote,
  offerChallenge,
  respondChallenge
}) {
  const [page, setPage] = useState(PAGES.meter);
  const [note, setNote] = useState('');
  const [activeCat, setActiveCat] = useState(null);
  const [fresh, setFresh] = useState(null);
  const notesEndRef = useRef(null);

  const level = useMemo(() => loveLevel(loveMeter), [loveMeter]);
  const totalScore = useMemo(() => Object.values(scores || {}).reduce((a, b) => a + b, 0), [scores]);

  const onSentGift = (gift) => {
    sendGift(gift);
    setFresh({ emoji: gift.emoji, label: gift.label, points: gift.points });
    setTimeout(() => setFresh(null), 1800);
  };

  const onNewChallenge = (catId) => {
    const cat = CHALLENGE_CATEGORIES.find((c) => c.id === catId) || CHALLENGE_CATEGORIES[0];
    offerChallenge({ categoryId: cat.id, label: cat.label, emoji: cat.emoji, accent: cat.accent, prompt: randomChallenge().prompt });
  };

  const submitNote = (e) => {
    e.preventDefault();
    if (!note.trim()) return;
    sendLoveNote(note);
    setNote('');
    setTimeout(() => notesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 60);
  };

  return (
    <aside className="flex h-full w-[320px] flex-col border-l border-white/10 bg-[#150a29]/95 backdrop-blur-xl">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-white/10 p-4">
        <h3 className="flex items-center gap-2 text-sm font-bold text-white">
          <Sparkles className="h-4 w-4 text-pink-400" />
          Couple Mode
        </h3>
        <button onClick={onClose} className="rounded-lg p-1 text-slate-400 hover:bg-white/10 hover:text-white" title="Close">
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Tabs */}
      <nav className="grid grid-cols-4 gap-1 border-b border-white/10 p-2">
        {[
          { id: PAGES.meter, label: 'Love', icon: Heart },
          { id: PAGES.challenges, label: 'Challenges', icon: Flame },
          { id: PAGES.gifts, label: 'Gifts', icon: Gift },
          { id: PAGES.notes, label: 'Notes', icon: NotebookPen }
        ].map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setPage(id)}
            className={`flex flex-col items-center gap-0.5 rounded-xl px-1 py-2 text-[10px] font-semibold transition-colors ${
              page === id ? 'bg-pink-500/20 text-pink-200' : 'text-slate-400 hover:bg-white/5 hover:text-white'
            }`}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}
      </nav>

      <div className="flex-1 overflow-y-auto p-4">
        {/* ---------- Love Meter ---------- */}
        {page === PAGES.meter && (
          <div className="flex flex-col gap-4">
            <div className="rounded-2xl border border-pink-500/20 bg-gradient-to-br from-pink-500/10 to-purple-600/10 p-4 text-center">
              <div className="text-4xl">{level.emoji}</div>
              <div className={`mt-1 text-sm font-bold ${level.tone}`}>{level.label}</div>
              <div className="mt-3 h-3 overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-pink-500 via-rose-400 to-purple-500 transition-all duration-700"
                  style={{ width: `${Math.min(100, loveMeter)}%` }}
                />
              </div>
              <div className="mt-1 text-xs text-slate-300">{loveMeter} / 100 love points</div>
            </div>

            <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
              <div className="flex items-center gap-2 text-xs text-slate-300">
                <Trophy className="h-4 w-4 text-amber-400" />
                Challenges won together
              </div>
              <span className="text-lg font-extrabold text-amber-300">{totalScore}</span>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-xs leading-relaxed text-slate-300">
              <div className="mb-2 flex items-center gap-2 font-bold text-pink-200">
                <ShieldCheck className="h-4 w-4 text-emerald-400" />
                How the meter grows
              </div>
              <ul className="space-y-1.5">
                <li>❤️ React together fast — combo bonus</li>
                <li>💍 Send gifts to your partner</li>
                <li>💌 Leave a love note</li>
                <li>🔥 Complete challenges</li>
                <li>📸 Capture a shared moment</li>
              </ul>
            </div>
          </div>
        )}

        {/* ---------- Challenges ---------- */}
        {page === PAGES.challenges && (
          <div className="flex flex-col gap-3">
            <div className="grid grid-cols-2 gap-2">
              {CHALLENGE_CATEGORIES.map((cat) => (
                <button
                  key={cat.id}
                  onClick={() => onNewChallenge(cat.id)}
                  className={`rounded-2xl bg-gradient-to-br ${cat.accent} p-3 text-left text-xs font-bold text-white shadow-lg transition-transform hover:scale-[1.03]`}
                >
                  <span className="text-xl">{cat.emoji}</span>
                  <span className="mt-1 block">{cat.label}</span>
                </button>
              ))}
            </div>

            {challenge && (
              <div className={`rounded-2xl border border-white/15 bg-gradient-to-br ${challenge.accent || 'from-pink-500/30 to-purple-600/30'} p-4 text-center`}>
                <div className="text-2xl">{challenge.emoji}</div>
                <div className="mt-1 text-[11px] font-bold uppercase tracking-wide text-pink-100/80">{challenge.label} challenge</div>
                <p className="mt-2 text-sm font-semibold text-white">“{challenge.prompt}”</p>
                {challenge.status === 'active' ? (
                  <div className="mt-3 flex gap-2">
                    <button
                      onClick={() => respondChallenge('done')}
                      className="flex-1 rounded-xl bg-emerald-500 py-2 text-xs font-bold text-white shadow-lg hover:bg-emerald-400"
                    >
                      ✓ I did it
                    </button>
                    <button
                      onClick={() => respondChallenge('skip')}
                      className="rounded-xl bg-white/10 px-3 py-2 text-xs font-semibold text-white hover:bg-white/20"
                    >
                      Skip
                    </button>
                  </div>
                ) : (
                  <div className="mt-3 flex gap-2">
                    <button
                      onClick={() => respondChallenge('accept')}
                      className="flex-1 rounded-xl bg-pink-500 py-2 text-xs font-bold text-white shadow-lg hover:bg-pink-400"
                    >
                      Accept
                    </button>
                    <button
                      onClick={() => respondChallenge('skip')}
                      className="rounded-xl bg-white/10 px-3 py-2 text-xs font-semibold text-white hover:bg-white/20"
                    >
                      Skip
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ---------- Gifts ---------- */}
        {page === PAGES.gifts && (
          <div className="flex flex-col gap-3">
            {fresh && (
              <div className="rounded-2xl border border-pink-400/40 bg-pink-500/15 p-3 text-center text-xs font-semibold text-pink-100">
                Sent {fresh.emoji} {fresh.label}! Love meter +{fresh.points} 💕
              </div>
            )}
            <div className="grid grid-cols-4 gap-2">
              {GIFTS.map((g) => (
                <button
                  key={g.id}
                  onClick={() => onSentGift(g)}
                  className="flex flex-col items-center gap-1 rounded-2xl border border-white/10 bg-white/5 p-3 transition-all hover:scale-105 hover:border-pink-400/50"
                >
                  <span className="text-2xl">{g.emoji}</span>
                  <span className="text-[9px] font-semibold text-slate-300">{g.label}</span>
                  <span className="text-[9px] text-pink-300">+{g.points}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ---------- Love Notes ---------- */}
        {page === PAGES.notes && (
          <div className="flex flex-col gap-3">
            <form onSubmit={submitNote} className="flex gap-2">
              <input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Write something from the heart…"
                className="min-w-0 flex-1 rounded-xl border border-purple-800/60 bg-[#0d0518] px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-pink-500"
              />
              <button type="submit" className="rounded-xl bg-pink-500 p-2 text-white shadow-lg hover:bg-pink-400">
                <Send className="h-4 w-4" />
              </button>
            </form>

            <div className="flex flex-col gap-2">
              {loveNotes.length === 0 && (
                <p className="rounded-2xl border border-dashed border-white/15 p-4 text-center text-xs text-slate-400">
                  No notes yet — send the first one 💌
                </p>
              )}
              {loveNotes.map((n) => (
                <div key={n.id} className="rounded-2xl border border-pink-400/20 bg-pink-500/10 p-3">
                  <div className="flex items-center gap-2 text-[10px] text-pink-300">
                    <Heart className="h-3 w-3 fill-pink-400 text-pink-400" />
                    <span className="font-bold">{n.senderName}</span>
                    <span className="text-slate-500">{n.time}</span>
                  </div>
                  <p className="mt-1 text-xs leading-relaxed text-pink-50">{n.text}</p>
                </div>
              ))}
              <div ref={notesEndRef} />
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}

// Quick emoji reaction rail for the footer.
export function ReactionRail({ onReact }) {
  return (
    <div className="flex items-center gap-1 rounded-2xl border border-white/10 bg-white/5 px-1.5 py-1 backdrop-blur-md">
      {REACTIONS.map((emoji) => (
        <button
          key={emoji}
          onClick={() => onReact(emoji)}
          className="rounded-lg px-1 py-0.5 text-lg transition-transform hover:scale-125"
        >
          {emoji}
        </button>
      ))}
    </div>
  );
}
