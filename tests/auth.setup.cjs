
const { test: setup } = require('@playwright/test');
setup('authenticate', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(3000);
    if (page.url().includes('sign-in') || page.url().includes('clerk')) {
        console.log('Please log in manually.');
    }
    await page.locator('.app-container').waitFor({ state: 'visible', timeout: 15000 });
    await page.context().storageState({ path: 'tests/.auth/user.json' });
    console.log('Auth saved');
});
