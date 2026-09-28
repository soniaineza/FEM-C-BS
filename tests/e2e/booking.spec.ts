import { test, expect, api, bookRide, createPassenger, createDriver, signInPassenger, waitForRide, HUYE } from './helpers';
import type { Page } from '@playwright/test';

// Rider and driver are both in Huye, outside the demo fleet's reach, so the
// ride always goes to this test's driver; the test plays the driver's side
// through the driver API while the rider uses the app.
test.use({ geolocation: HUYE });

async function driverDo(token: string, rideId: string, action: string, body?: unknown) {
  const r = await api('POST', `/drivers/rides/${rideId}/${action}`, body, token);
  expect(r.status, `${action}: ${JSON.stringify(r.data)}`).toBeLessThan(300);
  return r.data;
}

// Expo Router can unmount a Pressable during the same pointer event that
// navigates; Playwright's locator.click then retries even though it worked.
async function tapButton(page: Page, name: string | RegExp) {
  const button = page.getByRole('button', { name }).last();
  await expect(button).toBeEnabled();
  try {
    await button.click({ force: true });
  } catch (error) {
    // Navigation can unmount the element before Playwright resolves click().
    if (await button.isVisible().catch(() => false)) throw error;
  }
}

test.describe('Booking a ride', () => {
  test('pickup, destination, vehicle choice, fare, payment, request, trip, cash payment, rating', async ({ page, externalLinks }) => {
    const rider = await createPassenger('Booking Rider');
    const driver = await createDriver({ online: true, at: HUYE });
    await signInPassenger(page, rider);
    await page.goto('/');
    await expect(page.getByText('Where are you going?')).toBeVisible();

    // Ride type cards toggle.
    await page.getByText('Share ride', { exact: true }).click();
    await expect(page.getByRole('radio', { name: /Share ride/ })).toHaveAttribute('aria-checked', 'true');
    await page.getByText('Private ride', { exact: true }).click();

    // Pickup: centre-pin picker starts at GPS; confirm the resolved address.
    await page.getByText('Current location').first().click();
    await expect(page.getByText('Set pickup location')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Confirm pickup' })).toBeEnabled({ timeout: 30_000 });
    await expect(page.getByText(/Finding address/)).toHaveCount(0, { timeout: 30_000 });
    await tapButton(page, 'Confirm pickup');
    await expect(page.getByText('Where are you going?')).toBeVisible();

    // Destination: search and pick a result.
    await page.getByText('Choose destination').first().click();
    await page.getByPlaceholder(/Where to|destination/i).fill('Huye Stadium');
    const stadium = page.getByText(/Huye Stadium, Ngoma/).first();
    await stadium.waitFor({ timeout: 30_000 });
    await stadium.click();
    if (await page.getByRole('button', { name: 'Confirm destination' }).isVisible().catch(() => false)) {
      await tapButton(page, 'Confirm destination');
    }
    await expect(page.getByText('Where are you going?')).toBeVisible();
    await api('POST', '/drivers/location', { ...HUYE, heading: 0 }, driver.token);

    // Vehicle choice with upfront prices and the breakdown.
    await tapButton(page, 'Find Ride');
    await expect(page.getByText('Choose a ride')).toBeVisible();
    await expect(page.getByText(/RWF/).first()).toBeVisible({ timeout: 30_000 });
    await page.getByText('FEM Economy', { exact: true }).click();
    await expect(page.getByText('Fare breakdown')).toBeVisible();
    await expect(page.getByText('Booking fee')).toBeVisible();
    await tapButton(page, /^Continue · /);

    // Fare summary -> payment -> confirm.
    await expect(page.getByText('Ride summary')).toBeVisible();
    await tapButton(page, /^Continue · /);
    await expect(page).toHaveURL(/payment-method/);
    await expect(page.getByText('Payment method')).toBeVisible();
    await page.getByText('Cash', { exact: true }).click();
    await tapButton(page, 'Continue');
    await expect(page.getByText('Confirm your ride')).toBeVisible();
    await page.getByLabel('Note (optional)').fill('At the main gate');
    await api('POST', '/drivers/location', { ...HUYE, heading: 0 }, driver.token);
    await tapButton(page, 'Request ride');

    // Matched with our driver.
    await expect(page.getByText('E2E Driver')).toBeVisible({ timeout: 60_000 });
    await expect(page.getByText('RAE 123 T')).toBeVisible();
    const current = (await api('GET', '/rides/current', undefined, rider.token)).data.ride;
    expect(current.driver.name).toBe('E2E Driver');
    expect(current.note).toBe('At the main gate');

    // Driver accepts and arrives: the rider sees the PIN.
    await driverDo(driver.token, current.id, 'accept');
    await driverDo(driver.token, current.id, 'arrived');
    await expect(page.getByText('Your driver is here')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText('Share this PIN with your driver')).toBeVisible();
    const pin = (await api('GET', `/rides/${current.id}`, undefined, rider.token)).data.ride.pin;
    await expect(page.getByText(pin, { exact: true })).toBeVisible();

    // Trip starts with the PIN; the rider's screen switches to the trip.
    await driverDo(driver.token, current.id, 'verify-pin', { pin });
    await expect(page.getByText(/On the way to your destination|Arrive at/).first()).toBeVisible({ timeout: 30_000 });

    // Trip ends: only the driver can confirm cash was collected.
    await driverDo(driver.token, current.id, 'complete-trip');
    await expect(page.getByText(/Pay the driver in cash/)).toBeVisible({ timeout: 30_000 });
    const riderConfirmation = await api('POST', `/rides/${current.id}/pay-cash`, undefined, rider.token);
    expect(riderConfirmation.status).toBe(404);
    await driverDo(driver.token, current.id, 'confirm-cash');
    await expect(page.getByText('Trip completed')).toBeVisible({ timeout: 30_000 });
    await waitForRide(rider, current.id, ['completed']);

    // Rating.
    await page.getByText('Rating', { exact: true }).click();
    await page.getByRole('radio', { name: '4 stars' }).click();
    await page.getByPlaceholder(/Comment/).fill('Smooth ride');
    await page.getByText('Submit rating').click();
    await expect(page.getByText('Where are you going?').last()).toBeVisible({ timeout: 30_000 });
    const rated = (await api('GET', `/rides/${current.id}`, undefined, rider.token)).data.ride;
    expect(rated.rating).toBe(4);
  });

  test('cancel while searching for a driver returns Home and cancels the ride', async ({ page }) => {
    const rider = await createPassenger('Cancel Rider');
    // No driver anywhere near Nyungwe: the search keeps going.
    const nyungwe = { latitude: -2.4721, longitude: 29.2112 };
    const ride = (await api('POST', '/rides', {
      pickup: { address: 'Nyungwe', ...nyungwe },
      destination: { address: 'Nyungwe Top', latitude: -2.4800, longitude: 29.2300 },
      vehicleId: 'fem_economy', paymentMethodId: 'cash',
    }, rider.token)).data.ride;
    await signInPassenger(page, rider);
    await page.goto(`/ride/searching-driver?rideId=${ride.id}`);
    await expect(page.getByText('Finding your driver')).toBeVisible();
    await page.getByText('Cancel ride').click();
    await expect(page.getByText('Where are you going?')).toBeVisible();
    await waitForRide(rider, ride.id, ['cancelled']);
  });

  test('Safety screen shares the trip and records SOS', async ({ page }) => {
    const rider = await createPassenger('Safety Rider');
    const driver = await createDriver({ online: true, at: HUYE });
    const ride = await bookRide(rider);
    await waitForRide(rider, ride.id, ['driverAssigned']);
    await signInPassenger(page, rider);
    await page.goto(`/ride/driver-accepted?rideId=${ride.id}`);
    await expect(page.getByText('E2E Driver')).toBeVisible();
    await page.getByRole('button', { name: 'Safety' }).click();
    await expect(page).toHaveURL(/safety/);

    const shareResponse = page.waitForResponse((response) =>
      response.url().endsWith('/api/share') && response.request().method() === 'POST'
    );
    await page.getByRole('button', { name: 'Share trip link' }).click();
    const createdShare = await shareResponse;
    expect(createdShare.status()).toBe(201);
    const { share } = await createdShare.json();
    const publicShare = await api('GET', `/share/${share.token}`);
    expect(publicShare.status).toBe(200);
    await page.getByRole('button', { name: 'OK' }).click();

    // SOS records the event. Do it last because configured production builds
    // also hand control to the operating system's dialer.
    await page.getByRole('button', { name: 'SOS' }).click();
    await expect(page.getByText(/SOS sent/)).toBeVisible();
    expect((await api('POST', `/rides/${ride.id}/cancel`, { reason: 'E2E cleanup' }, rider.token)).status).toBe(200);
  });

  test('driver Message and Call buttons open the expected phone actions', async ({ page, externalLinks }) => {
    const rider = await createPassenger('Contact Rider');
    await createDriver({ online: true, at: HUYE });
    const ride = await bookRide(rider);
    await waitForRide(rider, ride.id, ['driverAssigned']);
    await signInPassenger(page, rider);
    await page.goto(`/ride/driver-accepted?rideId=${ride.id}`);
    await expect(page.getByText('E2E Driver')).toBeVisible();

    await page.getByRole('button', { name: 'Message' }).click();
    await expect.poll(() => externalLinks.join(' ')).toMatch(/sms:\+?250/);
    await page.getByRole('button', { name: 'Call' }).click();
    await expect.poll(() => externalLinks.join(' ')).toMatch(/tel:\+?250/);
    expect((await api('POST', `/rides/${ride.id}/cancel`, { reason: 'E2E cleanup' }, rider.token)).status).toBe(200);
  });
});
