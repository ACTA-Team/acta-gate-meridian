import { randomUUID } from "node:crypto";

import {
  CREDENTIAL_TYPE,
  TIERS,
  type ActionResult,
  type ActivityEvent,
  type ActivityKind,
  type DemoConfig,
  type HolderCredential,
  type HolderView,
  type PaymentResult,
  type Proposal,
  type ProposalView,
  type Tier,
  type VoteActionResult,
} from "@acta-gate/shared";

import { ContractError, type GateChain, type HolderCall } from "./chain/types.js";
import type { Config } from "./config.js";
import { HttpError } from "./errors.js";

interface HolderState {
  did: string | null;
  vault: string | null;
  credential: { vcId: string; tier: Tier; issuedAt: string; revokedAt: string | null } | null;
}

const MAX_ACTIVITY = 100;
const short = (address: string) => `${address.slice(0, 4)}…${address.slice(-4)}`;

/**
 * The demo from `docs/IDEA.md`: ACTA sponsors Marta's vault, GrantFox issues
 * and registers in `vc-gate`, the treasury pays, GrantFox revokes. Next to the
 * treasury, `credential-vote`: the same credential lets Marta propose and vote,
 * and the same revocation stops her.
 *
 * Holder → vault is kept in memory: the factory has no index by owner.
 */
export class Demo {
  private readonly holders = new Map<string, HolderState>();
  private readonly activity: ActivityEvent[] = [];

  constructor(
    private readonly chain: GateChain,
    private readonly config: Config,
  ) {}

  info(): DemoConfig {
    const { stellar } = this.config;
    return {
      network: this.config.STELLAR_NETWORK,
      explorerUrl: stellar.explorerUrl,
      credentialType: CREDENTIAL_TYPE,
      requiredTier: this.config.REQUIRED_TIER,
      issuer: { name: this.config.ISSUER_NAME, address: this.chain.issuerAddress },
      treasury: { name: this.config.TREASURY_NAME, address: this.chain.treasuryAddress },
      vote: this.chain.voteAddress
        ? { name: this.config.VOTE_NAME, address: this.chain.voteAddress }
        : null,
      contracts: {
        vcVaultFactory: this.config.VAULT_FACTORY_ID,
        vcGate: this.config.VC_GATE_ID,
        credentialPolicy: this.config.CREDENTIAL_POLICY_ID,
        credentialVote: this.config.CREDENTIAL_VOTE_ID,
        usdc: stellar.contracts.usdc,
      },
    };
  }

  /**
   * Step 1a: ACTA registers the holder's `did:stellar`, with the passkey of
   * their smart account as its key. The holder signs nothing.
   */
  async registerDid(address: string): Promise<ActionResult> {
    let txHash: string | null = null;
    const known = await this.load(address);
    if (!known?.did) {
      const registered = await this.chain.registerDid(address);
      txHash = registered.txHash;
      this.holders.set(address, {
        did: registered.did,
        vault: known?.vault ?? null,
        credential: known?.credential ?? null,
      });
      this.log(
        "did_registered",
        "DID created",
        `ACTA registered ${registered.did} for ${short(address)}`,
        address,
        txHash,
        { did: registered.did },
      );
    }
    return { holder: await this.view(address), txHash };
  }

  /** Step 1b: ACTA creates the holder's vault, bound to their DID if they have one. */
  async createHolder(address: string): Promise<ActionResult> {
    let txHash: string | null = null;
    const known = await this.load(address);
    if (!known?.vault) {
      const deployed = await this.chain.deployVault(address, known?.did ?? "");
      txHash = deployed.txHash;
      this.holders.set(address, {
        did: known?.did ?? null,
        vault: deployed.vault,
        credential: null,
      });
      this.log(
        "vault_deployed",
        "Vault created",
        `ACTA sponsored the vault of ${short(address)}`,
        address,
        txHash,
      );
    }
    return { holder: await this.view(address), txHash };
  }

