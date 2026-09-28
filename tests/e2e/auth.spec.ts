import { test, expect, createPassenger, freshVisitor, uniquePhone, signInPassenger } from './helpers';

test.describe('Passenger authentication', () => {
  test('first launch asks for a language, then shows the welcome screen', async ({ page }) => {
    await freshVisitor(page, { languageChosen: false });
    await page.goto('/');
    // Kinyarwanda is the default until the rider picks a language.
    await expect(page.getByText('Hitamo ururimi rwawe')).toBeVisible();
    await page.getByText('English', { exact: true }).click();
    await page.getByText(/^(Komeza|Continue)$/).click();
    await expect(page.getByText('Get started')).toBeVisible();
    await expect(page.getByText('Switch to driver app')).toBeVisible();
  });

  test('sign up, verify the SMS code, complete the profile, reach Home', async ({ page }) => {
    await freshVisitor(page);
    await page.goto('/');
    await page.getByText('Get started').click();
    await expect(page.getByText('Create your account')).toBeVisible();

    const phone = uniquePhone();
    await page.getByLabel('Full name').fill('Grace Uwase');
    await page.getByLabel('Phone number').fill(phone);
    await page.getByLabel('Email').fill(`signup${phone.slice(-9)}@example.com`);
    await page.getByLabel('Password', { exact: true }).fill('Secret123');
    await page.getByLabel('Confirm password').fill('Secret123');

    // Terms must be accepted first.
    await page.getByText('Sign up', { exact: true }).last().click();
    await expect(page.getByText(/I agree to the Terms/).first()).toBeVisible();
    await page.getByText(/I agree to the Terms/).first().click();
    await page.getByText('Sign up', { exact: true }).last().click();

    await expect(page.getByText('Verify your account')).toBeVisible();
    const hint = await page.getByText(/Demo OTP code: \d+/).textContent();
    const code = hint!.match(/(\d{4,8})/)![1];
    // Tap the digit boxes and type, like a rider. A wrong code is refused.
    const boxes = page.getByRole('textbox');
    const tapBoxes = async () => {
      const box = await boxes.nth(1).boundingBox();
      await page.mouse.click(box!.x + box!.width / 2, box!.y + box!.height / 2);
    };
    // The screen submits by itself once every digit is typed.
    await tapBoxes();
    await page.keyboard.type('000000'.slice(0, code.length));
    await expect(page.getByText(/Invalid or expired|could not verify|Enter the code/i).first()).toBeVisible();
    await tapBoxes();
    for (let i = 0; i < 8; i++) await page.keyboard.press('Backspace');
    await page.keyboard.type(code);

    // New accounts complete their profile, then land on Home.
    const profile = page.getByText('Complete your profile');
    const home = page.getByText('Where are you going?');
    await expect(profile.or(home)).toBeVisible();
    if (await profile.isVisible()) await page.getByText('Continue', { exact: true }).click();
    await expect(home).toBeVisible();
  });

  test('log in with password; a wrong password is refused', async ({ page }) => {
    const p = await createPassenger('Login Tester');
    await freshVisitor(page);
    await page.goto('/');
    await page.getByText('Log in', { exact: true }).click();
    await page.getByLabel('Phone number or email').fill(p.phone);
    await page.getByText('Continue', { exact: true }).click();
    await page.getByLabel('Password', { exact: true }).fill('WrongPass1');
    await page.getByText('Continue', { exact: true }).click();
    await expect(page.getByText(/incorrect|invalid|could not sign you in|wrong/i).first()).toBeVisible();
    await page.getByLabel('Password', { exact: true }).fill(p.password);
    await page.getByText('Continue', { exact: true }).click();
    await expect(page.getByText('Where are you going?')).toBeVisible();
  });

  test('forgot password: reset with the SMS code, then log in with the new one', async ({ page }) => {
    const p = await createPassenger('Reset Tester');
    await freshVisitor(page);
    await page.goto('/');
    await page.getByText('Log in', { exact: true }).click();
    // "Forgot password?" sits on the password step of login.
    await page.getByLabel('Phone number or email').fill(p.phone);
    await page.getByText('Continue', { exact: true }).click();
    await page.getByText('Forgot password?').click();
    await page.getByLabel('Email or phone number').fill(p.phone);
    await page.getByText('Send verification').click();
    const hint = await page.getByText(/Demo OTP code: \d+/).textContent();
    const code = hint!.match(/(\d{4,8})/)![1];
    await page.getByLabel('Verification code').fill(code);
    await page.getByRole('textbox', { name: 'New password' }).fill('NewSecret456');
    await page.getByLabel('Repeat password').fill('NewSecret456');
    await page.getByText('Set new password').click();
    await expect(page.getByText(/Password reset/)).toBeVisible();
    // Back on the password step, the phone number is kept.
    await page.getByText('Back to log in').click();
    await expect(page.getByText(`Signing in as ${p.phone}`)).toBeVisible();
    await page.getByLabel('Password', { exact: true }).fill('NewSecret456');
    await page.getByText('Continue', { exact: true }).click();
    await expect(page.getByText('Where are you going?')).toBeVisible();
  });

  test('log out from Profile returns to the welcome screen', async ({ page }) => {
    const p = await createPassenger('Logout Tester');
    await signInPassenger(page, p);
    await page.goto('/');
    await page.getByRole('tab', { name: 'Profile' }).click();
    await page.getByText('Log out', { exact: true }).first().click();
    // Confirmation, then signed out.
    await page.getByText('Log out', { exact: true }).last().click();
    await expect(page.getByText('Get started')).toBeVisible();
  });
});
