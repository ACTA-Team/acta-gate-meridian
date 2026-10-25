import { Address, Keypair, Operation, rpc, TransactionBuilder, xdr } from "@stellar/stellar-sdk";

export interface HolderInvocation {
  server: rpc.Server;
  networkPassphrase: string;
  /** Pays the fees and is the transaction source. The holder never pays. */
  feePayer: Keypair;
  contract: string;
  method: string;
  args: xdr.ScVal[];
  /** The address whose `require_auth` the call hits: Marta's smart account. */
  holder: string;
}

export type HolderInvocationResult =
  | { ok: true; status: "unsigned"; authEntry: string }
  | { ok: true; status: "done"; txHash: string; returnValue: xdr.ScVal | undefined }
  | { ok: false; error: string };

function authAddress(entry: xdr.SorobanAuthorizationEntry): string | null {
  const credentials = entry.credentials();
  switch (credentials.switch().name) {
    case "sorobanCredentialsAddress":
      return Address.fromScAddress(credentials.address().address()).toString();
    case "sorobanCredentialsAddressV2":
      return Address.fromScAddress(credentials.addressV2().address()).toString();
    default:
      return null;
  }
}

async function draft(p: HolderInvocation, auth?: xdr.SorobanAuthorizationEntry[]) {
  const source = await p.server.getAccount(p.feePayer.publicKey());
  const call = Operation.invokeContractFunction({
    contract: p.contract,
    function: p.method,
    args: p.args,
  });
  const op = auth
    ? Operation.invokeHostFunction({
        func: call.body().invokeHostFunctionOp().hostFunction(),
        auth,
      })
    : call;
  return new TransactionBuilder(source, { fee: "1000000", networkPassphrase: p.networkPassphrase })
    .addOperation(op)
    .setTimeout(60)
    .build();
}

/**
 * A call that the holder authorizes with their passkey, in two rounds, the way
 * `payFromSmartAccount` does it for the treasury:
 *
 * 1. Without `signedAuth`: simulate in recording mode. The contract runs, so a
 *    rejection (`NotCredentialed`, `AlreadyVoted`…) surfaces here, before
 *    anyone signs. Otherwise it returns the holder's auth entry to sign.
 * 2. With `signedAuth` (that entry, signed by `smart-account-kit` in the
 *    browser): simulate again, so `__check_auth` runs and the WebAuthn
 *    signature is priced in, then submit with the fee payer.
 */
export async function invokeAsHolder(
  p: HolderInvocation,
  signedAuth?: string,
): Promise<HolderInvocationResult> {
  if (!signedAuth) {
    const recorded = await p.server.simulateTransaction(await draft(p));
    if (rpc.Api.isSimulationError(recorded)) return { ok: false, error: recorded.error };
    const entry = (recorded.result?.auth ?? []).find((e) => authAddress(e) === p.holder);
    if (!entry) return { ok: false, error: `the call needs no auth from ${p.holder}` };
    return { ok: true, status: "unsigned", authEntry: entry.toXDR("base64") };
  }

  const entry = xdr.SorobanAuthorizationEntry.fromXDR(signedAuth, "base64");
  if (authAddress(entry) !== p.holder) {
    return { ok: false, error: "the signed auth entry is not the holder's" };
  }
  const signed = await draft(p, [entry]);
  const enforced = await p.server.simulateTransaction(signed);
  if (rpc.Api.isSimulationError(enforced)) return { ok: false, error: enforced.error };

  const tx = rpc.assembleTransaction(signed, enforced).build();
  tx.sign(p.feePayer);
  const sent = await p.server.sendTransaction(tx);
  if (sent.status === "ERROR") {
    return { ok: false, error: sent.errorResult?.toXDR("base64") ?? "send failed" };
  }
  const result = await p.server.pollTransaction(sent.hash, { attempts: 30 });
  if (result.status !== rpc.Api.GetTransactionStatus.SUCCESS) {
    return { ok: false, error: `transaction ${sent.hash} ended as ${result.status}` };
  }
  return { ok: true, status: "done", txHash: sent.hash, returnValue: result.returnValue };
}
