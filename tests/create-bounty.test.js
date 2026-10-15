import test from 'node:test';

const ALLOW_CREATE = process.env.ALLOW_CREATE_BOUNTY_TEST === 'true';

/**
 * POST /api/bounty-board (create a new bounty) is a state-changing
 * endpoint and belongs in this suite's scope, but its request shape was
 * never confirmed in the original bounty #335 report or in the source
 * excerpt it quoted - only the PATCH and /comments payloads were.
 *
 * Rather than guess a shape and risk a false pass/fail, or silently
 * create a real bounty on production, this is left as an explicit TODO:
 *
 *   1. Confirm the real POST /api/bounty-board request body (check the
 *      /bounty page's bundle the way the original report did, or ask
 *      owocki directly).
 *   2. Implement an unauthenticated-create probe mirroring
 *      bounty-patch-unauthenticated.test.js, targeting a throwaway
 *      bounty you can then cancel/delete yourself.
 *   3. Gate it behind ALLOW_CREATE_BOUNTY_TEST, same pattern as the
 *      comments test, since a successful bypass here creates real,
 *      public content.
 */
test('POST /api/bounty-board create-endpoint coverage', { skip: true }, async (t) => {
  if (!ALLOW_CREATE) {
    t.skip('Not implemented yet - request shape unconfirmed. See comment above and README "Known gaps".');
  }
});
