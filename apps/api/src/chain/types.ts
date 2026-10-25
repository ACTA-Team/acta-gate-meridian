import type { ChainMode, CredentialStatus } from "@acta-gate/shared";

export interface Receipt {
  /** `null` in mock mode. */
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
 * (`docs/IDEA ES.md`, `docs/IMPLEMENTATION ES.md` section 8).
 * The issuer and the credential type are fixed: GrantFox, `ContributorBadge`.
 */
export interface GateChain {
  readonly mode: ChainMode;
  readonly issuerAddress: string;
  readonly treasuryAddress: string;

  /** `vc-vault-factory.deploy_sponsored(ACTA, owner, did_uri, salt)`. */
  deployVault(owner: string): Promise<Receipt & { vault: string }>;
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
}
