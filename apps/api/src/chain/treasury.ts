import {
  Address,
  buildAuthorizationEntryPreimage,
  hash,
  Keypair,
  nativeToScVal,
  Operation,
  rpc,
  TransactionBuilder,
  xdr,
} from "@stellar/stellar-sdk";

/** The treasury has a single Default rule (trap 2); OpenZeppelin numbers it 0. */
const DEFAULT_RULE_ID = 0;
/** ~1 hour of ledgers, the kit's default signature lifetime. */
const SIGNATURE_LEDGERS = 720;

export interface SmartAccountPayment {
  server: rpc.Server;
  networkPassphrase: string;
  /** Pays the fees and is the transaction source. */
  feePayer: Keypair;
  /** The OpenZeppelin smart account paying. */
  account: string;
  /** Its Ed25519 external signer and that signer's verifier contract. */
  signer: Keypair;
  ed25519Verifier: string;
  token: string;
  to: string;
  /** In the token's smallest unit. */
  amount: bigint;
}

export type SmartAccountPaymentResult =
  { ok: true; txHash: string } | { ok: false; error: string; txHash: string | null };

function addressCredentials(entry: xdr.SorobanAuthorizationEntry) {
  const credentials = entry.credentials();
  switch (credentials.switch().name) {
    case "sorobanCredentialsAddress":
      return credentials.address();
    case "sorobanCredentialsAddressV2":
      return credentials.addressV2();
    default:
      return null;
  }
}

/**
 * `token.transfer(account, to, amount)`, authorized by the smart account.
 *
 * Builds the same signature `smart-account-kit` does for an Ed25519 external
 * signer, without needing a passkey to connect: the signer signs
 * `sha256(signature_payload ‖ XDR(context_rule_ids))` and the result goes in
 * an `AuthPayload { context_rule_ids, signers }`. The account's policies run in
 * the second simulation; a rejection from `credential-policy` surfaces there.
 */
export async function payFromSmartAccount(
  p: SmartAccountPayment,
): Promise<SmartAccountPaymentResult> {
  const transfer = Operation.invokeContractFunction({
    contract: p.token,
    function: "transfer",
    args: [
      new Address(p.account).toScVal(),
      new Address(p.to).toScVal(),
      nativeToScVal(p.amount, { type: "i128" }),
    ],
  });

  // 1. Simulate in recording mode to get the auth entries to sign.
  const source = await p.server.getAccount(p.feePayer.publicKey());
  const draft = new TransactionBuilder(source, {
    fee: "1000000",
    networkPassphrase: p.networkPassphrase,
  })
    .addOperation(transfer)
    .setTimeout(60)
    .build();
  const recorded = await p.server.simulateTransaction(draft);
  if (rpc.Api.isSimulationError(recorded))
    return { ok: false, error: recorded.error, txHash: null };

  // 2. Sign every entry that the smart account has to authorize.
  const { sequence } = await p.server.getLatestLedger();
  const expiration = sequence + SIGNATURE_LEDGERS;
  const ruleIds = xdr.ScVal.scvVec([xdr.ScVal.scvU32(DEFAULT_RULE_ID)]);
  const signerKey = xdr.ScVal.scvVec([
    xdr.ScVal.scvSymbol("External"),
    new Address(p.ed25519Verifier).toScVal(),
    xdr.ScVal.scvBytes(p.signer.rawPublicKey()),
  ]);

  const auth = (recorded.result?.auth ?? []).map((entry) => {
    const creds = addressCredentials(entry);
    if (!creds || Address.fromScAddress(creds.address()).toString() !== p.account) return entry;
    creds.signatureExpirationLedger(expiration);
    const payload = hash(
      buildAuthorizationEntryPreimage(entry, expiration, p.networkPassphrase).toXDR(),
    );
    const digest = hash(Buffer.concat([payload, ruleIds.toXDR()]));
    creds.signature(
      xdr.ScVal.scvMap([
        new xdr.ScMapEntry({ key: xdr.ScVal.scvSymbol("context_rule_ids"), val: ruleIds }),
        new xdr.ScMapEntry({
          key: xdr.ScVal.scvSymbol("signers"),
          val: xdr.ScVal.scvMap([
            new xdr.ScMapEntry({ key: signerKey, val: xdr.ScVal.scvBytes(p.signer.sign(digest)) }),
          ]),
        }),
      ]),
    );
    return entry;
  });

  // 3. Simulate again with the signatures: `__check_auth` and the policies run now.
  const signed = new TransactionBuilder(await p.server.getAccount(p.feePayer.publicKey()), {
    fee: "1000000",
    networkPassphrase: p.networkPassphrase,
  })
    .addOperation(
      Operation.invokeHostFunction({
        func: draft
          .toEnvelope()
          .v1()
          .tx()
          .operations()[0]!
          .body()
          .invokeHostFunctionOp()
          .hostFunction(),
        auth,
      }),
    )
    .setTimeout(60)
    .build();
  const enforced = await p.server.simulateTransaction(signed);
  if (rpc.Api.isSimulationError(enforced))
    return { ok: false, error: enforced.error, txHash: null };

  // 4. Submit.
  const tx = rpc.assembleTransaction(signed, enforced).build();
  tx.sign(p.feePayer);
  const sent = await p.server.sendTransaction(tx);
  if (sent.status === "ERROR") {
    return {
      ok: false,
      error: sent.errorResult?.toXDR("base64") ?? "send failed",
      txHash: sent.hash,
    };
  }
  const result = await p.server.pollTransaction(sent.hash, { attempts: 30 });
  if (result.status !== rpc.Api.GetTransactionStatus.SUCCESS) {
    return { ok: false, error: `transaction ended as ${result.status}`, txHash: sent.hash };
  }
  return { ok: true, txHash: sent.hash };
}
