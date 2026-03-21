export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        bg: '#0b0d10',
        bg1: '#111419',
        bg2: '#151a21',
        bg3: '#1b2129',
        line: 'rgba(255, 255, 255, 0.07)',
        gold: '#c9a84c',
        green: '#18c37e',
        red: '#ff6b6b',
        text: '#f5f7fb',
        text2: '#adb7c7',
        text3: '#718095'
      },
      fontFamily: {
        serif: ['Manrope', 'system-ui', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'monospace'],
        sans: ['Manrope', 'system-ui', 'sans-serif']
      }
    }
  },
  plugins: []
}
