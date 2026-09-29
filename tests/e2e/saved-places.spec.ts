import { test, expect, api, createPassenger, signInPassenger } from './helpers';

test('a saved pickup stores a map point and remains bookable from Home', async ({ page }) => {
  const rider = await createPassenger('Saved Place Rider');
  await signInPassenger(page, rider);
  await page.route('**/api/locations/search?**', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ results: [{ address: 'Kacyiru, Kigali', latitude: -1.9393, longitude: 30.0864 }] }),
  }));
  await page.goto('/');
  await page.getByRole('tab', { name: 'Profile' }).click();
  await page.getByText('Saved places').click();
  await page.getByText('Add place').click();
  await page.getByPlaceholder("e.g. Home, Dad's house").fill('Office');
  await page.getByPlaceholder('e.g. Kacyiru, Kigali').fill('Kacyiru');
  await expect(page.getByRole('button', { name: 'Save place' })).toBeDisabled();
  await page.getByText('Kacyiru, Kigali', { exact: true }).click();
  await expect(page.getByRole('button', { name: 'Save place' })).toBeEnabled();
  await page.getByRole('button', { name: 'Save place' }).click();
  await expect(page.getByText('Office')).toBeVisible();

  const saved = await api('GET', '/places/saved', undefined, rider.token);
  expect(saved.status).toBe(200);
  expect(saved.data.savedPlaces[0].place).toMatchObject({
    address: 'Kacyiru, Kigali', latitude: -1.9393, longitude: 30.0864,
  });

  await page.goto('/');
  await page.getByText('Office').click();
  await expect(page.getByText('Kacyiru, Kigali')).toBeVisible();
});
