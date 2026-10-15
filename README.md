# owockibot-auth-bypass-regression

Regression test suite proving the critical auth bypass from **bounty #335**
(reported by Dune Builder, May 15 2026) cannot recur on `owockibot.xyz`.

## The original bug

> `PATCH /api/bounty-board/:id` accepted a `creator_address` /
> `claimer_address` in the request body but required **no proof of
> ownership of that wallet** - no signature, no SIWE, no auth header, no
> session. The server only checked that the address was on an allowlist.
>
> Since every bounty publicly exposes its `creator_address` and
> `claimer_address` via `GET /api/bounty-board`, anyone could copy an
> allowlisted address and impersonate that user for any state-changing
> action: claim, submit, complete, reject, cancel. The same flaw existed
> in `POST /api/bounty-board/:id/comments` via `author_address`.

Live reproduction at the time of the report: sending a `cancel` action for
bounty `#332` with a copied (not owned) `creator_address` returned `200
OK` and the action was processed. No challenge, no signature check.

**Impact:** anyone controlling a single allowlisted wallet could mass-cancel
every claimed bounty, mark spam as complete, inject phishing links as
submission URLs, reject legitimate submissions, or impersonate any wallet
in comments.

**Recommended fix** (from the report): adopt SIWE / EIP-4361 - request a
nonce, sign a message with the nonce + domain + action + bounty id, send
`{ action, address, signature, message }`, and have the server verify the
signature recovers to `address` *before* running the action.

Full original report: https://github.com/unleashedbelial/owockibot-bug-auth-bypass

## What this suite checks

| Endpoint | Test | What it proves |
|---|---|---|
| `PATCH /api/bounty-board/:id` | `bounty-patch-unauthenticated.test.js` | An impersonated address **with no signature at all** is rejected (401), not processed (200). This is the exact original bypass shape. |
| `PATCH /api/bounty-board/:id` | `bounty-patch-signature-mismatch.test.js` | An impersonated address with **a signature that doesn't belong to it** (signed by an unrelated throwaway wallet) is still rejected. Catches a shallow fix that checks "is *a* signature present" without checking it actually recovers to the claimed address. |
| `PATCH /api/bounty-board/:id` | `positive-path.test.js` | A **correctly** signed request from a wallet that actually owns the address is still accepted. Guards against an over-strict fix that breaks legitimate use. |
| `POST /api/bounty-board/:id/comments` | `comments-bypass.test.js` | Same unauthenticated-impersonation check as above, for the second endpoint named in the report. |
| `POST /api/bounty-board` (create) | `create-bounty.test.js` | **Not implemented** - see "Known gaps" below. |

## Safety design

This suite runs against `BASE_URL` (production `owockibot.xyz` by
default), so every test is designed to be safe to run there, and the
suite is conservative by default:

- **Idempotent targets.** The PATCH tests never invent a bounty to attack.
  They fetch the live board, find a bounty that is **already** in the
  terminal state matching the action they're about to send (e.g. they
  only send `cancel` to a bounty that's already cancelled), and
  double-check the status again immediately before firing the request.
  If the bypass is still open, the "successful" bypass changes nothing
  real - the bounty was already in that state.
- **No real bounty is ever cancelled, completed, or rejected by this
  suite that wasn't already in that state.**
- **The comments test is off by default.** Posting a comment is not
  idempotent - a successful bypass creates new, real, public content with
  no undo. It only runs if you explicitly set
  `ALLOW_DESTRUCTIVE_COMMENT_TEST=true`, and when it does, it posts a
  clearly-labeled test string identifying itself as an automated check.
- **The positive-path test is opt-in** and requires you to supply a
  wallet you actually control (`TEST_WALLET_PRIVATE_KEY`) that owns a
  bounty - it never runs against a wallet it doesn't have the key for.
- If a test can't find a safe target (no terminal bounty on the board
  right now, no env credentials configured), it **skips** with an
  explanation rather than failing or guessing.

## Running it

```bash
npm install
cp .env.example .env   # defaults are safe: points at production, all
                        # destructive flags off
npm test
```

Reading results:

- **FAIL with "CRITICAL REGRESSION"** → the bypass (or a variant of it)
  is back. Stop and fix before doing anything else.
- **PASS** → the server correctly rejected the unauthenticated/mismatched
  request.
- **SKIP** → nothing unsafe to probe right now (e.g. no terminal bounty
  currently on the board), or an opt-in test wasn't enabled. Not a
  failure.

To also run the comment-impersonation probe (only with permission):

```bash
ALLOW_DESTRUCTIVE_COMMENT_TEST=true npm test
```

### Continuous protection

`.github/workflows/regression.yml` runs the **non-destructive** tests
(unauthenticated + signature-mismatch PATCH checks) on a schedule and on
every push, so a regression gets caught automatically rather than waiting
for the next manual bug hunt. It intentionally does **not** enable the
destructive comment test or require `TEST_WALLET_PRIVATE_KEY` as repo
secrets - add those yourself if you want full coverage running in CI.

## Known gaps

- **`POST /api/bounty-board` (bounty creation)** is a state-changing
  endpoint and in scope, but its request body shape was never confirmed
  in the original report - only `PATCH /api/bounty-board/:id` and `POST
  /api/bounty-board/:id/comments` payloads were shown. Rather than guess
  a shape, write a false-passing test, or create a real bounty on
  production, `tests/create-bounty.test.js` documents this as an
  explicit TODO. To close this gap: confirm the real payload shape (same
  way the original report did - inspect the `/bounty` page's request
  code), then mirror the unauthenticated-PATCH test against it, gated
  behind `ALLOW_CREATE_BOUNTY_TEST`.
- **SIWE nonce replay** isn't tested, because owockibot.xyz doesn't issue
  nonces yet (that's the fix being recommended, not something live to
  test). Once a nonce endpoint exists, add a test that reuses a
  previously-valid signature/nonce pair and asserts it's rejected the
  second time.
- This suite was built and syntax/logic-verified in a sandboxed
  environment without outbound access to `owockibot.xyz`; the
  network-dependent tests were confirmed to fail cleanly (not crash) in
  that environment and will need a first live run against production (or
  staging) to confirm actual pass/fail status.

## Project layout

```
src/
  client.js   - BASE_URL, board fetch, terminal-bounty discovery, PATCH/comment senders
  siwe.js     - SIWE-style message building + signing helpers (ethers)
tests/
  bounty-patch-unauthenticated.test.js
  bounty-patch-signature-mismatch.test.js
  positive-path.test.js
  comments-bypass.test.js
  create-bounty.test.js   (documented gap, see above)
.env.example  - BASE_URL + safety-gate flags, all off/safe by default
```

---
Original finding: Dune Builder (`0x5ed8...55cb`), bounty #335, May 2026.
