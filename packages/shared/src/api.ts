/**
 * The HTTP contract between `apps/api` and `apps/web`. The backend calls the
 * contracts deployed on testnet (`docs/deployments/acta-gate-testnet.md`).
 */
export const CREDENTIAL_TYPE = "ContributorBadge";
export const TIERS = ["Gold", "Silver"] as const;
export type Tier = (typeof TIERS)[number];

export interface DemoConfig {
  network: string;
  explorerUrl: string;
  credentialType: string;
  /** The tier the treasury's `credential-policy` requires. */
  requiredTier: Tier;
  issuer: { name: string; address: string };
  treasury: { name: string; address: string };
  /**
   * `credential-vote`: the second contract that asks `vc-gate`, same requirement.
   * `null` in testnet while `CREDENTIAL_VOTE_ID` is not set.
   */
  vote: { name: string; address: string } | null;
  contracts: {
    vcVaultFactory: string;
    vcGate: string;
    credentialPolicy: string;
    credentialVote: string;
    usdc: string;
  };
}

/** Matches `VCStatus` in `vc-vault`. */
export type CredentialStatus = "valid" | "revoked" | "invalid";

export interface HolderCredential {
  vcId: string;
  tier: Tier;
  status: CredentialStatus;
  issuedAt: string;
  revokedAt: string | null;
}

/** Universal Resolver endpoint of ACTA's hosted `did:stellar` resolver. */
export const DID_RESOLVER_URL = "https://did.acta.build/1.0/identifiers";

export const didResolverUrl = (did: string) => `${DID_RESOLVER_URL}/${did}`;

export interface HolderView {
  address: string;
  /** The holder's `did:stellar`, registered by ACTA with the passkey as its key. */
  did: string | null;
  vault: string | null;
  credential: HolderCredential | null;
  /** What `vc-gate` answers right now. */
  gate: {
    registered: boolean;
    isValid: boolean;
    claims: Record<string, string>;
  };
  /** `credential-vote.can_vote(holder)`: what the gate answers under the vote's requirement. */
  canVote: boolean;
}

/** What every on-chain action returns: the new state and its transaction. */
export interface ActionResult {
  holder: HolderView;
  /** `null` when nothing had to be sent. */
  txHash: string | null;
}

export type ActivityKind =
  | "did_registered"
  | "vault_deployed"
  | "credential_issued"
  | "gate_registered"
  | "credential_revoked"
  | "payment_sent"
  | "payment_rejected"
  | "proposal_created"
  | "vote_cast"
  | "vote_rejected";

export interface ActivityEvent {
  id: string;
  kind: ActivityKind;
  at: string;
  /** For API consumers. The web app builds its own, localized text from `kind` and `params`. */
  title: string;
  detail: string;
  /** The address the event is about: the holder, or the recipient of a payment. */
  subject: string;
  /** `null` when nothing was sent, e.g. a rejection caught in simulation. */
  txHash: string | null;
  /** The raw values behind `title` and `detail`, e.g. `{ tier: "Gold" }`. */
  params: Record<string, string>;
}

export interface PaymentResult {
  status: "paid" | "rejected";
  to: string;
  amount: string;
  /** Why the policy rejected it, e.g. `RecipientNotCredentialed`. */
  reason: string | null;
  txHash: string | null;
}

/** `MAX_TITLE_LEN` in `credential-vote`, in bytes. */
export const MAX_TITLE_LEN = 128;

/** `Proposal` in `credential-vote`. */
export interface Proposal {
  id: number;
  proposer: string;
  title: string;
  inFavor: number;
  against: number;
  /** ISO date of `created_at`. */
  createdAt: string;
}

/** A proposal as seen by one voter: `has_voted(id, voter)`. */
export interface ProposalView extends Proposal {
  hasVoted: boolean;
}

/**
 * What `POST /proposals` and `POST /votes` return. `propose` and `vote` need
 * the holder's signature: in testnet the first call answers `unsigned` with the
 * auth entry for Marta's passkey, and the second one sends it back signed.
 */
export type VoteActionResult =
  | { status: "unsigned"; authEntry: string }
  | { status: "accepted"; proposal: Proposal; txHash: string | null }
  /** `reason` is the contract error, e.g. `NotCredentialed` or `AlreadyVoted`. */
  | { status: "rejected"; reason: string; txHash: null };

export interface ApiError {
  error: { code: string; message: string };
}
