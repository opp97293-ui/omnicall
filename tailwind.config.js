/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        lovable: {
          pink: '#ff2a85',
          purple: '#8b5cf6',
          violet: '#6366f1',
          dark: '#0d0914',
          card: 'rgba(22, 16, 36, 0.75)',
          border: 'rgba(255, 255, 255, 0.12)',
        }
      },
      backgroundImage: {
        'lovable-gradient': 'linear-gradient(135deg, #ff2a85 0%, #8b5cf6 50%, #6366f1 100%)',
        'lovable-glow': 'radial-gradient(circle at 50% 0%, rgba(255, 42, 133, 0.25) 0%, rgba(139, 92, 246, 0.15) 50%, rgba(13, 9, 20, 1) 100%)',
      },
      animation: {
        'pulse-slow': 'pulse 4s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'float': 'float 4s ease-in-out infinite',
        'glow-pulse': 'glowPulse 2s ease-in-out infinite',
      },
      keyframes: {
        float: {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-10px)' },
        },
        glowPulse: {
          '0%, 100%': { boxShadow: '0 0 20px rgba(255, 42, 133, 0.3)' },
          '50%': { boxShadow: '0 0 35px rgba(255, 42, 133, 0.7)' }
        }
      }
    },
  },
  plugins: [],
}
