import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: './audit', workers: 1, retries: 0, timeout: 45000,
  reporter: [['list'], ['json', { outputFile: '../.data/audit-2026-11-16/functional.json' }]],
  use: { baseURL: process.env.AUDIT_URL || 'https://roast-and-toast-ebon.vercel.app', headless: false, screenshot: 'only-on-failure', trace: 'retain-on-failure', actionTimeout: 10000 },
  outputDir: '../.data/audit-2026-11-16/functional-artifacts',
  projects: [{name:'desktop',use:{viewport:{width:1440,height:900}}}, {name:'mobile-emulation',use:{...devices['Pixel 7']}}],
});
