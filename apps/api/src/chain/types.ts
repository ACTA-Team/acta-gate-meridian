import type { CredentialStatus, Proposal } from "@acta-gate/shared";

export interface Receipt {
  /** `null` when nothing was sent. */
  txHash: string | null;
}

export interface GateRecord {
  vault: string;
  vcId: string;
  claims: Record<string, string>;
  /** ISO date of the registration (`registered_at`). */
  registeredAt: string;
}

export type PaymentOutcome =
  { ok: true; txHash: string | null } | { ok: false; reason: string; txHash: string | null };

/**
 * A call the holder has to authorize (`require_auth`). Without `auth`, testnet
 * simulates it and hands back the holder's auth entry to sign with the passkey;
 * with `auth` (that entry, signed) it submits. The tests' double runs it right away.
 * A contract rejection is thrown as a `ContractError`.
 */
export type HolderCall<T> =
  { status: "unsigned"; authEntry: string } | { status: "done"; value: T; txHash: string | null };

/** Thrown when a contract rejects a call; `code` is the contract error name. */
export class ContractError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

/**
 * The calls the demo makes, named after the contracts' ABIs
 * (`docs/IDEA.md`, `docs/IMPLEMENTATION.md` section 8).
 * The issuer and the credential type are fixed: GrantFox, `ContributorBadge`.
 */
export interface GateChain {
  readonly issuerAddress: string;
  readonly treasuryAddress: string;
  /** `credential-vote`, or `null` when it is not deployed. */
  readonly voteAddress: string | null;

  /**
   * `did-stellar-registry.register_sponsored(ACTA, did_id, record)`: the
   * holder's `did:stellar`, controlled by their smart account, with the
   * passkey the account already holds on chain as its authentication key.
   */
  registerDid(holder: string): Promise<Receipt & { did: string }>;
  /** `vc-vault-factory.deploy_sponsored(ACTA, owner, did_uri, salt)`. */
  deployVault(owner: string, didUri: string): Promise<Receipt & { vault: string }>;
  /** `vault.vault_did()`: the DID the vault was deployed with. */
  vaultDid(vault: string): Promise<string | null>;
  /** `vault.issue(vc_id, vc_data, vault, GrantFox, issuer_did)`. */
  issue(vault: string, vcId: string, vcData: string): Promise<Receipt>;
  /** `vc-gate.register(GrantFox, vault, vc_id, credential_type, claims)`. */
  register(vault: string, vcId: string, claims: Record<string, string>): Promise<Receipt>;
  /** `vault.revoke_by_issuer(vc_id, date)`. */
  revokeByIssuer(vault: string, vcId: string, date: string): Promise<Receipt>;

  /** `vault.verify_vc(vc_id)`. */
  verifyVc(vault: string, vcId: string): Promise<CredentialStatus>;
  /** `vc-gate.get_record(holder, GrantFox, credential_type)`. */
  gateRecord(holder: string): Promise<GateRecord | null>;
  /** `vc-gate.is_valid(holder, GrantFox, credential_type)`. */
  gateIsValid(holder: string): Promise<boolean>;

  /** The treasury pays USDC; `credential-policy` decides. */
  pay(to: string, amount: string): Promise<PaymentOutcome>;

  /** `credential-vote.can_vote(who)`: one `vc-gate.check` under the vote's requirement. */
  canVote(who: string): Promise<boolean>;
  /** `credential-vote.proposal(id)` for every id from 0, oldest first. */
  proposals(): Promise<Proposal[]>;
  /** `credential-vote.has_voted(proposal, voter)`. */
  hasVoted(proposal: number, voter: string): Promise<boolean>;
  /** `credential-vote.propose(proposer, title)`, signed by the proposer. Returns the id. */
  propose(proposer: string, title: string, auth?: string): Promise<HolderCall<number>>;
  /** `credential-vote.vote(voter, proposal, in_favor)`, signed by the voter. */
  vote(voter: string, proposal: number, inFavor: boolean, auth?: string): Promise<HolderCall<null>>;
}
