import React, { useState, useEffect, useRef } from 'react';
import { X, Send, Mic, MicOff, Video, VideoOff, Hand, ShieldCheck, Smile } from 'lucide-react';

export default function ChatPanel({
  activePanel,
  messages,
  participants,
  currentUserId,
  onSendMessage,
  onClose
}) {
  const [inputText, setInputText] = useState('');
  const messagesEndRef = useRef(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!inputText.trim()) return;
    onSendMessage(inputText.trim());
    setInputText('');
  };

  if (!activePanel) return null;

  return (
    <div className="w-full md:w-80 h-full glass-panel border-l border-white/10 flex flex-col shadow-2xl z-40 animate-slide-in">
      
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-white/10">
        <h3 className="font-bold text-slate-100 flex items-center gap-2 text-base">
          {activePanel === 'chat' ? 'In-Call Chat' : `Participants (${participants.length})`}
        </h3>
        <button
          onClick={onClose}
          className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* CHAT TAB CONTENT */}
      {activePanel === 'chat' && (
        <div className="flex-1 flex flex-col h-full overflow-hidden">
          {/* Messages list */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {messages.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center p-4 text-slate-500">
                <Smile className="w-8 h-8 mb-2 stroke-1" />
                <p className="text-xs font-medium">No messages yet.</p>
                <p className="text-[10px] text-slate-600 mt-1">Start the conversation with your team!</p>
              </div>
            ) : (
              messages.map((msg) => {
                const isMe = msg.senderId === currentUserId;
                return (
                  <div key={msg.id} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                    <div className="flex items-center gap-1.5 mb-1">
                      <span className="text-[10px] font-semibold text-slate-400">{msg.senderName}</span>
                      <span className="text-[9px] text-slate-500">{msg.time}</span>
                    </div>
                    <div
                      className={`max-w-[85%] px-3.5 py-2.5 rounded-2xl text-xs leading-relaxed shadow-sm ${
                        isMe
                          ? 'bg-indigo-600 text-white rounded-tr-none'
                          : 'glass-card border border-white/10 text-slate-200 rounded-tl-none'
                      }`}
                    >
                      {msg.text}
                    </div>
                  </div>
                );
              })
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Chat Input form */}
          <form onSubmit={handleSubmit} className="p-3 border-t border-white/10 flex gap-2">
            <input
              type="text"
              placeholder="Type a message..."
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              className="flex-1 bg-slate-900/90 border border-slate-700/70 focus:border-indigo-500 rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none placeholder-slate-500"
            />
            <button
              type="submit"
              disabled={!inputText.trim()}
              className="p-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white transition-all shadow-md shadow-indigo-600/30"
            >
              <Send className="w-4 h-4" />
            </button>
          </form>
        </div>
      )}

      {/* PARTICIPANTS TAB CONTENT */}
      {activePanel === 'participants' && (
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {participants.map((user) => (
            <div
              key={user.socketId}
              className="flex items-center justify-between p-3 rounded-xl glass-card border border-white/5"
            >
              <div className="flex items-center gap-3">
                <div className="relative">
                  <img
                    src={user.avatar || `https://api.dicebear.com/7.x/bottts/svg?seed=${user.socketId}`}
                    alt="Avatar"
                    className="w-9 h-9 rounded-lg bg-slate-900 border border-indigo-500/30 p-0.5"
                  />
                  {user.raisedHand && (
                    <span className="absolute -top-1 -right-1 p-0.5 bg-amber-500 text-slate-950 rounded-full text-[10px] shadow-sm">
                      ✋
                    </span>
                  )}
                </div>
                <div>
                  <div className="flex items-center gap-1.5">
                    <p className="text-xs font-semibold text-slate-200">
                      {user.name} {user.socketId === currentUserId && '(You)'}
                    </p>
                  </div>
                  <p className="text-[10px] text-slate-500">Joined {user.joinedAt || 'recently'}</p>
                </div>
              </div>

              {/* Status indicators */}
              <div className="flex items-center gap-2">
                <span className={`p-1 rounded-md ${user.micOn ? 'text-slate-400' : 'text-red-400 bg-red-500/10'}`}>
                  {user.micOn ? <Mic className="w-3.5 h-3.5" /> : <MicOff className="w-3.5 h-3.5" />}
                </span>
                <span className={`p-1 rounded-md ${user.videoOn ? 'text-slate-400' : 'text-red-400 bg-red-500/10'}`}>
                  {user.videoOn ? <Video className="w-3.5 h-3.5" /> : <VideoOff className="w-3.5 h-3.5" />}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

    </div>
  );
}
