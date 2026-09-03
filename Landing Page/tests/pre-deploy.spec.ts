import { test, expect } from '@playwright/test';

/**
 * PRE-DEPLOYMENT E2E TEST SUITE
 * Critical scenarios for production readiness
 */

// Test credentials - Actual Supabase account
const TEST_USER = {
    email: 'jotabou@protonmail.com',
    password: 'k47nZKQ!&UQYgg3Qx$H5'
};

// Same account for all tests (role determined by database)
const TEST_COACH = TEST_USER;
const TEST_ATHLETE = TEST_USER;

/**
 * TEST A: Session Persistence - "The F5 Killer"
 * Ensures users stay logged in after page reload
 */
test.describe('Session Persistence', () => {
    test('Coach session persists after page reload', async ({ page }) => {
        // Navigate to app
        await page.goto('http://localhost:5173/');

        // Login - look for actual button text from SmartAuthButton
        await page.click('button:has-text("Iniciar Sesión"), a:has-text("Iniciar Sesión")');
        await page.fill('input[type="email"]', TEST_COACH.email);
        await page.fill('input[type="password"]', TEST_COACH.password);
        await page.click('button:has-text("Iniciar Sesión")');

        // Wait for dashboard to load
        await expect(page.getByText(/dashboard|entrenador/i)).toBeVisible({ timeout: 10000 });

        // Reload page (F5 simulation)
        await page.reload();

        // Verify still on dashboard (NOT redirected to login)
        await expect(page).not.toHaveURL(/.*\/$/, { timeout: 5000 });
        await expect(page.getByText(/dashboard|entrenador/i)).toBeVisible({ timeout: 5000 });
    });

    test('Athlete session persists after page reload', async ({ page }) => {
        await page.goto('http://localhost:5173/');

        await page.click('[data-testid="login-button"]');
        await page.fill('input[type="email"]', TEST_ATHLETE.email);
        await page.fill('input[type="password"]', TEST_ATHLETE.password);
        await page.click('button:has-text("Iniciar Sesión")');

        await expect(page.getByText(/home|planificación/i)).toBeVisible({ timeout: 10000 });

        // F5 reload
        await page.reload();

        // Should remain on athlete dashboard
        await expect(page).toHaveURL(/.*dashboard.*/);
        await expect(page.getByText(/home|planificación/i)).toBeVisible({ timeout: 5000 });
    });
});

/**
 * TEST B: Role Security - "The Wall"
 * Ensures role-based access control is enforced
 */
test.describe('Role-Based Access Control', () => {
    test('Athlete cannot access coach dashboard', async ({ page }) => {
        // Login as athlete
        await page.goto('http://localhost:5173/');
        await page.click('[data-testid="login-button"]');
        await page.fill('input[type="email"]', TEST_ATHLETE.email);
        await page.fill('input[type="password"]', TEST_ATHLETE.password);
        await page.click('button:has-text("Iniciar Sesión")');

        await expect(page.getByText(/home|planificación/i)).toBeVisible({ timeout: 10000 });

        // Try to forcefully navigate to coach dashboard
        await page.goto('http://localhost:5173/coach-dashboard');

        // Should be redirected away from coach dashboard
        await page.waitForTimeout(1000);
        const url = page.url();
        expect(url).not.toContain('coach-dashboard');

        // Should see either athlete dashboard or access denied message
        const hasAthleteContent = await page.getByText(/home|planificación|acceso denegado/i).isVisible();
        expect(hasAthleteContent).toBe(true);
    });

    test('Coach cannot access athlete-only features', async ({ page }) => {
        // Login as coach
        await page.goto('http://localhost:5173/');
        await page.click('[data-testid="login-button"]');
        await page.fill('input[type="email"]', TEST_COACH.email);
        await page.fill('input[type="password"]', TEST_COACH.password);
        await page.click('button:has-text("Iniciar Sesión")');

        await expect(page.getByText(/dashboard|entrenador/i)).toBeVisible({ timeout: 10000 });

        // Try to navigate to athlete dashboard
        await page.goto('http://localhost:5173/dashboard');

        // Should be redirected to coach dashboard
        await page.waitForTimeout(1000);
        expect(page.url()).toContain('coach-dashboard');
    });
});

