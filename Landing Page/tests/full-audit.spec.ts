import { test, expect } from '@playwright/test';

/**
 * FULL AUDIT E2E TEST SUITE - "FUEGO REAL"
 * Uses real production credentials for comprehensive validation
 */

// Real credentials for testing
const TEST_CREDENTIALS = {
    email: 'jotabou@protonmail.com',
    password: 'k47nZKQ!&UQYgg3Qx$H5'
};

const BASE_URL = 'http://localhost:5173';

/**
 * TEST SUITE 1: Login & Session Persistence (F5 Test)
 */
test.describe('Login & Session Persistence', () => {
    test('User can login and session persists after page reload (F5 Test)', async ({ page }) => {
        // Navigate to app
        await page.goto(BASE_URL);

        // Click login button - using flexible text selector
        await page.getByText('Iniciar Sesión').first().click();
        await page.waitForTimeout(1000); // Wait for modal
        await page.fill('input[type="email"]', TEST_CREDENTIALS.email);
        await page.fill('input[type="password"]', TEST_CREDENTIALS.password);
        await page.click('button:has-text("Iniciar Sesión")');

        // Wait for dashboard to load
        await page.waitForTimeout(3000);
        const currentUrl = page.url();
        expect(currentUrl).not.toBe(`${BASE_URL}/`);
        expect(currentUrl).toMatch(/(dashboard|coach-dashboard|profile)/);

        // F5 RELOAD SIMULATION
        await page.reload();
        await page.waitForTimeout(3000);

        // CHECK: User should NOT be redirected to login page
        const urlAfterReload = page.url();
        expect(urlAfterReload).not.toBe(`${BASE_URL}/`);
        expect(urlAfterReload).toMatch(/(dashboard|coach-dashboard|profile)/);
    });
});

/**
 * TEST SUITE 2: Profile Data Integrity
 */
test.describe('Profile Data Integrity', () => {
    test('User can edit profile and changes persist after reload', async ({ page }) => {
        // Login
        await page.goto(BASE_URL);
        await page.getByText('Iniciar Sesión').first().click();
        await page.waitForTimeout(1000);
        await page.fill('input[type="email"]', TEST_CREDENTIALS.email);
        await page.fill('input[type="password"]', TEST_CREDENTIALS.password);
        await page.click('button:has-text("Iniciar Sesión")');

        await page.waitForTimeout(3000);

        // Navigate to /profile
        await page.goto(`${BASE_URL}/profile`);
        await page.waitForTimeout(2000);

        // Verify we're on profile page
        await expect(page.getByText(/mi perfil/i)).toBeVisible({ timeout: 5000 });

        // Modify the name field with a timestamp
        const timestamp = new Date().toISOString().slice(11, 19).replace(/:/g, '-');
        const testName = `Jota Test ${timestamp}`;

        const nameInput = page.locator('input[type="text"]').first();
        await nameInput.clear();
        await nameInput.fill(testName);

        // Save changes
        await page.click('button:has-text("Guardar")');
        await page.waitForTimeout(2000);

        // Verify success message
        await expect(page.getByText(/actualizado correctamente/i)).toBeVisible({ timeout: 5000 });

        // RELOAD PAGE
        await page.reload();
        await page.waitForTimeout(2000);

        // CHECK: Name should persist
        const nameInputAfterReload = page.locator('input[type="text"]').first();
        const persistedValue = await nameInputAfterReload.inputValue();
        expect(persistedValue).toBe(testName);
    });
});

/**
 * TEST SUITE 3: Role-Based Security (Boundary Test)
 */
