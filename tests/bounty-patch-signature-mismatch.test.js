import test from 'node:test';
import assert from 'node:assert/strict';
import { findTerminalBounty, refetchBounty, patchBounty } from '../src/client.js';
import { buildSiweMessage, signMessage, randomWallet } from '../src/siwe.js';

/**
 * Defense-in-depth regression test, one level past the original report.
 *
 * It's not enough for the server to require *a* signature - it must
 * verify the signature actually recovers to the address being claimed.
 * A server that checks "is a signature present?" but not "does it match
 * the claimed address?" is still fully exploitable: an attacker signs
 * with their OWN throwaway wallet and just puts someone else's address
 * in the body.
 *
 * This test signs a syntactically-plausible SIWE message with a random,
 * never-allowlisted throwaway wallet, then claims a DIFFERENT (real,
 * allowlisted) address in the request body. A correctly-implemented
 * server must reject this with 401 regardless of whether SIWE nonces
 * are fully wired up yet - signature-recovery mismatch should fail
 * closed on its own.
 *
 * Safety: same terminal-bounty targeting as the unauthenticated test.
 */
test('PATCH /api/bounty-board/:id rejects a signature that does not match the claimed address', async (t) => {
  const target = await findTerminalBounty();

  if (!target) {
    t.skip('No terminal bounty found on the board right now - nothing safe to probe. Re-run later.');
    return;
  }

  const fresh = await refetchBounty(target.id);
  assert.ok(fresh, 'bounty disappeared between discovery and probe');
  assert.equal(
    String(fresh.status).toLowerCase(),
    target.status,
    'bounty status changed since discovery - aborting to stay safe, re-run the suite'
  );

  const impostor = randomWallet(); // never allowlisted, controlled by nobody real
  const message = buildSiweMessage({
    address: target.impersonatedAddress, // claims to BE this address...
    action: target.action,
    bountyId: target.id,
  });
  const signature = await signMessage(impostor, message); // ...but signs as the impostor

  const { status, body } = await patchBounty(target.id, {
    action: target.action,
    address: target.impersonatedAddress,
    extra: { signature, message },
  });

  if (status === 200 || status === 201) {
    assert.fail(
      `CRITICAL REGRESSION: bounty #${target.id} action "${target.action}" was processed ` +
        `(HTTP ${status}) using a signature from an unrelated wallet (${impostor.address}) ` +
        `claiming to be ${target.impersonatedAddress}. Signature recovery is not being ` +
        `checked against the claimed address. Response: ${JSON.stringify(body)}`
    );
  }

  assert.equal(
    status,
    401,
    `expected 401 for a mismatched signature, got ${status}. Response: ${JSON.stringify(body)}`
  );
});
