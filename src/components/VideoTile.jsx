// ---------------------------------------------------------------------------
// VideoTile — a single participant.
//
// The tile shape follows the *sender's* camera, not the viewer's screen: a
// partner calling from a phone renders as a tall phone-shaped tile on desktop,
// and a desktop partner renders wide on a phone. We read the real frame size
// off the <video> element (`videoWidth`/`videoHeight`) and drive `aspectRatio`
// from it, so it stays correct even when the phone is rotated mid-call.
// ---------------------------------------------------------------------------

import React, { useEffect, useRef, useState } from 'react';
import { Hand, MicOff, MonitorUp, Signal, Smartphone, Monitor, Tablet } from 'lucide-react';

const DEVICE_ICON = { mobile: Smartphone, tablet: Tablet, desktop: Monitor };

export default function VideoTile({
  user,
  stream,
  screenStream,
  connState,
  stats,
  isSelf = false,
  mirror = false,
  compact = false,
  onAudioBlocked
}) {
  const videoRef = useRef(null);
  const [aspect, setAspect] = useState(16 / 9);
  const [hasFrames, setHasFrames] = useState(false);

  // Screen share takes over the tile while it is active.
  const active = screenStream || stream;
  const showingScreen = !!screenStream;

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return undefined;

    if (el.srcObject !== active) {
      el.srcObject = active || null;
      setHasFrames(false);
    }
    if (!active) return undefined;

    const readSize = () => {
      if (el.videoWidth && el.videoHeight) {
        setAspect(el.videoWidth / el.videoHeight);
        setHasFrames(true);
      }
    };

    // `resize` fires on rotation and on resolution changes mid-call.
    el.addEventListener('loadedmetadata', readSize);
    el.addEventListener('resize', readSize);
    readSize();

    const play = el.play();
    if (play?.catch) {
      play.catch(() => {
        // Autoplay with sound needs a gesture on iOS/Safari.
        if (!isSelf) onAudioBlocked?.();
      });
    }

    return () => {
      el.removeEventListener('loadedmetadata', readSize);
      el.removeEventListener('resize', readSize);
    };
  }, [active, isSelf, onAudioBlocked]);

  const portrait = aspect < 0.95;
  const cameraOff = user?.videoOn === false;
  const live = hasFrames && !cameraOff;
  const connected = connState === 'connected' || connState === 'completed';
  const DeviceIcon = DEVICE_ICON[user?.device] || Monitor;

  const kbps = stats?.kbps || 0;
  const bars = kbps > 900 ? 3 : kbps > 350 ? 2 : kbps > 0 ? 1 : 0;
  const barTone = bars >= 3 ? 'text-emerald-400' : bars === 2 ? 'text-amber-400' : 'text-rose-400';

  return (
    <div
      className={`relative overflow-hidden bg-[#120722] shadow-2xl ring-1 transition-all duration-500 ${
        compact ? 'rounded-2xl ring-pink-500/40' : 'rounded-3xl ring-white/10'
      } ${portrait && !compact ? 'h-full max-h-full' : 'w-full'}`}
      style={{
        aspectRatio: showingScreen ? '16 / 9' : aspect,
        // Portrait tiles stay phone-shaped instead of stretching across the grid.
        maxWidth: portrait && !compact ? 'min(100%, 46vh)' : undefined
      }}
    >
      <video
        ref={videoRef}
        autoPlay
        playsInline
        webkit-playsinline="true"
        // Only our own preview is muted — muting a remote tile would kill audio.
        muted={isSelf}
        className={`h-full w-full transition-opacity duration-500 ${
          showingScreen ? 'object-contain bg-black' : 'object-cover'
        } ${live ? 'opacity-100' : 'opacity-0'} ${mirror && !showingScreen ? '-scale-x-100' : ''}`}
      />

      {/* Placeholder while connecting or when the camera is off */}
      {!live && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-gradient-to-br from-[#1b0d33] via-[#150a29] to-[#0d0518] p-4 text-center">
          <div className="relative">
            <img
              src={user?.avatar}
              alt={user?.name || 'Participant'}
              className={`rounded-full border border-pink-500/40 bg-[#0d0518] p-1 shadow-lg ${
                compact ? 'h-10 w-10' : 'h-20 w-20'
              }`}
            />
            {!connected && !isSelf && (
              <span className="absolute inset-0 animate-ping rounded-full border-2 border-pink-500/50" />
            )}
          </div>
          {!compact && (
            <>
              <span className="text-sm font-semibold text-pink-100">{user?.name}</span>
              <span className="rounded-full border border-pink-500/30 bg-pink-500/10 px-3 py-1 text-[11px] text-pink-200">
                {isSelf
                  ? 'Camera off'
                  : cameraOff
                    ? 'Camera off'
                    : connected
                      ? 'Waiting for video…'
                      : 'Connecting…'}
              </span>
            </>
          )}
        </div>
      )}

      {/* Bottom-left identity chip */}
      <div className="pointer-events-none absolute bottom-2 left-2 flex max-w-[85%] items-center gap-1.5 rounded-xl border border-white/15 bg-black/55 px-2.5 py-1 backdrop-blur-md">
        <DeviceIcon className="h-3.5 w-3.5 shrink-0 text-pink-300" />
        <span className={`truncate font-semibold text-white ${compact ? 'text-[10px]' : 'text-xs'}`}>
          {isSelf ? 'You' : user?.name}
        </span>
        {user?.micOn === false && <MicOff className="h-3.5 w-3.5 shrink-0 text-rose-400" />}
        {showingScreen && <MonitorUp className="h-3.5 w-3.5 shrink-0 text-emerald-400" />}
      </div>

      {/* Top-right live stats */}
      {!isSelf && !compact && (
        <div className="pointer-events-none absolute right-2 top-2 flex items-center gap-1.5 rounded-xl border border-white/15 bg-black/55 px-2 py-1 backdrop-blur-md">
          <Signal className={`h-3.5 w-3.5 ${barTone}`} />
          <span className="text-[10px] font-semibold text-white/90">
            {stats?.width ? `${stats.width}×${stats.height}` : '—'}
          </span>
        </div>
      )}

      {user?.raisedHand && (
        <div className="absolute right-2 top-2 animate-bounce rounded-xl bg-amber-400/90 p-1.5 shadow-lg">
          <Hand className="h-4 w-4 text-black" />
        </div>
      )}

      {portrait && !compact && !showingScreen && (
        <div className="pointer-events-none absolute left-2 top-2 rounded-lg border border-pink-400/30 bg-pink-500/15 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-pink-200 backdrop-blur-md">
          Phone
        </div>
      )}
    </div>
  );
}
