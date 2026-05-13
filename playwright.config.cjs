
const { defineConfig } = require('@playwright/test');
module.exports = defineConfig({
    testDir: './tests',
    timeout: 30000,
    retries: 0,
    workers: 1,
    reporter: 'list',
    use: {
        baseURL: 'http://localhost:8888',
        headless: false,
        viewport: { width: 1440, height: 900 },
        actionTimeout: 10000,
    },
});
