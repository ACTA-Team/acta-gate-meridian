import { randomBytes } from "node:crypto";

import { MAX_TITLE_LEN, type CredentialStatus, type Proposal } from "@acta-gate/shared";
import { Keypair, StrKey } from "@stellar/stellar-sdk";

import { didFromId, newDidId } from "../src/did.js";
import {
  ContractError,
  type GateChain,
  type GateRecord,
  type HolderCall,
  type PaymentOutcome,
} from "../src/chain/types.js";

interface MockVc {
  issuer: string;
  status: CredentialStatus;
}

interface MockVault {
  owner: string;
  did: string | null;
  revoked: boolean;
  vcs: Map<string, MockVc>;
}

const randomContract = () => StrKey.encodeContract(randomBytes(32));

/**
 * A test double: the contracts' rules, in memory, so the API's tests run
 * without a network. Mirrors `vc-vault` 0.5.0, `vc-gate` as
 * specified in `docs/IDEA.md`, `credential-policy`'s `enforce` and
 * `credential-vote`.
 * The treasury and the vote share one requirement: `tier` = `requiredTier`.
 */
export class MockChain implements GateChain {
  readonly issuerAddress = Keypair.random().publicKey();
  readonly treasuryAddress = randomContract();
  readonly voteAddress = randomContract();

  private readonly vaults = new Map<string, MockVault>();
  /** `vc-gate` records keyed by holder (issuer and type are fixed). */
  private readonly records = new Map<string, GateRecord>();
  /** `credential-vote`: proposals by id, and `${id}:${voter}` once voted. */
  private readonly proposalList: Proposal[] = [];
  private readonly votes = new Set<string>();

  constructor(private readonly requiredTier: string) {}

  async registerDid() {
    return { did: didFromId(newDidId(), "testnet"), txHash: null };
  }

  async deployVault(owner: string, didUri: string) {
    const vault = randomContract();
    this.vaults.set(vault, { owner, did: didUri || null, revoked: false, vcs: new Map() });
    return { vault, txHash: null };
  }

  async vaultDid(vault: string) {
    return this.vaults.get(vault)?.did ?? null;
  }

  async issue(vault: string, vcId: string) {
    const v = this.vault(vault);
    if (v.revoked) throw new ContractError("VaultRevoked", "The vault is revoked");
    if (v.vcs.has(vcId)) throw new ContractError("VCAlreadyExists", "vc_id already used");
    v.vcs.set(vcId, { issuer: this.issuerAddress, status: "valid" });
    return { txHash: null };
  }

  async register(vault: string, vcId: string, claims: Record<string, string>) {
    const v = this.vaults.get(vault);
    if (!v) throw new ContractError("NotAVault", "The factory did not deploy this vault");
    const vc = v.vcs.get(vcId);
    if (!vc || vc.issuer !== this.issuerAddress) {
      throw new ContractError("NotTheIssuer", "The credential is not this issuer's");
    }
    if (vc.status !== "valid" || v.revoked) {
      throw new ContractError("CredentialNotValid", "The credential or the vault is revoked");
    }
    this.records.set(v.owner, { vault, vcId, claims, registeredAt: new Date().toISOString() });
    return { txHash: null };
  }

  async revokeByIssuer(vault: string, vcId: string) {
    const vc = this.vault(vault).vcs.get(vcId);
    if (!vc || vc.status !== "valid") throw new ContractError("VCNotFound", "No valid credential");
    vc.status = "revoked";
    return { txHash: null };
  }

  async verifyVc(vault: string, vcId: string): Promise<CredentialStatus> {
    return this.vaults.get(vault)?.vcs.get(vcId)?.status ?? "invalid";
  }

  async gateRecord(holder: string) {
    return this.records.get(holder) ?? null;
  }

  async gateIsValid(holder: string) {
    const r = this.records.get(holder);
    if (!r) return false;
    const v = this.vaults.get(r.vault);
    return (await this.verifyVc(r.vault, r.vcId)) === "valid" && !v?.revoked;
  }

  async pay(to: string): Promise<PaymentOutcome> {
    if (!(await this.check(to))) {
      return { ok: false, reason: "RecipientNotCredentialed", txHash: null };
    }
    return { ok: true, txHash: null };
  }

  async canVote(who: string) {
    return this.check(who);
  }

  async proposals() {
    return this.proposalList.map((p) => ({ ...p }));
  }

  async hasVoted(proposal: number, voter: string) {
    return this.votes.has(`${proposal}:${voter}`);
  }

  /** Same order as the contract: the title cap, then the gate. */
  async propose(proposer: string, title: string): Promise<HolderCall<number>> {
    if (Buffer.byteLength(title) > MAX_TITLE_LEN) {
      throw new ContractError("InputTooLong", `The title is above ${MAX_TITLE_LEN} bytes`);
    }
    await this.requireCredentialed(proposer);
    const id = this.proposalList.length;
    this.proposalList.push({
      id,
      proposer,
      title,
      inFavor: 0,
      against: 0,
      createdAt: new Date().toISOString(),
    });
    return { status: "done", value: id, txHash: null };
  }

  /** Same order as the contract: the proposal, the double vote, then the gate. */
  async vote(voter: string, proposal: number, inFavor: boolean): Promise<HolderCall<null>> {
    const p = this.proposalList[proposal];
    if (!p) throw new ContractError("ProposalNotFound", `No proposal ${proposal}`);
    if (await this.hasVoted(proposal, voter)) {
      throw new ContractError("AlreadyVoted", "One vote per address and proposal");
    }
    await this.requireCredentialed(voter);
    if (inFavor) p.inFavor += 1;
    else p.against += 1;
    this.votes.add(`${proposal}:${voter}`);
    return { status: "done", value: null, txHash: null };
  }

  /** `vc-gate.check(holder, GrantFox, ContributorBadge, { tier })`. */
  private async check(holder: string) {
    const record = this.records.get(holder);
    return (await this.gateIsValid(holder)) && record?.claims.tier === this.requiredTier;
  }

  private async requireCredentialed(who: string) {
    if (!(await this.check(who))) {
      throw new ContractError("NotCredentialed", "vc-gate does not vouch for this address");
    }
  }

  private vault(id: string) {
    const v = this.vaults.get(id);
    if (!v) throw new ContractError("NotAVault", "Unknown vault");
    return v;
  }
}
