import { test, expect, api, bookRide, createPassenger, createDriver, signInDriver, waitForRide, DRIVER_APP_URL } from './helpers';

test.use({ baseURL: DRIVER_APP_URL });

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

// The rider side of the booking flow is covered in booking.spec.ts; this is
// the driver side of the same event — a passenger's request must actually
// reach the driver's phone and be acceptable.
test('a passenger request reaches the driver and can be accepted', async ({ page }) => {
  const rider = await createPassenger('Driver Offer Rider');
  // A spot of our own, >5 km (the match radius) from the shared Huye fixture,
  // so this ride can only match this test's driver (every other fixture is the
  // same "E2E Driver" standing in Huye).
  const spot = { latitude: -2.6600, longitude: 29.6500 };
  const destination = { latitude: -2.6700, longitude: 29.6600 };
  const driver = await createDriver({ online: true, at: spot });

  const ride = await bookRide(rider, { pickup: spot, destination });
  await waitForRide(rider, ride.id, ['driverAssigned']);

  await signInDriver(page, driver);
  await page.goto('/');
  // The driver home polls the assignment feed (no driver push channel), so the
  // offer shows up within a few seconds.
  await expect(page.getByText('New ride request')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText('Huye Stadium')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Accept' })).toBeVisible();

  await page.getByRole('button', { name: 'Accept' }).click();
  await expect(page).toHaveURL(/journey/, { timeout: 30_000 });

  // Best-effort cleanup so the accepted ride does not linger (the driver is
  // now on the journey screen, so the ride is released on the server side).
  await api('POST', `/rides/${ride.id}/cancel`, { reason: 'E2E cleanup' }, rider.token);
});