test.describe('Role-Based Security', () => {
    test('User cannot access routes forbidden to their role', async ({ page }) => {
        // Login
        await page.goto(BASE_URL);
        await page.getByText('Iniciar Sesión').first().click();
        await page.waitForTimeout(1000);
        await page.fill('input[type="email"]', TEST_CREDENTIALS.email);
        await page.fill('input[type="password"]', TEST_CREDENTIALS.password);
        await page.click('button:has-text("Iniciar Sesión")');

        await page.waitForTimeout(3000);

        // Detect user role based on URL
        const currentUrl = page.url();
        const isCoach = currentUrl.includes('coach-dashboard');
        const isAthlete = currentUrl.includes('/dashboard') && !currentUrl.includes('coach');

        // Try to navigate to forbidden route
        if (isCoach) {
            // Coach trying to access athlete dashboard
            await page.goto(`${BASE_URL}/dashboard`);
            await page.waitForTimeout(2000);

            // CHECK: Should be redirected away from /dashboard
            const redirectedUrl = page.url();
            expect(redirectedUrl).toContain('coach-dashboard');
        } else if (isAthlete) {
            // Athlete trying to access coach dashboard
            await page.goto(`${BASE_URL}/coach-dashboard`);
            await page.waitForTimeout(2000);

            // CHECK: Should be redirected away from /coach-dashboard
            const redirectedUrl = page.url();
            expect(redirectedUrl).not.toContain('coach-dashboard');
        }
    });
});

/**
 * TEST SUITE 4: Excel Import Stress Test (Coach Only)
 */
test.describe('Excel Import Resilience', () => {
    test('App does not crash when attempting to import Excel file', async ({ page }) => {
        // Login
        await page.goto(BASE_URL);
        await page.getByText('Iniciar Sesión').first().click();
        await page.waitForTimeout(1000);
        await page.fill('input[type="email"]', TEST_CREDENTIALS.email);
        await page.fill('input[type="password"]', TEST_CREDENTIALS.password);
        await page.click('button:has-text("Iniciar Sesión")');

        await page.waitForTimeout(3000);

        // Check if user is a coach
        const currentUrl = page.url();
        const isCoach = currentUrl.includes('coach-dashboard');

        if (isCoach) {
            // Navigate to Athletes section
            await page.click('button:has-text("Atletas"), a:has-text("Atletas")');
            await page.waitForTimeout(2000);

            // Try to find an athlete card and click it
            const athleteCard = page.locator('[role="button"], .athlete-card, .card').first();
            if (await athleteCard.isVisible()) {
                await athleteCard.click();
                await page.waitForTimeout(2000);

                // Look for file upload input or import button
                const fileInput = page.locator('input[type="file"]').first();
                if (await fileInput.isVisible()) {
                    // Create a mock Excel file blob
                    const buffer = Buffer.from('PK\x03\x04', 'binary'); // Excel file header
                    await fileInput.setInputFiles({
                        name: 'test_plan.xlsx',
                        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                        buffer
                    });

                    await page.waitForTimeout(2000);

                    // CHECK: Page should not display "White Screen of Death"
                    const bodyText = await page.locator('body').textContent();
                    expect(bodyText).toBeTruthy();
                    expect(bodyText).not.toContain('Error: Uncaught');

                    // Ensure no critical React errors
                    const errorText = await page.locator('body').textContent();
                    expect(errorText).not.toMatch(/Something went wrong|Uncaught|Fatal error/i);
                }
            }
        }
    });
});

/**
 * TEST SUITE 5: Navigation Smoke Test
 */
test.describe('Navigation Integrity', () => {
    test('All main navigation links work without crashes', async ({ page }) => {
        // Login
        await page.goto(BASE_URL);
        await page.getByText('Iniciar Sesión').first().click();
        await page.waitForTimeout(1000);
        await page.fill('input[type="email"]', TEST_CREDENTIALS.email);
        await page.fill('input[type="password"]', TEST_CREDENTIALS.password);
        await page.click('button:has-text("Iniciar Sesión")');

        await page.waitForTimeout(3000);

        // Click Profile link
        const profileLink = page.getByText(/mi perfil/i);
        if (await profileLink.isVisible()) {
            await profileLink.click();
            await page.waitForTimeout(2000);

            // Verify profile page loaded
            await expect(page.getByText(/mi perfil/i).first()).toBeVisible({ timeout: 5000 });

            // Navigate back to dashboard
            const dashboardLink = page.getByText(/dashboard|home/i).first();
            if (await dashboardLink.isVisible()) {
                await dashboardLink.click();
                await page.waitForTimeout(2000);
            }
        }

        // CHECK: No white screen or unhandled errors
        const bodyText = await page.locator('body').textContent();
        expect(bodyText).toBeTruthy();
    });
});

/**
 * TEST SUITE 6: Logout & Session Cleanup
 */
