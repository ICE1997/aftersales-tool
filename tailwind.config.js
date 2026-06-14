export default {
  content: ['./src/renderer/**/*.{html,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        paper: 'var(--paper)',
        'paper-2': 'var(--paper-2)',
        surface: 'var(--surface)',
        ink: 'var(--ink)',
        'ink-soft': 'var(--ink-soft)',
        muted: 'var(--muted)',
        line: 'var(--line)',
        'line-strong': 'var(--line-strong)',
        accent: 'var(--accent)',
        'accent-soft': 'var(--accent-soft)',
        'accent-ink': 'var(--accent-ink)',
        ok: 'var(--ok)',
        'ok-soft': 'var(--ok-soft)',
        info: 'var(--info)',
        'info-soft': 'var(--info-soft)',
        warn: 'var(--warn)',
        'warn-soft': 'var(--warn-soft)',
        danger: 'var(--danger)',
        'danger-soft': 'var(--danger-soft)'
      },
      fontFamily: {
        display: ['Bricolage Grotesque', 'Spline Sans', 'PingFang SC', 'Microsoft YaHei', 'sans-serif'],
        sans: ['Spline Sans', 'PingFang SC', 'Microsoft YaHei', 'system-ui', 'sans-serif'],
        mono: ['Spline Sans Mono', 'ui-monospace', 'SFMono-Regular', 'monospace']
      },
      borderRadius: { xl2: '14px' },
      boxShadow: {
        card: '0 1px 2px rgba(33,30,24,.04), 0 10px 28px -18px rgba(33,30,24,.28)',
        lift: '0 14px 36px -14px rgba(33,30,24,.34)',
        modal: '0 24px 70px -20px rgba(33,30,24,.45)'
      },
      keyframes: {
        pop: { '0%': { opacity: '0', transform: 'scale(.96) translateY(6px)' }, '100%': { opacity: '1', transform: 'scale(1) translateY(0)' } },
        slidedown: { '0%': { opacity: '0', transform: 'translateY(-6px)' }, '100%': { opacity: '1', transform: 'translateY(0)' } },
        fadein: { '0%': { opacity: '0' }, '100%': { opacity: '1' } },
        rise: { '0%': { opacity: '0', transform: 'translateY(8px)' }, '100%': { opacity: '1', transform: 'translateY(0)' } }
      },
      animation: {
        pop: 'pop .22s cubic-bezier(.2,.8,.2,1)',
        slidedown: 'slidedown .2s ease-out',
        fadein: 'fadein .25s ease-out',
        rise: 'rise .3s cubic-bezier(.2,.8,.2,1) both'
      }
    }
  },
  plugins: []
}