  /** Step 2a: GrantFox issues into the vault (`vault.issue`). */
  async issue(address: string, tier: Tier): Promise<ActionResult> {
    const holder = await this.holder(address);
    const vcId = `urn:uuid:${randomUUID()}`;
    const issuedAt = new Date().toISOString();
    const vcData = JSON.stringify({
      "@context": ["https://www.w3.org/ns/credentials/v2"],
      id: vcId,
      type: ["VerifiableCredential", CREDENTIAL_TYPE],
      issuer: this.chain.issuerAddress,
      validFrom: issuedAt,
      // The subject is the holder's DID when they have one, as a VC expects.
      credentialSubject: { id: holder.did ?? address, tier },
    });

    const issued = await this.chain.issue(holder.vault, vcId, vcData);
    this.log(
      "credential_issued",
      `${tier} credential issued`,
      `${this.config.ISSUER_NAME} → vault ${short(holder.vault)}`,
      address,
      issued.txHash,
      { tier, issuer: this.config.ISSUER_NAME, vault: holder.vault },
    );
    holder.credential = { vcId, tier, issuedAt, revokedAt: null };
    return { holder: await this.view(address), txHash: issued.txHash };
  }

  /** Step 2b: GrantFox registers the public claim in `vc-gate` (`gate.register`). */
  async register(address: string): Promise<ActionResult> {
    const holder = await this.holder(address);
    const vc = holder.credential;
    if (!vc || vc.revokedAt) {
      throw new HttpError(409, "NoValidCredential", "Issue a credential before registering it");
    }
    const { txHash } = await this.chain.register(holder.vault, vc.vcId, { tier: vc.tier });
    this.log(
      "gate_registered",
      "Registered in vc-gate",
      `tier: ${vc.tier} for ${short(address)}`,
      address,
      txHash,
      { tier: vc.tier },
    );
    return { holder: await this.view(address), txHash };
  }

  /** Step 5: GrantFox revokes in the vault. `vc-gate` sees it on the next read. */
  async revoke(address: string): Promise<ActionResult> {
    const holder = await this.holder(address);
    if (!holder.credential || holder.credential.revokedAt) {
      throw new HttpError(
        409,
        "NoValidCredential",
        "This holder has no valid credential to revoke",
      );
    }
    const date = new Date().toISOString();
    const { txHash } = await this.chain.revokeByIssuer(holder.vault, holder.credential.vcId, date);
    holder.credential.revokedAt = date;
    this.log(
      "credential_revoked",
      "Credential revoked",
      `${this.config.ISSUER_NAME} revoked in the vault of ${short(address)}`,
      address,
      txHash,
      { issuer: this.config.ISSUER_NAME },
    );
    return { holder: await this.view(address), txHash };
  }

  /** Steps 3 and 4: the treasury pays; `credential-policy` decides. */
  async pay(to: string, amount: string): Promise<PaymentResult> {
    const outcome = await this.chain.pay(to, amount);
    if (outcome.ok) {
      this.log(
        "payment_sent",
        `Payment of ${amount} USDC`,
        `The treasury paid ${short(to)}`,
        to,
        outcome.txHash,
        { amount },
      );
      return { status: "paid", to, amount, reason: null, txHash: outcome.txHash };
    }
    this.log(
      "payment_rejected",
      "Payment rejected",
      `${short(to)}: ${outcome.reason}`,
      to,
      outcome.txHash,
      { amount, reason: outcome.reason },
    );
    return { status: "rejected", to, amount, reason: outcome.reason, txHash: outcome.txHash };
  }

  /** Newest first. With `voter`, says whether they already voted on each one. */
  async proposals(voter?: string): Promise<ProposalView[]> {
    this.requireVote();
    const list = await this.chain.proposals();
    const views = await Promise.all(
      list.map(async (p) => ({
        ...p,
        hasVoted: voter ? await this.chain.hasVoted(p.id, voter) : false,
      })),
    );
    return views.reverse();
  }

  /** The holder opens a proposal (`credential-vote.propose`); `vc-gate` decides. */
  async propose(proposer: string, title: string, auth?: string): Promise<VoteActionResult> {
    this.requireVote();
    return this.holderCall(
      () => this.chain.propose(proposer, title, auth),
      async (id, txHash) => {
        this.log(
          "proposal_created",
          `Proposal #${id}`,
          `${short(proposer)}: ${title}`,
          proposer,
          txHash,
          { id: String(id), title },
        );
        return this.proposal(id);
      },
      (reason) =>
        this.log(
          "vote_rejected",
          "Proposal rejected",
          `${short(proposer)}: ${reason}`,
          proposer,
          null,
          { action: "propose", reason },
        ),
    );
  }

