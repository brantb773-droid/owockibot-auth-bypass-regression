import test from 'node:test';
import assert from 'node:assert/strict';
import { findTerminalBounty, postComment } from '../src/client.js';

const ALLOW_DESTRUCTIVE = process.env.ALLOW_DESTRUCTIVE_COMMENT_TEST === 'true';

/**
 * Regression test for the second endpoint named in the bounty #335
 * report: POST /api/bounty-board/:id/comments, which also accepted an
 * unsigned author_address.
 *
 * Unlike PATCH on a terminal bounty, posting a comment is NOT idempotent
 * - every successful call creates a new, real, publicly-visible comment.
 * There's no "already in that state" trick to make a positive bypass
 * harmless. So this test is off by default. Flip
 * ALLOW_DESTRUCTIVE_COMMENT_TEST=true only when you have explicit
 * permission to post against this BASE_URL, and know you (or owocki)
 * can clean up the resulting comment if the bypass turns out to still
 * be open.
 */
test('POST /api/bounty-board/:id/comments rejects an impersonated author with no signature', async (t) => {
  if (!ALLOW_DESTRUCTIVE) {
    t.skip(
      'Skipped by default - this probe creates a real comment if the bypass is open. ' +
        'Set ALLOW_DESTRUCTIVE_COMMENT_TEST=true (with permission) to run it.'
    );
    return;
  }

  const target = await findTerminalBounty();
  if (!target) {
    t.skip('No bounty found to attach a test comment to.');
    return;
  }

  const impersonatedAddress = target.impersonatedAddress;
  const marker = `[regression-test ${new Date().toISOString()}] automated signature-bypass check for bounty #335 - safe to delete, reporter: Dune Builder follow-up suite.`;

  const { status, body } = await postComment(target.id, {
    author_address: impersonatedAddress,
    body: marker,
    // deliberately no signature / message
  });

  if (status === 200 || status === 201) {
    assert.fail(
      `CRITICAL REGRESSION: a comment was posted (HTTP ${status}) on bounty #${target.id} ` +
        `impersonating ${impersonatedAddress} with no signature. A real comment now exists - ` +
        `please delete it manually. Response: ${JSON.stringify(body)}`
    );
  }

  assert.equal(
    status,
    401,
    `expected 401 for an unsigned comment post, got ${status}. Response: ${JSON.stringify(body)}`
  );
});
