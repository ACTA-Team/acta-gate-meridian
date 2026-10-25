import { randomBytes } from "node:crypto";

import { CREDENTIAL_TYPE, type CredentialStatus, type Proposal } from "@acta-gate/shared";
import {
  Address,
  contract,
  Keypair,
  nativeToScVal,
  rpc,
  scValToNative,
  xdr,
} from "@stellar/stellar-sdk";

import type { Config } from "../config.js";
import { HttpError } from "../errors.js";
import { didFromId, multikeyP256, newDidId } from "../did.js";
import { invokeAsHolder } from "./holder-call.js";
import { payFromSmartAccount } from "./treasury.js";
import {
  ContractError,
  type GateChain,
  type GateRecord,
  type HolderCall,
  type PaymentOutcome,
} from "./types.js";

/** Stops listing proposals here: each one is a read. */
const MAX_PROPOSALS = 50;

/** ~10 s in total: a lagging RPC node catches up within a ledger or two. */
const REGISTER_ATTEMPTS = 5;
const REGISTER_RETRY_MS = 2_500;

/** USDC (and every SAC) has 7 decimals. */
function toStroops(amount: string): bigint {
  const [whole = "0", fraction = ""] = amount.split(".");
  return BigInt(whole) * 10_000_000n + BigInt(fraction.padEnd(7, "0").slice(0, 7));
}

type Method = (args?: Record<string, unknown>) => Promise<contract.AssembledTransaction<unknown>>;
type DynamicClient = Record<string, Method>;

/** Contract error codes, from each contract's `error.rs`. */
const GATE_ERRORS: Record<number, string> = {
  1: "NotAVault",
  2: "InputTooLong",
  3: "NotTheIssuer",
  4: "CredentialNotValid",
  99: "NotImplemented",
};
const POLICY_ERRORS: Record<number, string> = {
  1: "NoSigners",
  2: "RecipientNotCredentialed",
  3: "AllowanceNotPermitted",
  99: "NotImplemented",
};
const VOTE_ERRORS: Record<number, string> = {
  1: "NotCredentialed",
  2: "ProposalNotFound",
  3: "AlreadyVoted",
  4: "InputTooLong",
  5: "MalformedRequirement",
};

interface RawProposal {
  id: number;
  proposer: string;
  title: string;
  in_favor: number;
  against: number;
  created_at: bigint | number;
}

function toProposal(p: RawProposal): Proposal {
  return {
    id: Number(p.id),
    proposer: p.proposer,
    title: p.title,
    inFavor: Number(p.in_favor),
    against: Number(p.against),
    createdAt: new Date(Number(p.created_at) * 1000).toISOString(),
  };
}

