import { test, expect } from '@playwright/test';
import dotenv from 'dotenv';
import path from 'path';

// Load environment variables from .env.local
dotenv.config({ path: path.join(process.cwd(), '.env.local') });

const BASE_URL = 'http://localhost:5173';

test('Auth Persistence: Session survives page reload', async ({ page }) => {
    const email = process.env.TEST_EMAIL;
    const password = process.env.TEST_PASSWORD;

    if (!email || !password) {
        test.skip(true, 'Skipping: TEST_EMAIL or TEST_PASSWORD not set in .env.local');
        return;
    }

    // 1. Login
    console.log(`Logging in with ${email}...`);
    await page.goto(BASE_URL);
    await page.waitForLoadState('domcontentloaded');

    // Open Login Modal
    await page.getByTestId('login-button').click();

    // Fill Credentials
    await page.fill('input[type="email"]', email);
    await page.fill('input[type="password"]', password);
    await page.getByRole('button', { name: 'Entrar' }).click();

    // Verification 1: Check Dashboard access
    await expect(page.locator('h1')).toContainText('Bienvenido', { timeout: 15000 });
    console.log('Login successful. Dashboard visible.');

    // 2. The "Fire Test" (Prueba de Fuego) - Reload Page
    console.log('Reloading page (F5)...');
    await page.reload();

    // Wait 3 seconds to ensure no redirect happens
    await page.waitForTimeout(3000);

    // Verification 2: Ensure we are STILL on the dashboard and NOT redirected to login
    await expect(page.locator('h1')).toContainText('Bienvenido');
    await expect(page.getByTestId('login-button')).not.toBeVisible();

    console.log('Persistence Verified: User remained on Dashboard after reload.');
});