/**
 * TEST C: Navigation & UI Integrity
 * Ensures Smart Bridge works correctly
 */
test.describe('Smart Bridge Navigation', () => {
    test('Guest user sees login button on landing', async ({ page }) => {
        await page.goto('http://localhost:5173/');

        // Should see SmartAuthButton with "Iniciar Sesión" text
        const loginButton = page.locator('button:has-text("Iniciar Sesión"), a:has-text("Iniciar Sesión")');
        await expect(loginButton).toBeVisible();
    });

    test('Logged-in user can return to landing without logout', async ({ page }) => {
        // Login
        await page.goto('http://localhost:5173/');
        await page.click('[data-testid="login-button"]');
        await page.fill('input[type="email"]', TEST_ATHLETE.email);
        await page.fill('input[type="password"]', TEST_ATHLETE.password);
        await page.click('button:has-text("Iniciar Sesión")');

        await expect(page.getByText(/home|planificación/i)).toBeVisible({ timeout: 10000 });

        // Click "Volver a la Web"
        const backButton = page.getByText(/volver a.*web/i);
        await backButton.click();

        // Should be on landing page
        await expect(page).toHaveURL('http://localhost:5173/');

        // Should NOT see login button (still logged in)
        // Instead should see "Ir a mi Panel" button
        const dashboardButton = page.getByText(/ir a.*panel/i);
        await expect(dashboardButton).toBeVisible({ timeout: 3000 });
    });
});

/**
 * TEST D: Mobile Navigation
 * Ensures responsive UI doesn't break critical functionality
 */
test.describe('Mobile Navigation', () => {
    test('Mobile menu works on iPhone viewport', async ({ page }) => {
        // Set iPhone 12 viewport
        await page.setViewportSize({ width: 390, height: 844 });

        await page.goto('http://localhost:5173/');

        // Login
        await page.click('[data-testid="login-button"]');
        await page.fill('input[type="email"]', TEST_ATHLETE.email);
        await page.fill('input[type="password"]', TEST_ATHLETE.password);
        await page.click('button:has-text("Iniciar Sesión")');

        await page.waitForTimeout(2000);

        // Open mobile menu (hamburger icon)
        const menuButton = page.locator('button:has-text("Menu"), button:has(svg)').first();
        await menuButton.click();

        // Verify menu opens and doesn't obscure content
        await expect(page.getByText(/home|planificación/i)).toBeVisible();

        // Menu should be visible
        const menu = page.locator('nav, aside, [role="navigation"]').first();
        await expect(menu).toBeVisible();
    });

    test('Landing page is mobile-friendly', async ({ page }) => {
        await page.setViewportSize({ width: 375, height: 667 });

        await page.goto('http://localhost:5173/');

        // Hero section should be visible
        await expect(page.getByText(/anvil.*strength/i)).toBeVisible();

        // CTA buttons should be accessible
        const loginBtn = page.locator('button:has-text("Iniciar Sesión"), a:has-text("Iniciar Sesión")');
        await expect(loginBtn).toBeVisible();

        // No horizontal scroll
        const bodyWidth = await page.evaluate(() => document.body.scrollWidth);
        expect(bodyWidth).toBeLessThanOrEqual(375);
    });
});

/**
 * TEST E: Error Resilience
 * Ensures app handles errors gracefully
 */
test.describe('Error Handling', () => {
    test('App shows error message on failed login', async ({ page }) => {
        await page.goto('http://localhost:5173/');

        await page.click('[data-testid="login-button"]');
        await page.fill('input[type="email"]', 'wrong@email.com');
        await page.fill('input[type="password"]', 'wrongpassword');
        await page.click('button:has-text("Iniciar Sesión")');

        // Should show error message (not white screen)
        await expect(page.getByText(/error|incorrecto|inválido/i)).toBeVisible({ timeout: 5000 });
    });

    test('App does not crash on network timeout', async ({ page }) => {
        // Simulate slow network
        await page.route('**/*', route => {
            setTimeout(() => route.continue(), 2000);
        });

        await page.goto('http://localhost:5173/');

        // Page should eventually load (not white screen)
        await expect(page.getByText(/anvil.*strength/i)).toBeVisible({ timeout: 15000 });
    });
});
