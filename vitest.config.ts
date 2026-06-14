import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'node',
          environment: 'node',
          include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
          exclude: ['tests/renderer/**'],
        },
      },
      {
        plugins: [react()],
        test: {
          name: 'jsdom',
          environment: 'jsdom',
          include: ['tests/renderer/**/*.test.tsx', 'tests/renderer/**/*.test.ts'],
        },
      },
    ],
  },
})
