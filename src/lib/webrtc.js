// ---------------------------------------------------------------------------
// OmniCall — WebRTC engine (perfect negotiation + dynamic transceivers)
//
// Why this exists: the previous implementation let both peers create an offer
// at the same time and then had each side *ignore* the other's offer. Both
// ended up stuck in "have-local-offer" waiting for an answer that never came,
// so neither user ever saw video. That is the classic glare deadlock.
//
// This engine uses "perfect negotiation":
//   * Politeness is derived from the two socket ids, so both sides always
//     agree on who yields — exactly one peer is polite.
//   * On a collision the polite peer rolls back its own offer and answers the
//     other one; the impolite peer ignores the incoming offer and keeps going.
//   * ICE candidates are queued until a remote description exists.
//   * Screen sharing / ICE restarts renegotiate through the same path.
// ---------------------------------------------------------------------------

export const MAX_VIDEO_BITRATE = 2_500_000;

export const ICE_SERVERS = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun3.l.google.com:19302' },
    { urls: 'stun:stun4.l.google.com:19302' },
    { urls: 'stun:global.stun.twilio.com:3478' },
    { urls: 'stun:stun.cloudflare.com:3478' },
    {
      urls: [
        'turn:openrelay.metered.ca:80',
        'turn:openrelay.metered.ca:443',
        'turn:openrelay.metered.ca:443?transport=tcp',
        'turns:openrelay.metered.ca:443?transport=tcp'
      ],
      username: 'openrelay',
      credential: 'openrelay'
    }
  ],
  iceCandidatePoolSize: 4,
  bundlePolicy: 'max-bundle',
  rtcpMuxPolicy: 'require'
};

export function webRTCSupported() {
  return typeof window !== 'undefined' && typeof window.RTCPeerConnection === 'function';
}

export function detectDeviceType() {
  if (typeof navigator === 'undefined') return 'desktop';
  const ua = navigator.userAgent || '';
  const touch = typeof navigator.maxTouchPoints === 'number' ? navigator.maxTouchPoints : 0;
  if (/iPad/i.test(ua) || (/Macintosh/i.test(ua) && touch > 1)) return 'tablet';
  if (/Android|iPhone|iPod|Mobi|Opera Mini|IEMobile/i.test(ua)) return 'mobile';
  return 'desktop';
}

export function isHandheld(deviceType) {
  return deviceType === 'mobile' || deviceType === 'tablet';
}

/** Portrait sensor constraints for phones, landscape for desktops. */
export function getVideoConstraints(deviceType, facingMode = 'user') {
  if (isHandheld(deviceType)) {
    return {
      width: { ideal: 720, max: 1280 },
      height: { ideal: 1280, max: 1920 },
      facingMode,
      frameRate: { ideal: 30, max: 30 }
    };
  }
  return {
    width: { ideal: 1280, max: 1920 },
    height: { ideal: 720, max: 1080 },
    frameRate: { ideal: 30, max: 30 }
  };
}

export const AUDIO_CONSTRAINTS = {
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true
};

/** Read a track's natural orientation; returns 'portrait' | 'landscape' | null. */
export function getTrackOrientation(track) {
  if (!track) return null;
  try {
    const s = track.getSettings?.() || {};
    if (s.width && s.height) return s.height >= s.width ? 'portrait' : 'landscape';
  } catch (_e) {
    /* remote tracks may not expose settings */
  }
  return null;
}

/**
 * Acquire local media with graceful degradation:
 * full → audio-only → video-only → empty. A call never dies because one
 * device is missing or blocked.
 */
export async function getLocalMedia(deviceType, facingMode = 'user') {
  const video = getVideoConstraints(deviceType, facingMode);
  const attempts = [
    { video, audio: AUDIO_CONSTRAINTS },
    { video: true, audio: true },
    { video: false, audio: AUDIO_CONSTRAINTS },
    { video: true, audio: false }
  ];

  let lastError = null;
  for (const constraints of attempts) {
    try {
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      return {
        stream,
        error: null,
        hasVideo: stream.getVideoTracks().length > 0,
        hasAudio: stream.getAudioTracks().length > 0
      };
    } catch (err) {
      lastError = err;
    }
  }

  return {
    stream: new MediaStream(),
    error: lastError,
    hasVideo: false,
    hasAudio: false
  };
}

