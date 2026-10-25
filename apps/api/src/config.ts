import { getNetworkConfig, TIERS } from "@acta-gate/shared";
import { z } from "zod";

const Env = z.object({
  PORT: z.coerce.number().int().positive().default(4000),
  CORS_ORIGIN: z.string().default("http://localhost:3000"),
  STELLAR_NETWORK: z.enum(["testnet"]).default("testnet"),
  ISSUER_NAME: z.string().default("GrantFox"),
  TREASURY_NAME: z.string().default("GrantFox Treasury"),
  VOTE_NAME: z.string().default("Contributor vote"),
  /** Required by both the treasury's `credential-policy` and `credential-vote`. */
  REQUIRED_TIER: z.enum(TIERS).default("Gold"),

  // Contract IDs: they default to the deployment in `shared`
  // (`docs/deployments/acta-gate-testnet.md`). Set them only to point elsewhere.
  /** Factory built with the `vc-vault` 0.5.0 template (spike PA). Not ACTA's 0.4.0 one. */
  VAULT_FACTORY_ID: z.string().optional(),
  VC_GATE_ID: z.string().optional(),
  CREDENTIAL_POLICY_ID: z.string().optional(),
  CREDENTIAL_VOTE_ID: z.string().optional(),

  /** The treasury smart account (`C…`), with `credential-policy` on its Default rule. */
  TREASURY_ADDRESS: z.string().optional(),
  /** ACTA: sponsors the holder's vault (`deploy_sponsored`) and pays the holder's fees. */
  SPONSOR_SECRET: z.string().optional(),
  /** GrantFox: issues, registers in `vc-gate` and revokes. */
  ISSUER_SECRET: z.string().optional(),
  /** Ed25519 external signer of the treasury. */
  TREASURY_SIGNER_SECRET: z.string().optional(),
});

const REQUIRED = [
  "VAULT_FACTORY_ID",
  "VC_GATE_ID",
  "CREDENTIAL_POLICY_ID",
  "CREDENTIAL_VOTE_ID",
  "TREASURY_ADDRESS",
  "SPONSOR_SECRET",
  "ISSUER_SECRET",
  "TREASURY_SIGNER_SECRET",
] as const;

export type Config = ReturnType<typeof loadConfig>;

/** Every setting the backend needs to run against the deployed contracts, checked up front. */
export function loadConfig(source: NodeJS.ProcessEnv = process.env) {
  const parsed = Env.parse(source);
  const stellar = getNetworkConfig(parsed.STELLAR_NETWORK);
  const env = {
    ...parsed,
    VAULT_FACTORY_ID: parsed.VAULT_FACTORY_ID ?? stellar.contracts.vcVaultFactory,
    VC_GATE_ID: parsed.VC_GATE_ID ?? stellar.contracts.vcGate,
    CREDENTIAL_POLICY_ID: parsed.CREDENTIAL_POLICY_ID ?? stellar.contracts.credentialPolicy,
    CREDENTIAL_VOTE_ID: parsed.CREDENTIAL_VOTE_ID ?? stellar.contracts.credentialVote,
  };
  const missing = REQUIRED.filter((key) => !env[key]);
  if (missing.length > 0) {
    throw new Error(`Missing settings in apps/api/.env: ${missing.join(", ")}`);
  }
  return { ...(env as typeof env & Record<(typeof REQUIRED)[number], string>), stellar };
}
