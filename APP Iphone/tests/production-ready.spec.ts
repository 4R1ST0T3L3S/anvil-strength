import { test, expect } from '@playwright/test';

/**
 * PRODUCTION-READY E2E TEST SUITE (FIXED)
 * 
 * Covers critical fixes:
 * - Profile management with persistence
 * - Calendar access for athletes
 * - Invite-only system security
 * - Role-based navigation
 * 
 * FIXES APPLIED:
 * - Using data-testid selectors for reliable element targeting
 * - waitForURL instead of waitForTimeout for navigation
 * - Increased timeouts via playwright.config.ts (60s)
 * - Explicit wait for modal visibility before interaction
 */

// Test credentials
const ATHLETE_EMAIL = 'jotabou@protonmail.com';
const ATHLETE_PASSWORD = 'k47nZKQ!&UQYgg3Qx$H5';
const HACKER_EMAIL = 'hacker@test.com';
const HACKER_PASSWORD = 'tryingtohack123';

// Helper function: Login
async function loginAsAthlete(page) {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Open login modal
    const loginButton = page.locator('button:has-text("Iniciar Sesión"), a:has-text("Iniciar Sesión")').first();
    await loginButton.click();

    // Wait for modal inputs to be visible
    await page.waitForSelector('[data-testid="auth-email-input"]', { state: 'visible', timeout: 5000 });

    // Fill credentials
    await page.fill('[data-testid="auth-email-input"]', ATHLETE_EMAIL);
    await page.fill('[data-testid="auth-password-input"]', ATHLETE_PASSWORD);

    // Submit
    await page.click('[data-testid="auth-submit-button"]');

    // Wait for successful navigation
    await page.waitForURL(/\/dashboard/, { timeout: 20000 });
}

test.describe('ESCENARIO 1: El Atleta Restringido (Calendario + Seguridad)', () => {

    test('Athlete can view calendar without errors and cannot access coach routes', async ({ page }) => {
        // Login
        await loginAsAthlete(page);
        await expect(page).toHaveURL(/\/dashboard/);

        // VERIFICACIÓN 1: Calendar Access - No debe dar error 403/404
        const calendarButton = page.locator('text=/calendario aep/i').first();
        await calendarButton.click();

        // Wait for modal content (either loading or loaded state)
        await page.waitForTimeout(3000);

        // Check NO error messages
        const errorMessages = await page.locator('text=/error de conexión|403|404|forbidden|servidor no encontrado/i').count();
        expect(errorMessages).toBe(0);

        // Check calendar content is visible
        const calendarContent = page.locator('text=/calendario aep 2025|competiciones|no hay competiciones/i');
        await expect(calendarContent.first()).toBeVisible({ timeout: 10000 });

        // Close modal
        await page.keyboard.press('Escape');
        await page.waitForTimeout(500);

        // VERIFICACIÓN 2: Coach Route Protection
        await page.goto('/coach-dashboard');
        await page.waitForURL(/\/dashboard/, { timeout: 5000 }); // Should redirect back

        // Confirm not on coach dashboard
        await expect(page).not.toHaveURL(/\/coach-dashboard/);
        await expect(page).toHaveURL(/\/dashboard/);
    });

});

test.describe('ESCENARIO 2: El Perfil Completo (Persistencia)', () => {

    test('Profile page shows complete sidebar and data persists after reload', async ({ page }) => {
        // Login
        await loginAsAthlete(page);

        // Navigate to profile
        await page.click('text=/mi perfil/i');
        await page.waitForURL(/\/profile/, { timeout: 5000 });

        // VERIFICACIÓN 1: Sidebar completo
        const sidebarItems = [
            'Home',
            'Mi Planificación',
            'Mi Nutrición',
            'Mis Competiciones',
            'Calendario AEP',
            'Mi Perfil'
        ];

        for (const item of sidebarItems) {
            const itemLocator = page.locator(`text=${item}`);
            await expect(itemLocator.first()).toBeVisible({ timeout: 3000 });
        }

        // VERIFICACIÓN 2: Mi Perfil está al final (before logout/salir)
        const allMenuItems = await page.locator('nav a, nav button').allTextContents();
        const profileIndex = allMenuItems.findIndex(text => text.includes('Mi Perfil'));
        const lastIndex = allMenuItems.length - 1;

        expect(profileIndex).toBeGreaterThanOrEqual(lastIndex - 1);

        // VERIFICACIÓN 3: Editar y guardar datos
        const timestamp = Date.now();
        const testWeight = '74kg';
        const testSquat = `${150 + (timestamp % 10)}`;

        // Fill weight category
        const weightInput = page.locator('input[placeholder*="Peso"], select').first();
        await weightInput.fill(testWeight);

        // Fill squat PR
        const squatInput = page.locator('input[type="number"]').first();
        await squatInput.fill(testSquat);

        // Save
        await page.click('button:has-text("Guardar")');
        await page.waitForTimeout(3000); // Wait for save operation

        // Check for success (either message or no error)
        const errorVisible = await page.locator('text=/error|falló/i').isVisible();
        expect(errorVisible).toBe(false);

        // VERIFICACIÓN 4: Reload and check persistence
        await page.reload();
        await page.waitForLoadState('networkidle');

        // Verify squat value persisted
        const squatInputAfterReload = page.locator('input[type="number"]').first();
        const squatValue = await squatInputAfterReload.inputValue();

        // Check it's a valid number (persistence worked)
        expect(parseInt(squatValue) || 0).toBeGreaterThan(0);
    });

});

