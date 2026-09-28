import { test, expect, createPassenger, createDriver, signInPassenger, HUYE } from './helpers';

test.use({ geolocation: HUYE });

test('Home opens on a live nearby-driver map with booking controls in reach', async ({ page }) => {
  const rider = await createPassenger('Home Map Rider');
  await createDriver({ online: true, at: HUYE });
  await signInPassenger(page, rider);
  await page.goto('/');

  await expect(page.getByRole('region', { name: 'Map' })).toBeVisible();
  await expect(page.locator('.maplibregl-canvas')).toBeVisible();
  await expect(page.getByText(/cars nearby/i)).toBeVisible();
  await expect(page.getByText('Where are you going?')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Find Ride' })).toBeVisible();
  await expect(page.getByRole('radio', { name: 'Private ride' })).toHaveAttribute('aria-checked', 'true');

  const map = await page.getByRole('region', { name: 'Map' }).boundingBox();
  const panel = await page.getByText('Where are you going?').boundingBox();
  expect(map).toBeTruthy();
  expect(panel).toBeTruthy();
  expect(panel!.y).toBeGreaterThan(page.viewportSize()!.height * 0.45);

  await page.screenshot({ path: test.info().outputPath('home-map.png') });
  await page.getByRole('button', { name: 'Use current location' }).click();
  await page.getByRole('button', { name: 'Profile' }).first().click();
  await expect(page.getByText('Log out')).toBeVisible();
});
