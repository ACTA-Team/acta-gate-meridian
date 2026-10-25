/**
 * Deploys an OpenZeppelin smart account (the `smart-account-kit` WASM) with one
 * Ed25519 external signer on its Default rule.
 *
 *   tsx scripts/deploy-smart-account.ts treasury   # policies: threshold 1-of-1 + credential-policy
 *   tsx scripts/deploy-smart-account.ts plain      # no policies (a test recipient)
 *
 * The treasury is the configuration from `docs/IMPLEMENTATION.md` section 7:
 * a single Default rule carrying both policies (trap 2).
 * Reads SPONSOR_SECRET, TREASURY_SIGNER_SECRET, ISSUER_SECRET, VC_GATE_ID,
 * CREDENTIAL_POLICY_ID and REQUIRED_TIER from `.env`.
 */
import { randomBytes } from "node:crypto";

import { CREDENTIAL_TYPE, getNetworkConfig } from "@acta-gate/shared";
import {
  Address,
  BASE_FEE,
  Keypair,
  nativeToScVal,
  Operation,
  rpc,
  TransactionBuilder,
  xdr,
} from "@stellar/stellar-sdk";

const kind = process.argv[2];
if (kind !== "treasury" && kind !== "plain") {
  throw new Error("usage: deploy-smart-account.ts treasury|plain");
}

const env = (name: string) => {
  const value = process.env[name];
  if (!value) throw new Error(`missing ${name}`);
  return value;
};

const network = getNetworkConfig("testnet");
const server = new rpc.Server(network.rpcUrl);
const sponsor = Keypair.fromSecret(env("SPONSOR_SECRET"));
const signer = Keypair.fromSecret(env("TREASURY_SIGNER_SECRET"));

const sym = (s: string) => xdr.ScVal.scvSymbol(s);

/** A `#[contracttype]` struct: a map with its field names sorted. */
function struct(fields: Record<string, xdr.ScVal>): xdr.ScVal {
  return xdr.ScVal.scvMap(
    Object.keys(fields)
      .sort()
      .map((k) => new xdr.ScMapEntry({ key: sym(k), val: fields[k]! })),
  );
}

/** A Soroban map: entries must be sorted by key. */
function sortedMap(entries: [xdr.ScVal, xdr.ScVal][]): xdr.ScVal {
  const sorted = entries.sort(([a], [b]) => Buffer.compare(a.toXDR(), b.toXDR()));
  return xdr.ScVal.scvMap(sorted.map(([key, val]) => new xdr.ScMapEntry({ key, val })));
}

const addr = (a: string) => new Address(a).toScVal();
const str = (s: string) => nativeToScVal(s, { type: "string" });

// Signer::External(ed25519 verifier, 32-byte public key)
const signers = xdr.ScVal.scvVec([
  xdr.ScVal.scvVec([
    sym("External"),
    addr(network.smartAccounts.ed25519Verifier),
    xdr.ScVal.scvBytes(signer.rawPublicKey()),
  ]),
]);

const policies =
  kind === "treasury"
    ? sortedMap([
        [
          addr(network.smartAccounts.thresholdPolicy),
          struct({ threshold: nativeToScVal(1, { type: "u32" }) }),
        ],
        [
          addr(env("CREDENTIAL_POLICY_ID")),
          struct({
            gate: addr(env("VC_GATE_ID")),
            issuer: addr(Keypair.fromSecret(env("ISSUER_SECRET")).publicKey()),
            credential_type: str(CREDENTIAL_TYPE),
            claims: xdr.ScVal.scvVec([
              struct({ key: str("tier"), value: str(process.env.REQUIRED_TIER ?? "Gold") }),
            ]),
          }),
        ],
      ])
    : xdr.ScVal.scvMap([]);

const account = await server.getAccount(sponsor.publicKey());
const tx = new TransactionBuilder(account, {
  fee: BASE_FEE,
  networkPassphrase: network.networkPassphrase,
})
  .addOperation(
    Operation.createCustomContract({
      address: new Address(sponsor.publicKey()),
      wasmHash: Buffer.from(network.smartAccounts.accountWasmHash, "hex"),
      constructorArgs: [signers, policies],
      salt: randomBytes(32),
    }),
  )
  .setTimeout(60)
  .build();

const prepared = await server.prepareTransaction(tx);
prepared.sign(sponsor);
const sent = await server.sendTransaction(prepared);
if (sent.status === "ERROR") throw new Error(`send failed: ${JSON.stringify(sent.errorResult)}`);

const result = await server.pollTransaction(sent.hash, { attempts: 30 });
if (result.status !== rpc.Api.GetTransactionStatus.SUCCESS) {
  throw new Error(`transaction ${sent.hash} failed: ${result.status}`);
}
const contractId = Address.fromScVal(result.returnValue!).toString();
console.log(`${kind} smart account: ${contractId}`);
console.log(`tx: ${network.explorerUrl}/tx/${sent.hash}`);