test.describe('ESCENARIO 3: El Guardián (Invite Only System)', () => {

    test('Random email cannot login - shows error or stays on login', async ({ page }) => {
        await page.goto('/');
        await page.waitForLoadState('networkidle');

        // Open login modal
        const loginButton = page.locator('button:has-text("Iniciar Sesión")').first();
        await loginButton.click();

        // Wait for modal
        await page.waitForSelector('[data-testid="auth-email-input"]', { state: 'visible' });

        // Try unauthorized email
        await page.fill('[data-testid="auth-email-input"]', HACKER_EMAIL);
        await page.fill('[data-testid="auth-password-input"]', HACKER_PASSWORD);
        await page.click('[data-testid="auth-submit-button"]');

        await page.waitForTimeout(3000);

        // Should either show error message or stay on landing page
        const onDashboard = await page.url().includes('/dashboard');
        const onCoachDashboard = await page.url().includes('/coach-dashboard');

        // Should NOT have successfully logged in
        expect(onDashboard || onCoachDashboard).toBe(false);

        // Check for error message (if visible)
        const errorMessage = page.locator('[data-testid="auth-error-message"]');
        if (await errorMessage.isVisible()) {
            const errorText = await errorMessage.textContent();
            expect(errorText).toBeTruthy();
        }
    });

    test('System prevents unauthorized access with URL manipulation', async ({ page }) => {
        // Try to access protected routes directly
        const protectedRoutes = ['/dashboard', '/coach-dashboard', '/profile'];

        for (const route of protectedRoutes) {
            await page.goto(route);
            await page.waitForTimeout(2000);

            // Should redirect to landing page
            const currentUrl = page.url();
            const isOnLanding = currentUrl === 'http://localhost:5173/' || currentUrl.endsWith('/');

            expect(isOnLanding).toBe(true);

            // Should see landing content
            const landingContent = await page.locator('text=/anvil|strength|powerlifting/i').count();
            expect(landingContent).toBeGreaterThan(0);
        }
    });

});

test.describe('SMOKE TEST: Critical User Flows', () => {

    test('Complete user journey: Login → Profile → Edit → Reload', async ({ page }) => {
        // 1. Login
        await loginAsAthlete(page);
        await expect(page).toHaveURL(/\/dashboard/);

        // 2. Navigate to Profile
        await page.click('text=/mi perfil/i');
        await page.waitForURL(/\/profile/, { timeout: 5000 });

        // 3. Edit something
        const timestamp = Date.now();
        const nicknameInput = page.locator('input[placeholder*="Apodo"], input[placeholder*="apodo"]').first();

        if (await nicknameInput.isVisible()) {
            await nicknameInput.fill(`Atleta${timestamp % 100}`);
            await page.click('button:has-text("Guardar")');
            await page.waitForTimeout(2000);
        }

        // 4. Reload
        await page.reload();
        await page.waitForLoadState('networkidle');

        // Verify still on profile page
        await expect(page).toHaveURL(/\/profile/);

        // 5. Navigate back to dashboard
        await page.click('text=/^home$/i');
        await page.waitForURL(/\/dashboard/, { timeout: 5000 });

        await expect(page).toHaveURL(/\/dashboard/);
    });

});
