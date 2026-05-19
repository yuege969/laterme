import { defineConfig } from '@playwright/test';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const DIST_DIR = resolve(__dirname, 'dist');

export default defineConfig({
  testDir: 'e2e',
  timeout: 30000,
  retries: 0,
  use: {
    browserName: 'chromium',
    launchOptions: {
      args: [
        `--disable-extensions-except=${DIST_DIR}`,
        `--load-extension=${DIST_DIR}`,
        '--no-sandbox',
        '--disable-setuid-sandbox',
      ],
    },
  },
  globalSetup: resolve(__dirname, 'e2e/setup/global.ts'),
});
