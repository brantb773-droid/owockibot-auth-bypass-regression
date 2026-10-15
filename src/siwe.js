import { Wallet } from 'ethers';
import { BASE_URL } from './client.js';

/**
 * owockibot.xyz does not implement SIWE yet (that's the whole bug - see
 * README "Status as of writing"). There is no nonce endpoint to call.
 * This builds a plausible EIP-4361-shaped message anyway, matching the
 * report's fix recommendation, so these tests keep working unchanged
 * once SIWE ships: a real nonce from the server just gets interpolated
 * in instead of the placeholder.
 */
export function buildSiweMessage({ address, action, bountyId, nonce = 'regression-test' }) {
  const domain = new URL(BASE_URL).host;
  return [
    `${domain} wants you to sign in with your Ethereum account:`,
    address,
    '',
    `Authorize bounty-board action "${action}" on bounty #${bountyId}.`,
    '',
    `URI: ${BASE_URL}`,
    'Version: 1',
    'Chain ID: 1',
    `Nonce: ${nonce}`,
    `Issued At: ${new Date().toISOString()}`,
  ].join('\n');
}

/** Sign a message with a given wallet (personal_sign / EIP-191). */
export async function signMessage(wallet, message) {
  return wallet.signMessage(message);
}

/** A fresh, throwaway wallet - never an allowlisted one. */
export function randomWallet() {
  return Wallet.createRandom();
}

/** The project's designated test wallet, if the operator has set one. */
export function envWallet() {
  const key = process.env.TEST_WALLET_PRIVATE_KEY;
  return key ? new Wallet(key) : null;
}
