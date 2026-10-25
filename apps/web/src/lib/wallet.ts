import { getNetworkConfig, type ChainMode } from "@acta-gate/shared";

/** A random contract address, the shape of a smart account. */
export function randomContractAddress(): Promise<string> {
  return import("@stellar/stellar-sdk").then(({ StrKey }) => {
    const bytes = crypto.getRandomValues(new Uint8Array(32));
    return StrKey.encodeContract(bytes as unknown as Buffer);
  });
}

/**
 * Marta's identity: an OpenZeppelin smart account controlled by a passkey
 * (`docs/IMPLEMENTATION ES.md` section 8, step 1). In mock mode there is no
 * chain to deploy to, so a random `C…` address stands in for it.
 */
export async function createHolderWallet(
  mode: ChainMode,
  userName: string,
): Promise<{ address: string; txHash: string | null }> {
  if (mode === "mock") return { address: await randomContractAddress(), txHash: null };

  const { SmartAccountKit, IndexedDBStorage } = await import("smart-account-kit");
  const network = getNetworkConfig("testnet");
  const kit = new SmartAccountKit({
    rpcUrl: network.rpcUrl,
    networkPassphrase: network.networkPassphrase,
    accountWasmHash: network.smartAccounts.accountWasmHash,
    webauthnVerifierAddress: network.smartAccounts.webauthnVerifier,
    // Testnet only: this key ships to the browser (see the doc, step 1).
    deployerSecret: process.env.NEXT_PUBLIC_DEPLOYER_SECRET,
    rpName: "ACTA Gate",
    storage: new IndexedDBStorage(),
  });
  const { contractId, submitResult } = await kit.createWallet("ACTA Gate", userName, {
    autoSubmit: true,
    forceMethod: "rpc",
  });
  if (submitResult && !submitResult.success) {
    throw new Error(`No se pudo desplegar la smart account: ${submitResult.error.message}`);
  }
  return { address: contractId, txHash: submitResult?.success ? submitResult.hash : null };
}
