import { getNetworkConfig, TIERS } from "@acta-gate/shared";
import { z } from "zod";

const Env = z.object({
  PORT: z.coerce.number().int().positive().default(4000),
  /** The web app's origins, comma-separated: e.g. the Vercel domain and http://localhost:3000. */
  CORS_ORIGIN: z
    .string()
    .default("http://localhost:3000")
    .transform((v) =>
      v
        .split(",")
        .map((o) => o.trim())
        .filter(Boolean),
    ),
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

  /** GrantFox, the issuer `credential-vote` and the policy were deployed to trust. */
  ISSUER_ADDRESS: z.string().default("GC7INDGAMCG522TIOWRH7TPVENROPFROKOXWYAFEFQCAFZNA2U2EEFA6"),
  /** The treasury smart account (`C…`), with `credential-policy` on its Default rule. */
  TREASURY_ADDRESS: z.string().optional(),
  /** ACTA: sponsors the holder's vault (`deploy_sponsored`) and pays the holder's fees. */
  SPONSOR_SECRET: z.string().optional(),
  /** GrantFox: issues, registers in `vc-gate` and revokes. */
  ISSUER_SECRET: z.string().optional(),
  /** Ed25519 external signer of the treasury. */
  TREASURY_SIGNER_SECRET: z.string().optional(),
});

/**
 * What the backend cannot start without. GrantFox's key and the treasury are
 * only needed by the calls that use them (`StellarChain` names them then).
 */
const REQUIRED = [
  "VAULT_FACTORY_ID",
  "VC_GATE_ID",
  "CREDENTIAL_POLICY_ID",
  "CREDENTIAL_VOTE_ID",
  "SPONSOR_SECRET",
] as const;

export type Config = ReturnType<typeof loadConfig>;

/** The backend's settings, with the ones it cannot start without checked up front. */
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
