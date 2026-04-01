export default function manifest() {
  return {
    name: 'Exam Solver AI Gateway',
    short_name: 'ES Gateway',
    description: 'Smart AI Gateway for Exam Solver - Connect GPT & Kiro',
    start_url: '/',
    display: 'standalone',
    background_color: '#0a0f1a',
    theme_color: '#00d4ff',
    icons: [
      {
        src: '/favicon.svg',
        sizes: 'any',
        type: 'image/svg+xml',
      },
    ],
  }
}