function contractErrorCode(err: unknown): number | null {
  const match = /Error\(Contract, #(\d+)\)/.exec(String(err instanceof Error ? err.message : err));
  return match ? Number(match[1]) : null;
}

function rethrow(err: unknown, names: Record<number, string>): never {
  const code = contractErrorCode(err);
  if (code !== null) {
    throw new ContractError(names[code] ?? `ContractError${code}`, String(err));
  }
  throw err;
}

/**
 * Calls the deployed contracts on testnet. Clients are built from each
 * contract's on-chain spec (`contract.Client.from`), so no bindings are needed.
 *
 * Reads are simulated with the sponsor as source. GrantFox's key and the
 * treasury are only needed by the calls that use them: without them the
 * holder's wallet, DID and vault still work, and those calls say what is
 * missing.
 */
export class StellarChain implements GateChain {
  readonly issuerAddress: string;
  readonly treasuryAddress: string;
  readonly voteAddress: string | null;

  private readonly sponsor: Keypair;
  private readonly issuerKey: Keypair | null;
  private readonly clients = new Map<string, Promise<DynamicClient>>();
  private readonly rpc: rpc.Server;

  constructor(private readonly config: Config) {
    this.sponsor = Keypair.fromSecret(config.SPONSOR_SECRET!);
    this.issuerKey = config.ISSUER_SECRET ? Keypair.fromSecret(config.ISSUER_SECRET) : null;
    this.issuerAddress = this.issuerKey?.publicKey() ?? config.ISSUER_ADDRESS;
    this.treasuryAddress = config.TREASURY_ADDRESS ?? "";
    this.voteAddress = config.CREDENTIAL_VOTE_ID ?? null;
    this.rpc = new rpc.Server(config.stellar.rpcUrl);
  }

  /**
   * The holder's passkey is read from their smart account, not taken from
   * the browser: rule 0 holds `Signer::External(webauthn verifier, key)`.
   * The DID's only authentication key is that passkey, Multikey-encoded.
   */
  async registerDid(holder: string) {
    const passkey = await this.passkeyOf(holder);
    const didId = newDidId();
    const did = didFromId(didId, "testnet");
    const registry = await this.client(
      this.config.stellar.contracts.didStellarRegistry,
      this.sponsor,
    );
    const tx = await registry.register_sponsored!({
      sponsor: this.sponsor.publicKey(),
      did_id: didId,
      initial_record: {
        controller: holder,
        authentication: [{ public_key_multibase: multikeyP256(passkey) }],
        assertion_method: [],
        key_agreement: [],
        services: [],
        metadata_uri: null,
        metadata_hash: null,
        // Set by the contract on registration.
        version: 0,
        created_ledger: 0,
        updated_ledger: 0,
        deactivated: false,
      },
    });
    return { did, txHash: await this.send(tx, this.sponsor) };
  }

  async deployVault(owner: string, didUri: string) {
    const factory = await this.client(this.config.VAULT_FACTORY_ID!, this.sponsor);
    const tx = await factory.deploy_sponsored!({
      deployer: this.sponsor.publicKey(),
      owner,
      did_uri: didUri,
      user_salt: randomBytes(32),
    });
    const txHash = await this.send(tx, this.sponsor);
    return { vault: tx.result as string, txHash };
  }

  async vaultDid(vault: string) {
    const v = await this.client(vault, this.sponsor);
    const { result } = await v.vault_did!();
    return typeof result === "string" && result.length > 0 ? result : null;
  }

  /** The uncompressed P-256 key of the account's WebAuthn signer on rule 0. */
  private async passkeyOf(holder: string): Promise<Uint8Array> {
    const account = await this.client(holder, this.sponsor);
    const { result } = await account.get_context_rule!({ context_rule_id: 0 });
    const signers = (result as { signers?: { tag: string; values: unknown[] }[] }).signers ?? [];
    const webauthn = this.config.stellar.smartAccounts.webauthnVerifier;
    const passkey = signers.find((s) => s.tag === "External" && s.values[0] === webauthn);
    if (!passkey) {
      throw new ContractError("NoPasskey", "The account has no WebAuthn signer on its rule 0");
    }
    return new Uint8Array(passkey.values[1] as Uint8Array);
  }

  async issue(vault: string, vcId: string, vcData: string) {
    const issuer = this.issuer();
    const v = await this.client(vault, issuer);
    const tx = await v.issue!({
      vc_id: vcId,
      vc_data: vcData,
      vault_contract: vault,
      issuer_addr: this.issuerAddress,
      issuer_did: "",
    });
    return { txHash: await this.send(tx, issuer) };
  }

  /**
   * Called right after `issue`. The testnet RPC balances requests across
   * nodes, and one that is a ledger behind does not see the new credential
   * yet: `vc-gate` then answers `NotTheIssuer`. That case is retried.
   */
  async register(vault: string, vcId: string, claims: Record<string, string>) {
    const issuer = this.issuer();
    const gate = await this.client(this.config.VC_GATE_ID!, issuer);
    for (let attempt = 1; ; attempt++) {
      try {
        const tx = await gate.register!({
          issuer: this.issuerAddress,
          vault,
          vc_id: vcId,
          credential_type: CREDENTIAL_TYPE,
          claims: new Map(Object.entries(claims)),
        });
        return { txHash: await this.send(tx, issuer) };
      } catch (err) {
        const lagging = GATE_ERRORS[contractErrorCode(err) ?? -1] === "NotTheIssuer";
        if (lagging && attempt < REGISTER_ATTEMPTS) {
          await new Promise((r) => setTimeout(r, REGISTER_RETRY_MS));
          continue;
        }
        rethrow(err, GATE_ERRORS);
      }
    }
  }

  async revokeByIssuer(vault: string, vcId: string, date: string) {
    const issuer = this.issuer();
    const v = await this.client(vault, issuer);
    const tx = await v.revoke_by_issuer!({ vc_id: vcId, date });
    return { txHash: await this.send(tx, issuer) };
  }

  async verifyVc(vault: string, vcId: string): Promise<CredentialStatus> {
    const v = await this.client(vault, this.sponsor);
    const { result } = await v.verify_vc!({ vc_id: vcId });
    const tag = (result as { tag?: string }).tag;
    if (tag === "Valid") return "valid";
    if (tag === "Revoked") return "revoked";
    return "invalid";
  }

  async gateRecord(holder: string): Promise<GateRecord | null> {
    const gate = await this.client(this.config.VC_GATE_ID!, this.sponsor);
    const { result } = await gate.get_record!(this.gateKey(holder));
    if (!result) return null;
    const r = result as {
      registered_at: bigint | number;
      vault: string;
      vc_id: string;
      claims: Map<string, string> | Record<string, string>;
    };
    // A Soroban `Map` comes back from the spec as an array of `[key, value]` pairs.
    const claims =
      r.claims instanceof Map || Array.isArray(r.claims) ? Object.fromEntries(r.claims) : r.claims;
    const registeredAt = new Date(Number(r.registered_at) * 1000).toISOString();
    return { vault: r.vault, vcId: r.vc_id, claims, registeredAt };
  }

  async gateIsValid(holder: string) {
    const gate = await this.client(this.config.VC_GATE_ID!, this.sponsor);
    const { result } = await gate.is_valid!(this.gateKey(holder));
    return result === true;
  }

  /**
   * The treasury is an OpenZeppelin smart account with an Ed25519 external
   * signer. `smart-account-kit` cannot connect to it without a passkey, so
   * `payFromSmartAccount` signs its auth payload directly. A policy rejection
   * surfaces when the signed call is simulated.
   */
  async pay(to: string, amount: string): Promise<PaymentOutcome> {
    const { stellar } = this.config;
    const result = await payFromSmartAccount({
      server: this.rpc,
      networkPassphrase: stellar.networkPassphrase,
      feePayer: this.sponsor,
      account: this.treasury(),
      signer: Keypair.fromSecret(
        this.setting("TREASURY_SIGNER_SECRET", "to sign the treasury's payments"),
      ),
      ed25519Verifier: stellar.smartAccounts.ed25519Verifier,
      token: stellar.contracts.usdc,
      to,
      amount: toStroops(amount),
    });
    if (result.ok) return result;
    const code = contractErrorCode(result.error);
    const reason = code !== null ? (POLICY_ERRORS[code] ?? `ContractError${code}`) : result.error;
    return { ok: false, reason, txHash: result.txHash };
  }

  async canVote(who: string) {
    const vote = await this.client(this.requireVote(), this.sponsor);
    const { result } = await vote.can_vote!({ who });
    return result === true;
  }

  /** The contract has no count: read ids from 0 until one is missing. */
  async proposals() {
    const vote = await this.client(this.requireVote(), this.sponsor);
    const list: Proposal[] = [];
    for (let id = 0; id < MAX_PROPOSALS; id++) {
      const { result } = await vote.proposal!({ id });
      if (!result) break;
      list.push(toProposal(result as RawProposal));
    }
    return list;
  }

  async hasVoted(proposal: number, voter: string) {
    const vote = await this.client(this.requireVote(), this.sponsor);
    const { result } = await vote.has_voted!({ proposal, voter });
    return result === true;
  }

  async propose(proposer: string, title: string, auth?: string): Promise<HolderCall<number>> {
    const args = [new Address(proposer).toScVal(), nativeToScVal(title, { type: "string" })];
    const done = await this.asHolder("propose", proposer, args, auth);
    if (done.status === "unsigned") return done;
    return { status: "done", value: Number(scValToNative(done.returnValue!)), txHash: done.txHash };
  }

  async vote(
    voter: string,
    proposal: number,
    inFavor: boolean,
    auth?: string,
  ): Promise<HolderCall<null>> {
    const args = [
      new Address(voter).toScVal(),
      xdr.ScVal.scvU32(proposal),
      xdr.ScVal.scvBool(inFavor),
    ];
    const done = await this.asHolder("vote", voter, args, auth);
    if (done.status === "unsigned") return done;
    return { status: "done", value: null, txHash: done.txHash };
  }

  /**
   * `propose` and `vote` call `require_auth` on the holder: Marta signs with
   * her passkey in the browser, and ACTA's sponsor pays the fee.
   */
  private async asHolder(method: string, holder: string, args: xdr.ScVal[], auth?: string) {
    const result = await invokeAsHolder(
      {
        server: this.rpc,
        networkPassphrase: this.config.stellar.networkPassphrase,
        feePayer: this.sponsor,
        contract: this.requireVote(),
        method,
        args,
        holder,
      },
      auth,
    );
    if (!result.ok) rethrow(new Error(result.error), VOTE_ERRORS);
    if (result.status === "unsigned") return result;
    // So the next read (often on another node) already sees the new tally.
    await this.settle((await this.rpc.getLatestLedger()).sequence);
    return result;
  }

  /** GrantFox's key: `credential-vote` and the policy only trust this issuer. */
  private issuer(): Keypair {
    if (!this.issuerKey)
      this.setting(
        "ISSUER_SECRET",
        `GrantFox's key (${this.issuerAddress}), to issue, register and revoke`,
      );
    return this.issuerKey!;
  }

  private treasury(): string {
    return this.setting(
      "TREASURY_ADDRESS",
      "the treasury smart account, with the current credential-policy",
    );
  }

  /** A setting only some calls need, or a 503 that names it. */
  private setting(
    name: "ISSUER_SECRET" | "TREASURY_ADDRESS" | "TREASURY_SIGNER_SECRET",
    what: string,
  ): string {
    const value = this.config[name];
    if (!value)
      throw new HttpError(503, "MissingSetting", `${name} is not set in apps/api/.env: ${what}`);
    return value;
  }

  private requireVote(): string {
    if (!this.voteAddress) throw new Error("CREDENTIAL_VOTE_ID is not set");
    return this.voteAddress;
  }

  /**
   * Signs and submits an already simulated call. Not `signAndSend()`: in
   * stellar-sdk 16 it counts the resource fee twice when it rebuilds the
   * transaction, and a vault deployment then overflows the u32 fee field.
   * The invoker is the source account, so there are no auth entries to sign.
   */
  private async send(tx: contract.AssembledTransaction<unknown>, signer: Keypair): Promise<string> {
    if (tx.simulation && rpc.Api.isSimulationError(tx.simulation)) {
      throw new Error(tx.simulation.error);
    }
    const built = tx.built!;
    built.sign(signer);
    const sent = await this.rpc.sendTransaction(built);
    if (sent.status === "ERROR") {
      throw new Error(`send failed: ${sent.errorResult?.toXDR("base64") ?? "unknown"}`);
    }
    const result = await this.rpc.pollTransaction(sent.hash, { attempts: 30 });
    if (result.status !== rpc.Api.GetTransactionStatus.SUCCESS) {
      throw new Error(`transaction ${sent.hash} ended as ${result.status}`);
    }
    await this.settle(result.ledger);
    return sent.hash;
  }

  /**
   * Waits until the RPC reports a ledger after `ledger`, so the next call
   * (often simulated on another node behind the load balancer) sees this one.
   */
  private async settle(ledger: number) {
    for (let i = 0; i < 10; i++) {
      const { sequence } = await this.rpc.getLatestLedger();
      if (sequence > ledger) return;
      await new Promise((r) => setTimeout(r, 1_000));
    }
  }

  private gateKey(holder: string) {
    return { holder, issuer: this.issuerAddress, credential_type: CREDENTIAL_TYPE };
  }

  private client(contractId: string, signer: Keypair): Promise<DynamicClient> {
    const key = `${contractId}:${signer.publicKey()}`;
    let client = this.clients.get(key);
    if (!client) {
      const { rpcUrl, networkPassphrase } = this.config.stellar;
      client = contract.Client.from({
        contractId,
        rpcUrl,
        networkPassphrase,
        publicKey: signer.publicKey(),
        ...contract.basicNodeSigner(signer, networkPassphrase),
      }) as unknown as Promise<DynamicClient>;
      this.clients.set(key, client);
    }
    return client;
  }
}
