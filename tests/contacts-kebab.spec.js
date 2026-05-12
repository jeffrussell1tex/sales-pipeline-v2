
import { test, expect } from '@playwright/test';

test('kebab works after TaskModal opened and closed', async ({ page }) => {
    await page.goto('/');
    await page.locator('.app-container').waitFor({ state: 'visible', timeout: 15000 });
    await page.locator('button.nav-tab:has-text("Contacts")').click();
    await page.waitForTimeout(1000);
    await page.evaluate(() => window.scrollTo(0, 600));
    await page.waitForTimeout(500);
    const kebab = page.locator('button[id^="contact-row-btn-"]').first();
    await kebab.scrollIntoViewIfNeeded();
    await kebab.click();
    await expect(page.locator('div[id^="contact-row-menu-"]').first()).toBeVisible({ timeout: 2000 });
    console.log('BEFORE modal: kebab OK');
    await page.keyboard.press('Escape');
    await page.locator('button.nav-tab:has-text("Tasks")').click();
    await page.waitForTimeout(500);
    await page.locator('button:has-text("New task"), button:has-text("+ New")').first().click();
    await page.waitForTimeout(1000);
    await page.locator('button').filter({ hasText: 'x' }).last().click();
    await page.waitForTimeout(500);
    await page.locator('button.nav-tab:has-text("Contacts")').click();
    await page.waitForTimeout(1000);
    await page.evaluate(() => window.scrollTo(0, 600));
    await page.waitForTimeout(500);
    const kebab2 = page.locator('button[id^="contact-row-btn-"]').first();
    await kebab2.scrollIntoViewIfNeeded();
    await kebab2.click();
    const scrollAfter = await page.evaluate(() => window.scrollY);
    console.log('AFTER modal: scrollY=' + scrollAfter);
    await expect(page.locator('div[id^="contact-row-menu-"]').first()).toBeVisible({ timeout: 2000 });
    expect(scrollAfter).toBeGreaterThan(0);
    console.log('AFTER modal: kebab OK');
});
