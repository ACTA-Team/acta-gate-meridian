/**
 * The HTTP contract between `apps/api` and `apps/web`.
 *
 * `mock` runs the same rules as the contracts in memory, so the demo works
 * before `vc-gate` and `credential-policy` are deployed. `testnet` calls them.
 */
export type ChainMode = "mock" | "testnet";

export const CREDENTIAL_TYPE = "ContributorBadge";
export const TIERS = ["Gold", "Silver"] as const;
export type Tier = (typeof TIERS)[number];

export interface DemoConfig {
  mode: ChainMode;
  network: string;
  explorerUrl: string | null;
  credentialType: string;
  /** The tier the treasury's `credential-policy` requires. */
  requiredTier: Tier;
  issuer: { name: string; address: string };
  treasury: { name: string; address: string };
  contracts: {
    vcVaultFactory: string | null;
    vcGate: string | null;
    credentialPolicy: string | null;
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

export interface HolderView {
  address: string;
  vault: string | null;
  credential: HolderCredential | null;
  /** What `vc-gate` answers right now. */
  gate: {
    registered: boolean;
    isValid: boolean;
    claims: Record<string, string>;
  };
}

/** What every on-chain action returns: the new state and its transaction. */
export interface ActionResult {
  holder: HolderView;
  /** `null` in mock mode, or when nothing had to be sent. */
  txHash: string | null;
}

export type ActivityKind =
  | "vault_deployed"
  | "credential_issued"
  | "gate_registered"
  | "credential_revoked"
  | "payment_sent"
  | "payment_rejected";

export interface ActivityEvent {
  id: string;
  kind: ActivityKind;
  at: string;
  title: string;
  detail: string;
  /** The address the event is about: the holder, or the recipient of a payment. */
  subject: string;
  /** Present in `testnet` mode. */
  txHash: string | null;
}

export interface PaymentResult {
  status: "paid" | "rejected";
  to: string;
  amount: string;
  /** Why the policy rejected it, e.g. `RecipientNotCredentialed`. */
  reason: string | null;
  txHash: string | null;
}

export interface ApiError {
  error: { code: string; message: string };
}
