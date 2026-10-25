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
  type Tier,
} from "@acta-gate/shared";

import type { GateChain } from "./chain/types.js";
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
 * The demo from `docs/IDEA ES.md`: ACTA sponsors Marta's vault, GrantFox issues
 * and registers in `vc-gate`, the treasury pays, GrantFox revokes.
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
    const testnet = this.chain.mode === "testnet";
    return {
      mode: this.chain.mode,
      network: this.config.STELLAR_NETWORK,
      explorerUrl: testnet ? stellar.explorerUrl : null,
      credentialType: CREDENTIAL_TYPE,
      requiredTier: this.config.REQUIRED_TIER,
      issuer: { name: this.config.ISSUER_NAME, address: this.chain.issuerAddress },
      treasury: { name: this.config.TREASURY_NAME, address: this.chain.treasuryAddress },
      contracts: {
        vcVaultFactory: testnet ? (this.config.VAULT_FACTORY_ID ?? null) : null,
        vcGate: testnet ? (this.config.VC_GATE_ID ?? null) : null,
        credentialPolicy: testnet ? (this.config.CREDENTIAL_POLICY_ID ?? null) : null,
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
        "Cédula creada",
        `ACTA registró ${registered.did} para ${short(address)}`,
        address,
        txHash,
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
        "Vault creado",
        `ACTA patrocinó el vault de ${short(address)}`,
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
      `Credencial ${tier} emitida`,
      `${this.config.ISSUER_NAME} → vault ${short(holder.vault)}`,
      address,
      issued.txHash,
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
      "Registrada en vc-gate",
      `tier: ${vc.tier} para ${short(address)}`,
      address,
      txHash,
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
      "Credencial revocada",
      `${this.config.ISSUER_NAME} revocó en el vault de ${short(address)}`,
      address,
      txHash,
    );
    return { holder: await this.view(address), txHash };
  }

  /** Steps 3 and 4: the treasury pays; `credential-policy` decides. */
  async pay(to: string, amount: string): Promise<PaymentResult> {
    const outcome = await this.chain.pay(to, amount);
    if (outcome.ok) {
      this.log(
        "payment_sent",
        `Pago de ${amount} USDC`,
        `La tesorería le pagó a ${short(to)}`,
        to,
        outcome.txHash,
      );
      return { status: "paid", to, amount, reason: null, txHash: outcome.txHash };
    }
    this.log(
      "payment_rejected",
      "Pago rechazado",
      `${short(to)}: ${outcome.reason}`,
      to,
      outcome.txHash,
    );
    return { status: "rejected", to, amount, reason: outcome.reason, txHash: outcome.txHash };
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
    };
  }

  recentActivity(): ActivityEvent[] {
    return this.activity;
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
  ) {
    this.activity.unshift({
      id: randomUUID(),
      kind,
      at: new Date().toISOString(),
      title,
      detail,
      subject,
      txHash,
    });
    this.activity.length = Math.min(this.activity.length, MAX_ACTIVITY);
  }
}
