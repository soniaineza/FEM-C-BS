import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { tariffFare, waitingCharge } from '../../services/offline/tariff.ts';

describe('the FEM tariff', () => {
  it('charges the 1,800 RWF base fare for the first km', () => {
    assert.equal(tariffFare(0.4).total, 1800);
    assert.equal(tariffFare(1).total, 1800);
  });

  it('adds 1,080 RWF per km from 1 km to 30 km', () => {
    assert.equal(tariffFare(2).total, 1800 + 1080);
    assert.equal(tariffFare(10).total, 1800 + 9 * 1080);
    assert.equal(tariffFare(30).total, 1800 + 29 * 1080);
  });

  it('drops to 900 RWF per km beyond 30 km', () => {
    assert.equal(tariffFare(40).total, 1800 + 29 * 1080 + 10 * 900);
  });

  it('gives 15 minutes of waiting free, then 1,500 RWF per 15 minutes', () => {
    assert.equal(waitingCharge(0), 0);
    assert.equal(waitingCharge(15), 0);
    assert.equal(waitingCharge(15.5), 1500);
    assert.equal(waitingCharge(30), 1500);
    assert.equal(waitingCharge(31), 3000);
    assert.equal(tariffFare(2, 20).total, 1800 + 1080 + 1500);
  });
});
