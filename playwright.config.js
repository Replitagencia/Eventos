import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests', testMatch: '**/*.spec.js', workers: 1,
  use: { baseURL: 'http://localhost:3100', browserName: 'chromium', ...(process.env.PLAYWRIGHT_CHROME ? { channel: 'chrome' } : {}), screenshot: 'only-on-failure' },
  webServer: {
    command: 'node src/server.js', url: 'http://localhost:3100', reuseExistingServer: false,
    env: { PORT: '3100', HOST: '127.0.0.1', PUBLIC_URL: 'http://localhost:3100', DATABASE_PATH: ':memory:', ADMIN_EMAIL: 'admin@test.local', ADMIN_PASSWORD: 'admin-ui-test-password', OPERATOR_EMAIL: 'operator@test.local', OPERATOR_PASSWORD: 'operator-ui-test-password', SEED_DEMO: 'true', MAIL_ENABLED: 'false' }
  }
});
