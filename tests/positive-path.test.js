import test from 'node:test';
import { envWallet, buildSiweMessage, signMessage } from '../src/siwe.js';
import { fetchBountyBoard, patchBounty } from '../src/client.js';

const wallet = envWallet();

/**
 * Sanity check in the other direction: a real signature from a real,
 * allowlisted wallet should still be ACCEPTED after the fix. A naive fix
 * for bounty #335 could over-correct and reject everything, which would
 * break the platform just as effectively as the original bug broke its
 * integrity.
 *
 * Requires TEST_WALLET_PRIVATE_KEY (an allowlisted wallet you control)
 * in .env. Off by default - reports as skipped, not failed, when unset.
 */
test('PATCH /api/bounty-board/:id accepts a correctly signed request from an allowlisted wallet', async (t) => {
  if (!wallet) {
    t.skip('TEST_WALLET_PRIVATE_KEY not set - skipping positive-path check. See .env.example.');
    return;
  }

  const board = await fetchBountyBoard();
  const list = Array.isArray(board) ? board : board?.bounties || board?.data || [];
  const own = list.find(
    (b) => String(b.creator_address).toLowerCase() === wallet.address.toLowerCase()
  );

  if (!own) {
    t.skip(`No bounty found created by the test wallet (${wallet.address}) - nothing to safely exercise.`);
    return;
  }

  const action = 'cancel';
  const message = buildSiweMessage({ address: wallet.address, action, bountyId: own.id });
  const signature = await signMessage(wallet, message);

  const { status, body } = await patchBounty(own.id, {
    action,
    address: wallet.address,
    extra: { signature, message },
  });

  if (status >= 400) {
    throw new Error(
      `A validly signed request from an address the test wallet actually owns was rejected ` +
        `(HTTP ${status}). The fix may be over-strict. Response: ${JSON.stringify(body)}`
    );
  }
});