export class PeerSession {
  /**
   * @param {object} opts
   * @param {string} opts.socketId          remote peer's socket id
   * @param {string} opts.selfId            our own socket id (decides politeness)
   * @param {MediaStream} opts.localStream
   * @param {(payload: object) => void} opts.sendSignal
   * @param {(info: {track: MediaStreamTrack, stream: MediaStream, kind: 'camera'|'screen'}) => void} opts.onTrack
   * @param {(state: string) => void} [opts.onState]  connection state changes
   * @param {(msg: string) => void} [opts.onDebug]
   */
  constructor({ socketId, selfId, localStream, sendSignal, onTrack, onState, onDebug }) {
    this.socketId = socketId;
    this.selfId = selfId;
    this.localStream = localStream;
    this.sendSignal = sendSignal;
    this.onTrack = onTrack;
    this.onState = onState || (() => {});
    this.onDebug = onDebug || (() => {});

    // Both sides compute this from the same two ids, so exactly one is polite.
    this.polite = String(selfId) > String(socketId);

    this.makingOffer = false;
    this.ignoreOffer = false;
    this.pendingCandidates = [];
    this.closed = false;
    this.iceRestarts = 0;

    this.localScreenTrackId = null; // screen track *we* send
    this.remoteScreenTrackId = null; // screen track the peer told us about
    this.screenSender = null;

    this.pc = new RTCPeerConnection(ICE_SERVERS);

    this.pc.onicecandidate = (e) => {
      if (e.candidate && !this.closed) this.sendSignal({ to: this.socketId, candidate: e.candidate });
    };

    // Any track change (screen share, re-enabled camera) renegotiates here.
    this.pc.onnegotiationneeded = () => {
      this.negotiate().catch((err) => this.onDebug(`negotiationneeded: ${err.message}`));
    };

    this.pc.ontrack = (e) => {
      const kind = this.remoteScreenTrackId && e.track.id === this.remoteScreenTrackId ? 'screen' : 'camera';
      const stream = e.streams[0] || new MediaStream([e.track]);
      this.onTrack({ track: e.track, stream, kind });
    };

    this.pc.oniceconnectionstatechange = () => {
      const state = this.pc.iceConnectionState;
      this.onState(state);
      if (state === 'failed' && this.iceRestarts < 3) {
        this.iceRestarts += 1;
        this.onDebug(`ICE failed → restart #${this.iceRestarts} for ${this.socketId}`);
        try {
          this.pc.restartIce();
        } catch (_e) {
          /* closed mid-restart */
        }
      }
    };

    this.pc.onconnectionstatechange = () => {
      this.onState(this.pc.connectionState);
    };

    this.attachLocalTracks();
  }

  get connectionState() {
    return this.closed ? 'closed' : this.pc.connectionState;
  }

  /**
   * Always publish one audio + one video m-line. Tracks are added even when
   * muted (we toggle `track.enabled` instead) so toggling mic/camera never
   * needs a renegotiation. Missing devices still get a recvonly transceiver so
   * we can receive the partner's media.
   */
  attachLocalTracks() {
    const audio = this.localStream?.getAudioTracks?.()[0];
    const video = this.localStream?.getVideoTracks?.()[0];

    if (audio) this.pc.addTrack(audio, this.localStream);
    else this.pc.addTransceiver('audio', { direction: 'recvonly' });

    if (video) this.pc.addTrack(video, this.localStream);
    else this.pc.addTransceiver('video', { direction: 'recvonly' });
  }

  /** Replace the outgoing camera track in place (camera flip, re-enable). */
  async replaceVideoTrack(track) {
    const sender = this.pc.getSenders().find((s) => s.track?.kind === 'video' && s !== this.screenSender);
    if (sender) {
      await sender.replaceTrack(track);
    } else if (track) {
      this.pc.addTrack(track, this.localStream);
    }
  }

  async replaceAudioTrack(track) {
    const sender = this.pc.getSenders().find((s) => s.track?.kind === 'audio');
    if (sender) await sender.replaceTrack(track);
    else if (track) this.pc.addTrack(track, this.localStream);
  }

  /** Create and send an offer. Safe to call repeatedly. */
  async negotiate() {
    if (this.closed) return;
    if (this.pc.signalingState !== 'stable') {
      this.onDebug(`negotiate deferred — state=${this.pc.signalingState}`);
      return;
    }
    try {
      this.makingOffer = true;
      await this.pc.setLocalDescription();
      this.sendSignal({ to: this.socketId, description: this.pc.localDescription });
    } catch (err) {
      this.onDebug(`offer failed (${this.socketId}): ${err.message}`);
    } finally {
      this.makingOffer = false;
    }
  }

