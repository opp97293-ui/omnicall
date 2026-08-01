import React, { useState } from 'react';
import { 
  Mic, MicOff, Video, VideoOff, Monitor, MonitorOff, 
  MessageSquare, Users, Smile, Hand, PhoneOff, Share2, CircleDot
} from 'lucide-react';

export default function Controls({
  micOn,
  videoOn,
  isScreenSharing,
  isRecording,
  raisedHand,
  activePanel,
  unreadCount,
  participantCount,
  onToggleMic,
  onToggleVideo,
  onToggleScreenShare,
  onToggleRecording,
  onToggleRaiseHand,
  onSendReaction,
  onTogglePanel,
  onOpenInvite,
  onLeaveCall
}) {
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);

  const emojis = ['❤️', '👍', '👏', '🎉', '🔥', '😮', '😂', '👋'];

  const handleEmojiClick = (emoji) => {
    onSendReaction(emoji);
    setShowEmojiPicker(false);
  };

  return (
    <div className="relative flex items-center justify-center gap-1.5 md:gap-3 p-2.5 md:p-3 rounded-2xl glass-panel border border-white/10 shadow-2xl backdrop-blur-xl max-w-full overflow-x-auto">
      
      {/* Emoji Picker */}
      {showEmojiPicker && (
        <div className="absolute bottom-full mb-3 left-1/2 -translate-x-1/2 flex items-center gap-1.5 p-2 rounded-2xl glass-panel border border-indigo-500/30 shadow-2xl animate-fade-in z-50">
          {emojis.map((emoji) => (
            <button
              key={emoji}
              onClick={() => handleEmojiClick(emoji)}
              className="p-1.5 text-lg md:text-xl hover:scale-125 transition-transform hover:bg-white/10 rounded-xl"
            >
              {emoji}
            </button>
          ))}
        </div>
      )}

      {/* Mic Button */}
      <button
        onClick={onToggleMic}
        className={`p-2.5 md:p-3.5 rounded-xl transition-all duration-200 flex items-center justify-center ${
          micOn 
            ? 'glass-button text-slate-200 hover:text-white' 
            : 'bg-red-500/90 text-white shadow-lg shadow-red-500/30 hover:bg-red-600'
        }`}
        title={micOn ? "Mute Microphone" : "Unmute Microphone"}
      >
        {micOn ? <Mic className="w-4 h-4 md:w-5 md:h-5" /> : <MicOff className="w-4 h-4 md:w-5 md:h-5" />}
      </button>

      {/* Video Button */}
      <button
        onClick={onToggleVideo}
        className={`p-2.5 md:p-3.5 rounded-xl transition-all duration-200 flex items-center justify-center ${
          videoOn 
            ? 'glass-button text-slate-200 hover:text-white' 
            : 'bg-red-500/90 text-white shadow-lg shadow-red-500/30 hover:bg-red-600'
        }`}
        title={videoOn ? "Turn off Camera" : "Turn on Camera"}
      >
        {videoOn ? <Video className="w-4 h-4 md:w-5 md:h-5" /> : <VideoOff className="w-4 h-4 md:w-5 md:h-5" />}
      </button>

      {/* Screen Share Button */}
      <button
        onClick={onToggleScreenShare}
        className={`p-2.5 md:p-3.5 rounded-xl transition-all duration-200 flex items-center justify-center hidden sm:flex ${
          isScreenSharing 
            ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30' 
            : 'glass-button text-slate-200 hover:text-white'
        }`}
        title={isScreenSharing ? "Stop Sharing Screen" : "Share Screen"}
      >
        {isScreenSharing ? <MonitorOff className="w-4 h-4 md:w-5 md:h-5" /> : <Monitor className="w-4 h-4 md:w-5 md:h-5" />}
      </button>

      {/* Live Reaction Button */}
      <button
        onClick={() => setShowEmojiPicker(!showEmojiPicker)}
        className={`p-2.5 md:p-3.5 rounded-xl transition-all duration-200 flex items-center justify-center ${
          showEmojiPicker ? 'bg-indigo-600/30 border border-indigo-500/50 text-indigo-300' : 'glass-button text-slate-200 hover:text-white'
        }`}
        title="Send Reaction Emoji"
      >
        <Smile className="w-4 h-4 md:w-5 md:h-5" />
      </button>

      {/* Raise Hand Button */}
      <button
        onClick={onToggleRaiseHand}
        className={`p-2.5 md:p-3.5 rounded-xl transition-all duration-200 flex items-center justify-center ${
          raisedHand 
            ? 'bg-amber-500 text-slate-950 font-bold shadow-lg shadow-amber-500/30' 
            : 'glass-button text-slate-200 hover:text-white'
        }`}
        title={raisedHand ? "Lower Hand" : "Raise Hand"}
      >
        <Hand className="w-4 h-4 md:w-5 md:h-5" />
      </button>

      {/* Call Recorder */}
      <button
        onClick={onToggleRecording}
        className={`p-2.5 md:p-3.5 rounded-xl transition-all duration-200 flex items-center justify-center hidden md:flex ${
          isRecording 
            ? 'bg-red-600 animate-pulse text-white shadow-lg shadow-red-600/40' 
            : 'glass-button text-slate-200 hover:text-white'
        }`}
        title={isRecording ? "Stop Recording" : "Record Meeting"}
      >
        <CircleDot className={`w-4 h-4 md:w-5 md:h-5 ${isRecording ? 'text-white' : 'text-red-400'}`} />
      </button>

      <div className="h-5 w-[1px] bg-white/10 mx-0.5"></div>

      {/* Chat Drawer Toggle */}
      <button
        onClick={() => onTogglePanel(activePanel === 'chat' ? null : 'chat')}
        className={`relative p-2.5 md:p-3.5 rounded-xl transition-all duration-200 flex items-center justify-center ${
          activePanel === 'chat' ? 'glass-button-active' : 'glass-button text-slate-200 hover:text-white'
        }`}
        title="In-call Chat"
      >
        <MessageSquare className="w-4 h-4 md:w-5 md:h-5" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 w-4 h-4 bg-indigo-500 text-white font-bold text-[9px] rounded-full flex items-center justify-center shadow-md animate-bounce">
            {unreadCount}
          </span>
        )}
      </button>

      {/* Participants Drawer Toggle */}
      <button
        onClick={() => onTogglePanel(activePanel === 'participants' ? null : 'participants')}
        className={`relative p-2.5 md:p-3.5 rounded-xl transition-all duration-200 flex items-center justify-center ${
          activePanel === 'participants' ? 'glass-button-active' : 'glass-button text-slate-200 hover:text-white'
        }`}
        title="Participants"
      >
        <Users className="w-4 h-4 md:w-5 md:h-5" />
        <span className="ml-1 text-[11px] font-semibold text-slate-300">{participantCount}</span>
      </button>

      {/* Invite Modal Button */}
      <button
        onClick={onOpenInvite}
        className="p-2.5 md:p-3.5 rounded-xl glass-button text-indigo-300 hover:text-white transition-all flex items-center justify-center"
        title="Invite People"
      >
        <Share2 className="w-4 h-4 md:w-5 md:h-5" />
      </button>

      {/* Leave / End Call */}
      <button
        onClick={onLeaveCall}
        className="p-2.5 md:p-3.5 rounded-xl bg-red-600 hover:bg-red-700 text-white font-semibold transition-all shadow-lg shadow-red-600/30 flex items-center justify-center ml-1"
        title="End Call"
      >
        <PhoneOff className="w-4 h-4 md:w-5 md:h-5" />
      </button>

    </div>
  );
}
