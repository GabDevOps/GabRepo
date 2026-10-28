import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';

// Builds to a single self-contained dist/index.html so it can be published as a claude.ai Artifact.
export default defineConfig({
  plugins: [react(), viteSingleFile()],
  build: { target: 'es2020', cssCodeSplit: false, assetsInlineLimit: 100000000 },
  test: { globals: true, environment: 'node' },
});
