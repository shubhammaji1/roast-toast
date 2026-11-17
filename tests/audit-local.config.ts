import base from '../playwright.config';
import { defineConfig } from '@playwright/test';
export default defineConfig({...base,testDir:'./e2e',webServer:Array.isArray(base.webServer)?base.webServer.map(server=>({...server,cwd:process.cwd()})):base.webServer,reporter:[['list']],outputDir:'../.data/audit-2026-11-16/local-retest',use:{...base.use,reducedMotion:'reduce'}});
