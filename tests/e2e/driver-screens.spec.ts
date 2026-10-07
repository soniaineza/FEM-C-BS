import { test, expect, createDriver, signInDriver } from './helpers';

test('driver tabs and account screens load real account data', async ({ page }) => {
  const driver = await createDriver({ verified: true, online: false });
  await signInDriver(page, driver);
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Go online' })).toBeVisible();

  await page.getByRole('tab', { name: 'My Rides' }).click();
  await expect(page.getByText('No trips yet')).toBeVisible();
  await page.getByRole('tab', { name: 'Wallet' }).click();
  // The wallet headline follows the commission arrangement: a withdrawable
  // balance when drivers keep part of the fare, otherwise the fares sent on.
  await expect(page.getByText(/^(Pending balance|Fares sent to Kimu)$/)).toBeVisible();
  await page.getByRole('tab', { name: 'More' }).click();
  await expect(page.getByText('Account').first()).toBeVisible();

  const screens = [
    ['/account/edit-profile', 'Edit profile'],
    ['/account/vehicle', 'Your vehicle'],
    ['/account/documents', 'Documents'],
    ['/account/ratings', 'Ratings'],
    ['/notifications', 'Notifications'],
    ['/account/support', 'Help & support'],
    ['/account/settings', 'Settings'],
    ['/wallet/payouts', 'Payouts'],
  ] as const;
  for (const [route, heading] of screens) {
    await page.goto(route);
    await expect(page.getByText(heading, { exact: true }).first(), route).toBeVisible();
    await expect(page.getByText('Request failed')).toHaveCount(0);
  }
});
