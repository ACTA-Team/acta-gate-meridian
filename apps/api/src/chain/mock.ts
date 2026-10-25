import { randomBytes } from "node:crypto";

import type { CredentialStatus } from "@acta-gate/shared";
import { Keypair, StrKey } from "@stellar/stellar-sdk";

import { ContractError, type GateChain, type GateRecord, type PaymentOutcome } from "./types.js";

interface MockVc {
  issuer: string;
  status: CredentialStatus;
}

interface MockVault {
  owner: string;
  revoked: boolean;
  vcs: Map<string, MockVc>;
}

const randomContract = () => StrKey.encodeContract(randomBytes(32));

/**
 * The contracts' rules, in memory. Mirrors `vc-vault` 0.5.0, `vc-gate` as
 * specified in `docs/IDEA ES.md` and `credential-policy`'s `enforce`, so the
 * demo behaves the same before they are deployed.
 */
export class MockChain implements GateChain {
  readonly mode = "mock" as const;
  readonly issuerAddress = Keypair.random().publicKey();
  readonly treasuryAddress = randomContract();

  private readonly vaults = new Map<string, MockVault>();
  /** `vc-gate` records keyed by holder (issuer and type are fixed). */
  private readonly records = new Map<string, GateRecord>();

  constructor(private readonly requiredTier: string) {}

  async deployVault(owner: string) {
    const vault = randomContract();
    this.vaults.set(vault, { owner, revoked: false, vcs: new Map() });
    return { vault, txHash: null };
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
    const record = this.records.get(to);
    const ok = (await this.gateIsValid(to)) && record?.claims.tier === this.requiredTier;
    if (!ok) return { ok: false, reason: "RecipientNotCredentialed", txHash: null };
    return { ok: true, txHash: null };
  }

  private vault(id: string) {
    const v = this.vaults.get(id);
    if (!v) throw new ContractError("NotAVault", "Unknown vault");
    return v;
  }
}
