import { getNetworkConfig } from "@acta-gate/shared";

import type { Messages } from "@/i18n/messages";

/** A random contract address, the shape of a smart account: someone with no credential. */
export function randomContractAddress(): Promise<string> {
  return import("@stellar/stellar-sdk").then(({ StrKey }) => {
    const bytes = crypto.getRandomValues(new Uint8Array(32));
    return StrKey.encodeContract(bytes as unknown as Buffer);
  });
}

/**
 * Marta's identity: an OpenZeppelin smart account controlled by a passkey
 * (`docs/IMPLEMENTATION.md` section 8, step 1), deployed on testnet.
 */
export async function createHolderWallet(
  userName: string,
  m: Messages["wallet"],
): Promise<{ address: string; txHash: string | null }> {
  // Without it smart-account-kit falls back to its shared, sign-only deployer and refuses to deploy.
  if (!process.env.NEXT_PUBLIC_DEPLOYER_SECRET) throw new Error(m.missingDeployer);
  const kit = await holderKit();
  const { contractId, submitResult } = await kit.createWallet("ACTA Gate", userName, {
    autoSubmit: true,
    forceMethod: "rpc",
  });
  if (submitResult && !submitResult.success) {
    throw new Error(m.deployFailed(submitResult.error.message));
  }
  return { address: contractId, txHash: submitResult?.success ? submitResult.hash : null };
}

/**
 * Marta signs an auth entry the backend prepared (`credential-vote.propose`
 * or `vote`) with her passkey. Her smart account has a single Default rule,
 * id 0. Returns the signed entry, base64; the backend submits it and pays.
 */
export async function signHolderAuth(
  address: string,
  authEntry: string,
  m: Messages["wallet"],
): Promise<string> {
  const { xdr } = await import("@stellar/stellar-sdk");
  const kit = await holderKit();
  // The passkey created in this browser is in IndexedDB: connecting is silent.
  const connected =
    (await kit.connectWallet({ contractId: address })) ??
    (await kit.connectWallet({ prompt: true }));
  if (connected?.contractId !== address) {
    throw new Error(m.notController);
  }
  const entry = xdr.SorobanAuthorizationEntry.fromXDR(authEntry, "base64");
  const signed = await kit.signAuthEntry(entry, { contextRuleIds: [0] });
  return signed.toXDR("base64");
}

async function holderKit() {
  const { SmartAccountKit, IndexedDBStorage } = await import("smart-account-kit");
  const network = getNetworkConfig("testnet");
  return new SmartAccountKit({
    rpcUrl: network.rpcUrl,
    networkPassphrase: network.networkPassphrase,
    accountWasmHash: network.smartAccounts.accountWasmHash,
    webauthnVerifierAddress: network.smartAccounts.webauthnVerifier,
    // Testnet only: this key ships to the browser (see the doc, step 1).
    deployerSecret: process.env.NEXT_PUBLIC_DEPLOYER_SECRET,
    rpName: "ACTA Gate",
    storage: new IndexedDBStorage(),
  });
}