  /** Handle both SDP and ICE arriving on the unified signal channel. */
  async handleSignal({ description, candidate }) {
    if (this.closed) return;

    if (description) {
      const collision =
        description.type === 'offer' && (this.makingOffer || this.pc.signalingState !== 'stable');

      this.ignoreOffer = !this.polite && collision;
      if (this.ignoreOffer) {
        this.onDebug(`glare: impolite side ignores offer from ${this.socketId}`);
        return;
      }

      try {
        if (collision) {
          // Polite peer yields: drop our own offer, then take theirs.
          this.onDebug(`glare: polite side rolls back for ${this.socketId}`);
          await this.pc.setLocalDescription({ type: 'rollback' }).catch(() => {});
        }

        await this.pc.setRemoteDescription(description);
        await this.flushCandidates();

        if (description.type === 'offer') {
          await this.pc.setLocalDescription();
          this.sendSignal({ to: this.socketId, description: this.pc.localDescription });
        }
      } catch (err) {
        this.onDebug(`setRemoteDescription failed (${this.socketId}): ${err.message}`);
      }
      return;
    }

    if (candidate) {
      if (this.pc.remoteDescription) {
        try {
          await this.pc.addIceCandidate(candidate);
        } catch (err) {
          if (!this.ignoreOffer) this.onDebug(`ICE rejected (${this.socketId}): ${err.message}`);
        }
      } else {
        this.pendingCandidates.push(candidate);
        if (this.pendingCandidates.length > 150) this.pendingCandidates.shift();
      }
    }
  }

  async flushCandidates() {
    if (!this.pendingCandidates.length) return;
    const queued = this.pendingCandidates.splice(0);
    for (const c of queued) {
      try {
        await this.pc.addIceCandidate(c);
      } catch (_e) {
        /* stale after renegotiation — safe to drop */
      }
    }
  }

  /** Publish a screen-share track; returns its id so the peer can label it. */
  async addScreenTrack(track, stream) {
    if (this.closed || !track) return null;
    this.localScreenTrackId = track.id;
    this.screenSender = this.pc.addTrack(track, stream);
    return track.id;
  }

  async removeScreenTrack() {
    if (this.closed || !this.screenSender) return;
    try {
      this.pc.removeTrack(this.screenSender);
    } catch (_e) {
      /* sender already gone */
    }
    this.screenSender = null;
    this.localScreenTrackId = null;
  }

  /** Tell this session which incoming track id is the partner's screen. */
  setRemoteScreenTrackId(trackId) {
    this.remoteScreenTrackId = trackId || null;
  }

  /** Keep bitrate sane so weak mobile uplinks do not collapse the call. */
  applySenderLimits() {
    this.pc.getSenders?.().forEach((sender) => {
      if (sender.track?.kind !== 'video') return;
      try {
        const params = sender.getParameters();
        params.encodings = params.encodings?.length ? params.encodings : [{}];
        params.encodings.forEach((e) => {
          e.maxBitrate = MAX_VIDEO_BITRATE;
          e.maxFramerate = 30;
        });
        sender.setParameters(params).catch(() => {});
      } catch (_e) {
        /* unsupported on some browsers */
      }
    });
  }

  /** Inbound video bitrate + frame size, used for the quality badge. */
  async readStats(previous) {
    if (this.closed) return null;
    try {
      const stats = await this.pc.getStats();
      let bytes = 0;
      let timestamp = 0;
      let width = 0;
      let height = 0;
      let packetsLost = 0;

      stats.forEach((r) => {
        if (r.type === 'inbound-rtp' && (r.kind === 'video' || r.mediaType === 'video')) {
          bytes += r.bytesReceived || 0;
          timestamp = r.timestamp || timestamp;
          packetsLost += r.packetsLost || 0;
          if (r.frameWidth) width = r.frameWidth;
          if (r.frameHeight) height = r.frameHeight;
        }
        if (r.type === 'track' && r.frameWidth) {
          width = width || r.frameWidth;
          height = height || r.frameHeight;
        }
      });

      let kbps = 0;
      if (previous && previous.timestamp && timestamp > previous.timestamp) {
        kbps = Math.round(((bytes - previous.bytes) * 8) / (timestamp - previous.timestamp));
      }

      return { bytes, timestamp, kbps, width, height, packetsLost };
    } catch (_e) {
      return null;
    }
  }

  close() {
    if (this.closed) return;
    this.closed = true;
    try {
      this.pc.getSenders().forEach((s) => {
        try {
          s.replaceTrack(null);
        } catch (_e) {
          /* ignore */
        }
      });
      this.pc.close();
    } catch (_e) {
      /* already closed */
    }
  }
}
