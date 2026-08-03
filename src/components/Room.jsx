// ---------------------------------------------------------------------------
// Room — layout + controls. All call logic lives in useCall(); all WebRTC in
// lib/webrtc.js. This file decides what goes where on which screen size.
//
// Layout rules:
//   * 1 partner  → their tile fills the stage, shaped by *their* camera.
//   * 2+         → responsive grid that keeps every tile's native aspect.
//   * Mobile     → controls become a thumb-reachable bar; panels are sheets.
// ---------------------------------------------------------------------------

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Mic, MicOff, Video, VideoOff, PhoneOff, MessageSquare, Sparkles, Copy, Check,
  MonitorUp, SwitchCamera, Camera, Hand, Users, Send, X, Heart, WifiOff, Volume2
} from 'lucide-react';

import { useCall } from '../hooks/useCall';
import { detectDeviceType, isHandheld } from '../lib/webrtc';
import VideoTile from './VideoTile';
import CouplePanel, { ReactionRail } from './CouplePanel';
import {
  LoveMeterBadge, FloatingReactions, GiftToast, ComboFlash, ChallengeBanner, MomentFlash
} from './Overlays';

export default function Room({ userConfig, onLeaveRoom }) {
  const { roomId, userName, avatar } = userConfig;
  const deviceType = useMemo(() => detectDeviceType(), []);
  const handheld = isHandheld(deviceType);

  const call = useCall({ ...userConfig, deviceType });

  const [panel, setPanel] = useState(null); // 'chat' | 'couple' | null
  const [copied, setCopied] = useState(false);
  const [handUp, setHandUp] = useState(false);
  const [chatInput, setChatInput] = useState('');
  const chatEndRef = useRef(null);

  const remote = call.participants;
  const solo = remote.length === 0;

  const { markChatOpen } = call;
  useEffect(() => {
    markChatOpen(panel === 'chat');
  }, [panel, markChatOpen]);

  useEffect(() => {
    if (panel === 'chat') chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [call.messages, panel]);

  const copyInvite = async () => {
    const link = `${window.location.origin}/?room=${roomId}`;
    try {
      await navigator.clipboard.writeText(link);
    } catch {
      // Clipboard API needs HTTPS; fall back to a prompt so the link is still copyable.
      window.prompt('Copy this invite link:', link);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const shareInvite = async () => {
    const link = `${window.location.origin}/?room=${roomId}`;
    if (navigator.share) {
      try {
        await navigator.share({ title: 'Join my OmniCall', text: 'Video call me on OmniCall 💕', url: link });
        return;
      } catch { /* user dismissed the sheet */ }
    }
    copyInvite();
  };

  const toggleHand = () => {
    const next = !handUp;
    setHandUp(next);
    call.raiseHand(next);
  };

  const submitChat = (e) => {
    e.preventDefault();
    if (!chatInput.trim()) return;
    call.sendMessage(chatInput);
    setChatInput('');
  };

  const latestGift = call.gifts.at(-1);

  return (
    <div
      className="relative flex h-screen-dvh w-full flex-col overflow-hidden bg-[#090314] text-slate-100"
      onClick={call.audioBlocked ? call.unlockAudio : undefined}
    >
      {/* ------------------------------- Header ------------------------------- */}
      <header className="z-30 flex h-14 shrink-0 items-center justify-between border-b border-white/10 bg-[#120722]/80 px-3 backdrop-blur-xl sm:px-4">
        <div className="flex min-w-0 items-center gap-2.5">
          <div className="rounded-xl bg-gradient-to-tr from-pink-500 to-purple-600 p-2 shadow-lg shadow-pink-500/30">
            <Heart className="h-4 w-4 fill-white text-white" />
          </div>
          <div className="min-w-0">
            <h2 className="flex items-center gap-2 truncate text-sm font-bold text-white">
              OmniCall
              <span className="rounded-md border border-pink-500/30 bg-pink-500/20 px-1.5 py-0.5 font-mono text-[10px] text-pink-300">
                {roomId}
              </span>
            </h2>
            <p className="flex items-center gap-1 text-[10px] text-pink-200/60">
              <Users className="h-3 w-3" />
              {remote.length + 1} in call
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {!handheld && <LoveMeterBadge value={call.loveMeter} />}
          <button
            onClick={handheld ? shareInvite : copyInvite}
            className="flex items-center gap-1.5 rounded-xl border border-pink-500/30 bg-white/5 px-2.5 py-1.5 text-xs font-semibold text-pink-200 transition-colors hover:bg-white/10"
          >
            {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
            <span className="hidden sm:inline">{copied ? 'Copied!' : 'Invite'}</span>
          </button>
        </div>
      </header>

      {/* ---------------------------- Status banners --------------------------- */}
      {!call.socketLive && (
        <Banner tone="amber" icon={WifiOff} text="Reconnecting to the server…" />
      )}
      {call.mediaError && (
        <Banner
          tone="rose"
          icon={VideoOff}
          text={call.mediaError}
          action={{ label: 'Retry', onClick: () => window.location.reload() }}
        />
      )}
      {call.audioBlocked && (
        <Banner tone="sky" icon={Volume2} text="Tap anywhere to enable sound" />
      )}

      {/* -------------------------------- Stage -------------------------------- */}
      <main className="relative flex min-h-0 flex-1">
        <section className="relative flex min-w-0 flex-1 items-center justify-center p-2 sm:p-4">
          {solo ? (
            <WaitingCard roomId={roomId} onShare={shareInvite} copied={copied} />
          ) : (
            <div
              className={`grid h-full w-full place-items-center gap-3 ${
                remote.length === 1
                  ? 'grid-cols-1'
                  : remote.length <= 4
                    ? 'grid-cols-1 sm:grid-cols-2'
                    : 'grid-cols-2 lg:grid-cols-3'
              }`}
            >
              {remote.map((user) => {
                const slot = call.media.get(user.socketId) || {};
                return (
                  <VideoTile
                    key={user.socketId}
                    user={user}
                    stream={slot.camera}
                    screenStream={slot.screen}
                    connState={call.states.get(user.socketId)}
                    stats={call.quality.get(user.socketId)}
                    onAudioBlocked={() => call.setAudioBlocked(true)}
                  />
                );
              })}
            </div>
          )}

          {/* Self preview — draggable-free PiP, sized by our own camera shape */}
          <div className="absolute bottom-3 right-3 z-20 w-24 sm:w-40">
            <VideoTile
              user={{ name: 'You', avatar, device: deviceType, micOn: call.micOn, videoOn: call.videoOn }}
              stream={call.localStream}
              isSelf
              compact
              mirror={call.facingMode === 'user'}
            />
          </div>

          {/* Overlays */}
          <FloatingReactions reactions={call.reactions} />
          {latestGift && <GiftToast gift={latestGift} />}
          {call.combo && <ComboFlash combo={call.combo} />}
          <ChallengeBanner challenge={call.challenge} onAccept={() => call.respondChallenge('accept')} />
          <MomentFlash name={call.momentFlash} />
        </section>

        {/* ----------------------- Desktop side panels ----------------------- */}
        {!handheld && panel === 'chat' && (
          <ChatPane
            messages={call.messages}
            selfId={call.selfId}
            value={chatInput}
            onChange={setChatInput}
            onSubmit={submitChat}
            onClose={() => setPanel(null)}
            endRef={chatEndRef}
          />
        )}
        {!handheld && panel === 'couple' && (
          <CouplePanel
            open
            onClose={() => setPanel(null)}
            loveMeter={call.loveMeter}
            scores={call.scores}
            challenge={call.challenge}
            gifts={call.gifts}
            loveNotes={call.loveNotes}
            sendGift={call.sendGift}
            sendLoveNote={call.sendLoveNote}
            offerChallenge={call.offerChallenge}
            respondChallenge={call.respondChallenge}
          />
        )}
      </main>

      {/* ---------------------- Mobile bottom sheet panels --------------------- */}
      {handheld && panel && (
        <div className="fixed inset-0 z-40 flex flex-col justify-end bg-black/60 backdrop-blur-sm" onClick={() => setPanel(null)}>
          <div
            className="animate-slide-up max-h-[78vh] overflow-hidden rounded-t-3xl border-t border-white/15 bg-[#150a29]"
            onClick={(e) => e.stopPropagation()}
          >
            {panel === 'chat' ? (
              <ChatPane
                mobile
                messages={call.messages}
                selfId={call.selfId}
                value={chatInput}
                onChange={setChatInput}
                onSubmit={submitChat}
                onClose={() => setPanel(null)}
                endRef={chatEndRef}
              />
            ) : (
              <CouplePanel
                open
                onClose={() => setPanel(null)}
                loveMeter={call.loveMeter}
                scores={call.scores}
                challenge={call.challenge}
                gifts={call.gifts}
                loveNotes={call.loveNotes}
                sendGift={call.sendGift}
                sendLoveNote={call.sendLoveNote}
                offerChallenge={call.offerChallenge}
                respondChallenge={call.respondChallenge}
              />
            )}
          </div>
        </div>
      )}

      {/* ------------------------------ Controls ------------------------------ */}
      <footer className="z-30 shrink-0 border-t border-white/10 bg-[#120722]/85 px-2 pb-[env(safe-area-inset-bottom)] pt-2 backdrop-blur-xl">
        {!handheld && (
          <div className="mb-2 flex justify-center">
            <ReactionRail onReact={call.sendReaction} />
          </div>
        )}

        <div className="flex items-center justify-center gap-1.5 pb-2 sm:gap-2.5">
          <CtrlButton
            active={call.micOn}
            onClick={call.toggleMic}
            on={Mic}
            off={MicOff}
            label={call.micOn ? 'Mute' : 'Unmute'}
          />
          <CtrlButton
            active={call.videoOn}
            onClick={call.toggleVideo}
            on={Video}
            off={VideoOff}
            label={call.videoOn ? 'Stop video' : 'Start video'}
          />

          {handheld ? (
            <CtrlButton active onClick={call.flipCamera} on={SwitchCamera} label="Flip camera" neutral />
          ) : (
            <CtrlButton
              active={!call.sharing}
              onClick={call.toggleScreenShare}
              on={MonitorUp}
              off={MonitorUp}
              label={call.sharing ? 'Stop sharing' : 'Share screen'}
              highlight={call.sharing}
            />
          )}

          <CtrlButton
            active
            neutral
            onClick={() => setPanel(panel === 'chat' ? null : 'chat')}
            on={MessageSquare}
            label="Chat"
            badge={call.unreadChat}
            selected={panel === 'chat'}
          />

          <CtrlButton
            active
            neutral
            onClick={() => setPanel(panel === 'couple' ? null : 'couple')}
            on={Sparkles}
            label="Couple mode"
            selected={panel === 'couple'}
            romantic
          />

          {!handheld && (
            <CtrlButton active={!handUp} neutral onClick={toggleHand} on={Hand} label="Raise hand" selected={handUp} />
          )}

          <CtrlButton active neutral onClick={call.captureMoment} on={Camera} label="Capture moment" />

          <button
            onClick={onLeaveRoom}
            className="ml-1 rounded-2xl bg-rose-600 p-3 text-white shadow-lg shadow-rose-600/40 transition-transform hover:scale-105 hover:bg-rose-500 sm:ml-2 sm:px-5"
            title="Leave call"
          >
            <PhoneOff className="h-5 w-5" />
          </button>
        </div>

        {handheld && (
          <div className="flex items-center justify-center gap-2 pb-2">
            <LoveMeterBadge value={call.loveMeter} />
            <ReactionRail onReact={call.sendReaction} />
          </div>
        )}
      </footer>
    </div>
  );
}

/* ------------------------------- sub-views -------------------------------- */

function CtrlButton({ active, onClick, on: OnIcon, off: OffIcon, label, neutral, highlight, selected, badge, romantic }) {
  const Icon = active || !OffIcon ? OnIcon : OffIcon;
  const tone = highlight
    ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/40'
    : selected
      ? romantic
        ? 'bg-gradient-to-tr from-pink-500 to-purple-600 text-white shadow-lg shadow-pink-500/40'
        : 'bg-pink-600 text-white shadow-lg shadow-pink-600/40'
      : neutral || active
        ? 'border border-white/15 bg-white/5 text-white hover:bg-white/15'
        : 'bg-rose-500 text-white shadow-lg shadow-rose-500/40';

  return (
    <button onClick={onClick} title={label} className={`relative rounded-2xl p-3 transition-all ${tone}`}>
      <Icon className="h-5 w-5" />
      {badge > 0 && (
        <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[9px] font-bold text-white">
          {badge > 9 ? '9+' : badge}
        </span>
      )}
    </button>
  );
}

function Banner({ tone, icon: Icon, text, action }) {
  const tones = {
    amber: 'border-amber-500/40 bg-amber-500/15 text-amber-200',
    rose: 'border-rose-500/40 bg-rose-500/15 text-rose-200',
    sky: 'border-sky-500/40 bg-sky-500/15 text-sky-200'
  };
  return (
    <div className={`z-30 flex shrink-0 items-center justify-between gap-3 border-b px-4 py-2 text-xs ${tones[tone]}`}>
      <span className="flex items-center gap-2">
        <Icon className="h-4 w-4 shrink-0" />
        {text}
      </span>
      {action && (
        <button onClick={action.onClick} className="rounded-md bg-white/15 px-2 py-1 font-bold hover:bg-white/25">
          {action.label}
        </button>
      )}
    </div>
  );
}

function WaitingCard({ roomId, onShare, copied }) {
  return (
    <div className="flex w-full max-w-lg flex-col items-center gap-4 rounded-3xl border border-white/15 bg-[#150a29]/80 p-8 text-center shadow-2xl backdrop-blur-xl">
      <div className="animate-pulse rounded-full border border-pink-500/40 bg-pink-500/20 p-4">
        <Heart className="h-9 w-9 fill-pink-400 text-pink-400" />
      </div>
      <div>
        <h3 className="text-xl font-extrabold text-white">Waiting for your partner…</h3>
        <p className="mt-1 text-xs text-pink-200/70">
          Share room code <strong className="font-mono text-pink-400">{roomId}</strong> to start the call
        </p>
      </div>
      <button
        onClick={onShare}
        className="btn-lovable-primary flex items-center gap-2 rounded-2xl px-6 py-3 text-sm font-bold text-white shadow-lg"
      >
        {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
        {copied ? 'Link copied!' : 'Share invite link'}
      </button>
    </div>
  );
}

function ChatPane({ messages, selfId, value, onChange, onSubmit, onClose, endRef, mobile }) {
  return (
    <div className={`flex flex-col ${mobile ? 'h-[60vh]' : 'h-full w-[320px] border-l border-white/10'} bg-[#150a29]/95 backdrop-blur-xl`}>
      <div className="flex items-center justify-between border-b border-white/10 p-4">
        <h3 className="flex items-center gap-2 text-sm font-bold text-white">
          <MessageSquare className="h-4 w-4 text-pink-400" /> Chat
        </h3>
        <button onClick={onClose} className="rounded-lg p-1 text-slate-400 hover:bg-white/10 hover:text-white">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto p-4">
        {messages.length === 0 && (
          <p className="rounded-2xl border border-dashed border-white/15 p-4 text-center text-xs text-slate-400">
            Say something sweet 💬
          </p>
        )}
        {messages.map((m) => {
          const mine = m.senderId === selfId;
          return (
            <div key={m.id} className={`flex flex-col ${mine ? 'items-end' : 'items-start'}`}>
              <div className="mb-1 flex items-center gap-1.5 text-[10px]">
                <span className="font-bold text-pink-300">{mine ? 'You' : m.senderName}</span>
                <span className="text-slate-500">{m.time}</span>
              </div>
              <div
                className={`max-w-[85%] rounded-2xl px-3 py-2 text-xs leading-relaxed shadow-md ${
                  mine ? 'rounded-tr-none bg-gradient-to-br from-pink-600 to-purple-600 text-white' : 'rounded-tl-none bg-white/10 text-slate-100'
                }`}
              >
                {m.text}
              </div>
            </div>
          );
        })}
        <div ref={endRef} />
      </div>

      <form onSubmit={onSubmit} className="flex gap-2 border-t border-white/10 p-3">
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Type a message…"
          className="min-w-0 flex-1 rounded-xl border border-purple-800/60 bg-[#0d0518] px-3 py-2 text-xs text-white placeholder-slate-500 focus:border-pink-500 focus:outline-none"
        />
        <button type="submit" className="rounded-xl bg-pink-500 p-2 text-white shadow-lg hover:bg-pink-400">
          <Send className="h-4 w-4" />
        </button>
      </form>
    </div>
  );
}
