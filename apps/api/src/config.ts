import { getNetworkConfig, TIERS } from "@acta-gate/shared";
import { z } from "zod";

const Env = z.object({
  PORT: z.coerce.number().int().positive().default(4000),
  CORS_ORIGIN: z.string().default("http://localhost:3000"),
  STELLAR_NETWORK: z.enum(["testnet"]).default("testnet"),
  /** `mock` runs the contracts' rules in memory; `testnet` calls the deployed contracts. */
  GATE_MODE: z.enum(["mock", "testnet"]).default("mock"),
  ISSUER_NAME: z.string().default("GrantFox"),
  TREASURY_NAME: z.string().default("Tesorería de GrantFox"),
  REQUIRED_TIER: z.enum(TIERS).default("Gold"),

  // testnet only
  /** Factory built with the `vc-vault` 0.5.0 template (spike PA). The one in `shared` is 0.4.0. */
  VAULT_FACTORY_ID: z.string().optional(),
  VC_GATE_ID: z.string().optional(),
  CREDENTIAL_POLICY_ID: z.string().optional(),
  /** The treasury smart account (`C…`), with `credential-policy` on its Default rule. */
  TREASURY_ADDRESS: z.string().optional(),
  /** ACTA: sponsors the holder's vault (`deploy_sponsored`). */
  SPONSOR_SECRET: z.string().optional(),
  /** GrantFox: issues, registers in `vc-gate` and revokes. */
  ISSUER_SECRET: z.string().optional(),
  /** Ed25519 external signer of the treasury. */
  TREASURY_SIGNER_SECRET: z.string().optional(),
});

const TESTNET_REQUIRED = [
  "VAULT_FACTORY_ID",
  "VC_GATE_ID",
  "CREDENTIAL_POLICY_ID",
  "TREASURY_ADDRESS",
  "SPONSOR_SECRET",
  "ISSUER_SECRET",
  "TREASURY_SIGNER_SECRET",
] as const;

export type Config = ReturnType<typeof loadConfig>;

export function loadConfig(source: NodeJS.ProcessEnv = process.env) {
  const env = Env.parse(source);
  if (env.GATE_MODE === "testnet") {
    const missing = TESTNET_REQUIRED.filter((key) => !env[key]);
    if (missing.length > 0) {
      throw new Error(`GATE_MODE=testnet needs: ${missing.join(", ")}`);
    }
  }
  return { ...env, stellar: getNetworkConfig(env.STELLAR_NETWORK) };
}
