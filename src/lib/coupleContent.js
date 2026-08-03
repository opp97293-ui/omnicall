// Couple-mode content: challenges, gifts and love-meter copy.
// Everything here is playful and flirty but stays tasteful.

export const CHALLENGE_CATEGORIES = [
  {
    id: 'truth',
    label: 'Truth',
    emoji: '💭',
    accent: 'from-sky-500 to-indigo-500',
    prompts: [
      'What was the exact moment you knew you liked me?',
      'What is one thing about me you have never told anyone?',
      'What is your favourite memory of us so far?',
      'What is something you find irresistibly cute about me?',
      'If you could relive one day with me, which one would it be?',
      'What is the first thing you noticed about me?',
      'What song reminds you of me every single time?',
      'What is one dream you want us to tick off together?'
    ]
  },
  {
    id: 'dare',
    label: 'Dare',
    emoji: '🎯',
    accent: 'from-emerald-500 to-teal-500',
    prompts: [
      'Send your most dramatic wink to the camera right now 😉',
      'Sing 10 seconds of our song — no skipping!',
      'Do your best impression of me for 15 seconds.',
      'Show the last photo in your gallery. No cheating!',
      'Say something flirty in your most filmy voice.',
      'Do a slow-motion hair flip like a movie hero.',
      'Give the camera your most intense look for 5 seconds.',
      'Blow a kiss and make it look like a Bollywood poster.'
    ]
  },
  {
    id: 'spicy',
    label: 'Hot & Spicy',
    emoji: '🔥',
    accent: 'from-rose-500 to-pink-600',
    prompts: [
      'Whisper the sweetest thing you want to say to me.',
      'Describe our perfect late-night date in three words.',
      'Tell me one compliment you have been holding back.',
      'What outfit of mine is your absolute favourite and why?',
      'Say my name the way you say it when you miss me.',
      'Describe the best hug we ever had.',
      'Tell me what you would do first if I was next to you right now.',
      'Give me a rating out of 10 for my smile and defend it.'
    ]
  },
  {
    id: 'quiz',
    label: 'Love Quiz',
    emoji: '💘',
    accent: 'from-fuchsia-500 to-purple-600',
    prompts: [
      'What is my comfort food when I am sad?',
      'What is my go-to order at a café?',
      'Which of my habits makes you laugh the most?',
      'What colour do I wear the most?',
      'What is my biggest fear?',
      'What is the nickname I secretly love?',
      'What would I pick: mountains or beach?',
      'What is the one show I can rewatch forever?'
    ]
  },
  {
    id: 'never',
    label: 'Never Have I Ever',
    emoji: '🙈',
    accent: 'from-amber-500 to-orange-600',
    prompts: [
      'Never have I ever stalked your old photos for an hour.',
      'Never have I ever pretended to be asleep to avoid a call.',
      'Never have I ever re-read our chats when I missed you.',
      'Never have I ever practised what to say before calling you.',
      'Never have I ever been jealous over something tiny.',
      'Never have I ever saved your contact with a silly name.',
      'Never have I ever planned our future in my head.',
      'Never have I ever taken a screenshot of this call.'
    ]
  },
  {
    id: 'wyr',
    label: 'Would You Rather',
    emoji: '⚖️',
    accent: 'from-violet-500 to-indigo-600',
    prompts: [
      'Kiss in the rain or under the stars?',
      'A surprise road trip or a cosy night in?',
      'Cook together or get spoiled at a fancy dinner?',
      'Long letters or long voice notes?',
      'Dance in the kitchen or watch the sunrise together?',
      'Travel the world with me or build a home with me?',
      'Matching outfits in public or secret matching tattoos?',
      'One month apart with daily calls or one week apart with silence?'
    ]
  }
];

export const GIFTS = [
  { id: 'rose', emoji: '🌹', label: 'Rose', points: 5 },
  { id: 'kiss', emoji: '😘', label: 'Kiss', points: 6 },
  { id: 'teddy', emoji: '🧸', label: 'Teddy', points: 8 },
  { id: 'choco', emoji: '🍫', label: 'Chocolate', points: 8 },
  { id: 'ring', emoji: '💍', label: 'Promise Ring', points: 15 },
  { id: 'fire', emoji: '🔥', label: 'On Fire', points: 10 },
  { id: 'cake', emoji: '🎂', label: 'Sweet Treat', points: 7 },
  { id: 'stars', emoji: '✨', label: 'Stardust', points: 6 }
];

export const REACTIONS = ['❤️', '😘', '🔥', '🥰', '😂', '👏', '🤗', '💍'];

export const LOVE_LEVELS = [
  { min: 0, label: 'Just Connected', emoji: '🤝', tone: 'text-sky-300' },
  { min: 20, label: 'Getting Warm', emoji: '🌤️', tone: 'text-amber-300' },
  { min: 40, label: 'Butterflies', emoji: '🦋', tone: 'text-pink-300' },
  { min: 60, label: 'Blushing Hard', emoji: '😊', tone: 'text-rose-300' },
  { min: 80, label: 'On Fire', emoji: '🔥', tone: 'text-orange-300' },
  { min: 100, label: 'Soulmates', emoji: '💞', tone: 'text-fuchsia-300' }
];

export function loveLevel(value) {
  return [...LOVE_LEVELS].reverse().find((l) => value >= l.min) || LOVE_LEVELS[0];
}

export function randomPrompt(categoryId) {
  const cat = CHALLENGE_CATEGORIES.find((c) => c.id === categoryId) || CHALLENGE_CATEGORIES[0];
  const prompt = cat.prompts[Math.floor(Math.random() * cat.prompts.length)];
  return { categoryId: cat.id, label: cat.label, emoji: cat.emoji, accent: cat.accent, prompt };
}

export function randomChallenge() {
  const cat = CHALLENGE_CATEGORIES[Math.floor(Math.random() * CHALLENGE_CATEGORIES.length)];
  return randomPrompt(cat.id);
}
