import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

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
        resolve: {
          alias: {
            '@shared': path.resolve(__dirname, 'src/shared'),
          },
        },
        test: {
          name: 'jsdom',
          environment: 'jsdom',
          include: ['tests/renderer/**/*.test.tsx', 'tests/renderer/**/*.test.ts'],
        },
      },
    ],
  },
})
