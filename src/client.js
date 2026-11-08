import 'dotenv/config';

export const BASE_URL = (process.env.BASE_URL || 'https://owockibot.xyz').replace(/\/+$/, '');

/**
 * Statuses we consider "terminal" for a bounty. Replaying a state-changing
 * action against a bounty that is ALREADY in one of these states is
 * idempotent on a correctly-behaving server: the record doesn't move into
 * a new state. That's what makes it safe to probe in production - if the
 * bypass is open and the request DOES get processed, nothing new breaks,
 * because the bounty was already cancelled/completed/rejected.
 */
const TERMINAL_ACTIONS = {
  cancelled: 'cancel',
  completed: 'complete',
  rejected: 'reject',
};

/**
 * Fetch the public bounty board. This endpoint is read-only (GET) and is
 * NOT part of the vulnerability - it's how the original report (and any
 * attacker) discovers real creator/claimer addresses to impersonate.
 */
export async function fetchBountyBoard() {
  const res = await fetch(`${BASE_URL}/api/bounty-board`);
  if (!res.ok) {
    throw new Error(`GET /api/bounty-board failed: ${res.status} ${res.statusText}`);
  }
  return res.json();
}

/**
 * Find a bounty that is already in a terminal state and has a populated
 * address we can impersonate (creator for cancel/reject, claimer for
 * complete). Returns null if none found so a test can skip cleanly
 * instead of guessing.
 */
export async function findTerminalBounty() {
  const board = await fetchBountyBoard();
  const list = Array.isArray(board) ? board : board?.bounties || board?.data || [];

  for (const bounty of list) {
    const status = String(bounty.status || '').toLowerCase();
    const action = TERMINAL_ACTIONS[status];
    if (!action) continue;

    const impersonatedAddress =
      action === 'complete' ? bounty.claimer_address : bounty.creator_address;

    if (impersonatedAddress) {
      return { id: bounty.id, status, action, impersonatedAddress, raw: bounty };
    }
  }
  return null;
}

/**
 * Re-check a single bounty's current status right before firing the test
 * request, to close the race window between discovery and the probe.
 */
export async function refetchBounty(id) {
  const board = await fetchBountyBoard();
  const list = Array.isArray(board) ? board : board?.bounties || board?.data || [];
  return list.find((b) => String(b.id) === String(id)) || null;
}

/**
 * Send the state-changing PATCH. `extra` lets a test attach whatever the
 * current API expects for proof of identity (signature/message) - or
 * nothing at all, to probe the original unauthenticated-bypass shape.
 */
export async function patchBounty(id, { action, address, extra = {} } = {}) {
  const res = await fetch(`${BASE_URL}/api/bounty-board/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action,
      creator_address: address,
      claimer_address: address,
      ...extra,
    }),
  });
  let body = null;
  try {
    body = await res.json();
  } catch {
    // non-JSON response is fine, we only assert on status below
  }
  return { status: res.status, body };
}

/**
 * Send a comment-creation POST, same shape of probe as patchBounty.
 */
export async function postComment(id, { author_address, body: commentBody, extra = {} } = {}) {
  const res = await fetch(`${BASE_URL}/api/bounty-board/${id}/comments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      author_address,
      body: commentBody,
      ...extra,
    }),
  });
  let parsed = null;
  try {
    parsed = await res.json();
  } catch {
    // ignore
  }
  return { status: res.status, body: parsed };
}
