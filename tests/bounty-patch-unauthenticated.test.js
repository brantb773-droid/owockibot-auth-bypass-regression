import test from 'node:test';
import assert from 'node:assert/strict';
import { findTerminalBounty, refetchBounty, patchBounty } from '../src/client.js';

/**
 * Regression test for bounty #335 as originally reported:
 *
 *   PATCH /api/bounty-board/:id with a real, allowlisted creator_address
 *   copied from the public GET /api/bounty-board feed, but with NO
 *   signature, NO SIWE, NO auth header - i.e. proof-of-identity entirely
 *   absent.
 *
 * Original (vulnerable) behavior: 200 OK, action processed.
 * Required (fixed) behavior:      401 Unauthorized, action NOT processed.
 *
 * Safety: we only ever target a bounty that is ALREADY in the terminal
 * state matching the action we send (e.g. re-cancel an already-cancelled
 * bounty). If the bypass is still open and the request succeeds, the
 * bounty's state does not change further - no new damage is done to a
 * real user's bounty. See README "Safety design".
 */
test('PATCH /api/bounty-board/:id rejects an impersonated address with no signature', async (t) => {
  const target = await findTerminalBounty();

  if (!target) {
    t.skip('No terminal (cancelled/completed/rejected) bounty found on the board right now - nothing safe to probe. Re-run later.');
    return;
  }

  // Close the discovery -> probe race window.
  const fresh = await refetchBounty(target.id);
  assert.ok(fresh, 'bounty disappeared between discovery and probe');
  assert.equal(
    String(fresh.status).toLowerCase(),
    target.status,
    'bounty status changed since discovery - aborting to stay safe, re-run the suite'
  );

  const { status, body } = await patchBounty(target.id, {
    action: target.action,
    address: target.impersonatedAddress,
    // deliberately no signature / message / Authorization header
  });

  if (status === 200 || status === 201) {
    assert.fail(
      `CRITICAL REGRESSION: bounty #${target.id} action "${target.action}" was processed ` +
        `(HTTP ${status}) with an impersonated address and zero proof of signature. ` +
        `The bounty #335 auth bypass is back. Response: ${JSON.stringify(body)}`
    );
  }

  assert.equal(
    status,
    401,
    `expected 401 Unauthorized for an unsigned state-changing request, got ${status}. ` +
      `This isn't the original bypass shape, but it's not the documented fixed behavior either - ` +
      `worth a manual look. Response: ${JSON.stringify(body)}`
  );
});
