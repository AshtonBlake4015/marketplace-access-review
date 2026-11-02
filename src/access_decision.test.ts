import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decide } from './access_decision.ts';

test('order handoff requires observed scopes within the approval', () => {
  const input = { reviewDate: '2026-11-02', assignments: [{
    keyId: 'seller-a', sellerAssets: ['catalog-a'], buyerUpdates: true,
    orderHandoff: true, approvedScopes: ['account.keys.list']
  }] };
  assert.equal(decide(input, [{ id: 'seller-a', scopes: ['account.keys.list'] }])[0].handoff, 'ready');
  assert.equal(decide(input, [{ id: 'seller-a', scopes: ['account.keys.list', 'pdf.generate'] }])[0].handoff, 'held');
  assert.equal(decide(input, [])[0].handoff, 'held');
  assert.equal(decide(input, [{ id: 'seller-a', scopes: ['*'] }])[0].decision, 'hold');
});
