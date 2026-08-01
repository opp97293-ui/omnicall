import React, { useState } from 'react';
import { X, Copy, Check, QrCode, Link2, Share2 } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';

export default function InviteModal({ roomId, onClose }) {
  const [copied, setCopied] = useState(false);
  const [showQR, setShowQR] = useState(false);

  const inviteUrl = `${window.location.origin}/?room=${roomId}`;

  const handleCopy = () => {
    navigator.clipboard.writeText(inviteUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-fade-in">
      <div className="w-full max-w-md p-6 rounded-3xl glass-panel border border-white/10 shadow-2xl relative flex flex-col gap-5">
        
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-indigo-300 font-bold">
            <Share2 className="w-5 h-5" />
            <span>Invite Participants</span>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <p className="text-xs text-slate-400">
          Share this link or room code with anyone you want to join your video call.
        </p>

        {/* Room Code Badge */}
        <div className="p-3 rounded-2xl glass-card border border-indigo-500/20 text-center">
          <span className="text-[10px] uppercase font-bold tracking-widest text-slate-400 block mb-1">Room Code</span>
          <span className="text-2xl font-mono font-extrabold text-indigo-400 tracking-wider">{roomId}</span>
        </div>

        {/* Copy Link Input */}
        <div className="flex items-center gap-2 bg-slate-900/90 border border-slate-700/80 rounded-xl p-2">
          <Link2 className="w-4 h-4 text-slate-400 ml-2" />
          <input
            type="text"
            readOnly
            value={inviteUrl}
            className="flex-1 bg-transparent text-xs text-slate-200 focus:outline-none"
          />
          <button
            onClick={handleCopy}
            className={`px-3 py-2 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all ${
              copied 
                ? 'bg-emerald-600 text-white' 
                : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-md'
            }`}
          >
            {copied ? (
              <>
                <Check className="w-3.5 h-3.5" />
                <span>Copied!</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" />
                <span>Copy</span>
              </>
            )}
          </button>
        </div>

        {/* QR Code Toggle */}
        <div className="flex flex-col items-center gap-3 pt-2">
          <button
            type="button"
            onClick={() => setShowQR(!showQR)}
            className="text-xs font-medium text-indigo-300 hover:text-indigo-200 flex items-center gap-1.5"
          >
            <QrCode className="w-4 h-4" />
            <span>{showQR ? "Hide QR Code" : "Show QR Code for Mobile"}</span>
          </button>

          {showQR && (
            <div className="p-4 bg-white rounded-2xl shadow-xl animate-fade-in my-2">
              <QRCodeSVG value={inviteUrl} size={160} />
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