test.describe('Logout Functionality', () => {
    test('User can logout and session is properly cleared', async ({ page }) => {
        // Login
        await page.goto(BASE_URL);
        await page.getByText('Iniciar Sesión').first().click();
        await page.waitForTimeout(1000);
        await page.fill('input[type="email"]', TEST_CREDENTIALS.email);
        await page.fill('input[type="password"]', TEST_CREDENTIALS.password);
        await page.click('button:has-text("Iniciar Sesión")');

        await page.waitForTimeout(3000);

        // Click logout button (look for sign out/cerrar sesión/salir)
        const logoutButton = page.getByText(/cerrar sesión|salir|logout|sign out/i);
        if (await logoutButton.isVisible()) {
            await logoutButton.click();
            await page.waitForTimeout(2000);

            // CHECK: Should be redirected to landing page
            expect(page.url()).toBe(`${BASE_URL}/`);

            // Verify login button is visible again
            await expect(page.getByText(/iniciar sesión/i).first()).toBeVisible({ timeout: 5000 });
        }
    });
});

/**
 * TEST SUITE 7: V2 Critical Features Audit (Invites, Feedback, Notifications)
 */
test.describe('V2 Critical Features Audit', () => {

    // TEST A: The Fortress (Invite Only)
    test('Registration requires valid invitation code', async ({ page }) => {
        await page.goto('http://localhost:5173');

        // Open Auth Modal
        await page.getByText('Empezar Ahora').first().click();

        // Switch to Register (assuming button text)
        const registerSwitch = page.getByText(/no tienes cuenta/i);
        if (await registerSwitch.isVisible()) {
            await registerSwitch.click();
        }

        // Fill form with hacker data
        await page.fill('input[type="email"]', 'random@hacker.com');
        await page.fill('input[type="password"]', 'password123');

        // Assuming invitation code input exists
        const inviteInput = page.locator('input[placeholder*="invita"]');
        if (await inviteInput.isVisible()) {
            await inviteInput.fill('BAD_CODE');
        }

        // Attempt Register
        await page.click('button:has-text("Registrarse")');

        // Expect Error Toast (generic check for "invitación")
        await expect(page.getByText(/invitación/i)).toBeVisible({ timeout: 5000 });
    });

    // TEST B: Visual Feedback (Toasts & Skeletons)
    test('Profile page shows Success Toast on save', async ({ page }) => {
        await page.goto('http://localhost:5173');
        await page.getByText('Iniciar Sesión').first().click();
        await page.fill('input[type="email"]', 'jotabou@protonmail.com');
        await page.fill('input[type="password"]', 'k47nZKQ!&UQYgg3Qx$H5');
        await page.click('button:has-text("Iniciar Sesión")');

        await page.waitForTimeout(3000);

        await page.goto('http://localhost:5173/profile');
        await page.waitForSelector('form', { state: 'visible' });

        const nameInput = page.locator('input[type="text"]').first();
        await nameInput.fill(`Jota Validated ${Date.now()}`);
        await page.click('button:has-text("Guardar")');

        // Expect Success Toast
        await expect(page.getByText(/actualizado correctamente/i)).toBeVisible();
    });

    // TEST C: Notification Trigger
    test('Notification Bell shows red dot when unread notifications exist', async ({ page }) => {
        // Mock notifications
        await page.route('**/rest/v1/notifications*', async route => {
            if (route.request().method() === 'GET') {
                await route.fulfill({
                    json: [{
                        id: 'mock-1',
                        user_id: 'test-user',
                        title: 'Test Notification',
                        message: 'Mocked alert',
                        is_read: false,
                        created_at: new Date().toISOString()
                    }]
                });
            } else {
                await route.continue();
            }
        });

        await page.goto('http://localhost:5173');
        await page.getByText('Iniciar Sesión').first().click();
        await page.fill('input[type="email"]', 'jotabou@protonmail.com');
        await page.fill('input[type="password"]', 'k47nZKQ!&UQYgg3Qx$H5');
        await page.click('button:has-text("Iniciar Sesión")');

        await page.waitForTimeout(3000);

        // Check for Red Dot
        const redDot = page.locator('button .bg-anvil-red').first();
        await expect(redDot).toBeVisible();

        // Click Bell
        await page.locator('button:has(.lucide-bell)').click();
        await expect(page.getByText('Test Notification')).toBeVisible();
    });
});