  /** The holder votes (`credential-vote.vote`); the credential is checked now. */
  async vote(
    voter: string,
    proposal: number,
    inFavor: boolean,
    auth?: string,
  ): Promise<VoteActionResult> {
    this.requireVote();
    return this.holderCall(
      () => this.chain.vote(voter, proposal, inFavor, auth),
      async (_, txHash) => {
        this.log(
          "vote_cast",
          `Vote ${inFavor ? "in favor" : "against"} · #${proposal}`,
          `${short(voter)} voted on proposal #${proposal}`,
          voter,
          txHash,
          { id: String(proposal), inFavor: String(inFavor) },
        );
        return this.proposal(proposal);
      },
      (reason) =>
        this.log("vote_rejected", "Vote rejected", `${short(voter)}: ${reason}`, voter, null, {
          action: "vote",
          id: String(proposal),
          reason,
        }),
    );
  }

  async view(address: string): Promise<HolderView> {
    const holder = await this.load(address);
    const record = await this.chain.gateRecord(address);
    const vault = holder?.vault ?? record?.vault ?? null;

    let credential: HolderCredential | null = null;
    if (holder?.credential && vault) {
      const status = await this.chain.verifyVc(vault, holder.credential.vcId);
      credential = { ...holder.credential, status };
    }

    return {
      address,
      did: holder?.did ?? null,
      vault,
      credential,
      gate: {
        registered: record !== null,
        isValid: record !== null && (await this.chain.gateIsValid(address)),
        claims: record?.claims ?? {},
      },
      canVote: this.chain.voteAddress !== null && (await this.chain.canVote(address)),
    };
  }

  recentActivity(): ActivityEvent[] {
    return this.activity;
  }

  /**
   * Runs a call the holder signs. `unsigned` goes back to the browser as is; a
   * contract rejection is an answer of the vote, not a server error.
   */
  private async holderCall<T>(
    call: () => Promise<HolderCall<T>>,
    accepted: (value: T, txHash: string | null) => Promise<Proposal>,
    rejected: (reason: string) => void,
  ): Promise<VoteActionResult> {
    let result: HolderCall<T>;
    try {
      result = await call();
    } catch (err) {
      if (!(err instanceof ContractError)) throw err;
      rejected(err.code);
      return { status: "rejected", reason: err.code, txHash: null };
    }
    if (result.status === "unsigned") return result;
    const proposal = await accepted(result.value, result.txHash);
    return { status: "accepted", proposal, txHash: result.txHash };
  }

  private async proposal(id: number): Promise<Proposal> {
    const found = (await this.chain.proposals()).find((p) => p.id === id);
    if (!found) throw new HttpError(404, "ProposalNotFound", `No proposal ${id}`);
    return found;
  }

  private requireVote() {
    if (!this.chain.voteAddress) {
      throw new HttpError(
        503,
        "VoteNotDeployed",
        "credential-vote is not deployed (CREDENTIAL_VOTE_ID)",
      );
    }
  }

  /** A holder that already has a vault. */
  private async holder(address: string): Promise<HolderState & { vault: string }> {
    const holder = await this.load(address);
    if (!holder?.vault) {
      throw new HttpError(404, "UnknownHolder", "Create the holder's vault first");
    }
    // The stored object itself: callers mutate it.
    return holder as HolderState & { vault: string };
  }

  /**
   * From memory, or rebuilt from `vc-gate` after a restart: the gate record
   * says where the credential lives. A vault with nothing registered yet is
   * only known in memory.
   */
  private async load(address: string): Promise<HolderState | null> {
    const known = this.holders.get(address);
    if (known) return known;
    const record = await this.chain.gateRecord(address);
    if (!record) return null;
    const tier = (TIERS as readonly string[]).includes(record.claims.tier ?? "")
      ? (record.claims.tier as Tier)
      : "Gold";
    const restored: HolderState = {
      did: await this.chain.vaultDid(record.vault),
      vault: record.vault,
      credential: { vcId: record.vcId, tier, issuedAt: record.registeredAt, revokedAt: null },
    };
    this.holders.set(address, restored);
    return restored;
  }

  private log(
    kind: ActivityKind,
    title: string,
    detail: string,
    subject: string,
    txHash: string | null,
    params: Record<string, string> = {},
  ) {
    this.activity.unshift({
      id: randomUUID(),
      kind,
      at: new Date().toISOString(),
      title,
      detail,
      subject,
      txHash,
      params,
    });
    this.activity.length = Math.min(this.activity.length, MAX_ACTIVITY);
  }
}
