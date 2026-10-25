export * from "./api.js";

export type Network = "testnet" | "mainnet";

export interface NetworkConfig {
  rpcUrl: string;
  networkPassphrase: string;
  /** Block explorer base URL, without a trailing slash. */
  explorerUrl: string;
  /** OpenZeppelin smart accounts, as deployed by `smart-account-kit`. */
  smartAccounts: {
    accountWasmHash: string;
    webauthnVerifier: string;
    ed25519Verifier: string;
    thresholdPolicy: string;
  };
  contracts: {
    /** ACTA, existing. */
    vcVaultFactory: string;
    /** ACTA, existing. */
    didStellarRegistry: string;
    /** ACTA Gate, deployed at the event. */
    vcGate?: string;
    /** ACTA Gate, deployed at the event. */
    credentialPolicy?: string;
    /** Circle USDC, Stellar Asset Contract. */
    usdc: string;
  };
}

/** Source: docs/IMPLEMENTATION ES.md section 4 and docs/deployments/acta-gate-testnet.md. */
export const NETWORKS: Partial<Record<Network, NetworkConfig>> = {
  testnet: {
    rpcUrl: "https://soroban-testnet.stellar.org",
    networkPassphrase: "Test SDF Network ; September 2015",
    explorerUrl: "https://stellar.expert/explorer/testnet",
    smartAccounts: {
      accountWasmHash: "1b5f4534a76322da2ad7c745f6900857a6802b0ca79850c35a03561df997785a",
      webauthnVerifier: "CC7EKIHQP3TN4CARQDND6CEOY2UXLWWC2X5GHTD5NLAT7BG5GPZIOM3F",
      ed25519Verifier: "CAAVTMCBXEIBPR64EAASKFXERVPYFZA2JYP5A3BG6PESWEFUJX5IHKN4",
      thresholdPolicy: "CB3FATQKCIRIQOCYRUPCQ2KREQ7T4RPKS7EAEOZWPEPUKWEDRVROBCEG",
    },
    contracts: {
      // Built with the vc-vault 0.5.0 template (docs/deployments/acta-gate-testnet.md).
      // CB23E4GX… is ACTA's 0.4.0 factory: its vaults do not record the issuer.
      vcVaultFactory: "CCHI33MJAWFCLHLX6CLFAT32ERHMILF3LCUV4SYKWP3ASIBTPZNRDL3Y",
      vcGate: "CCQLGN7IOR4GSGDLLQ2SALMUWWQ67DGHV7WQUEDZDGTFIX3OIKA5HOU2",
      credentialPolicy: "CAI3YAVSWX2GA5SX2KCAMHLOLHVOPZUL2MXQQNSIUFSRY2RBKKOJGIQR",
      didStellarRegistry: "CAJQFHGAJR5Q2NMGM7IYGM2KK6FLQXT634XZMGEYKKOYN2E2ONCFRSQK",
      usdc: "CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA",
    },
  },
};

export function getNetworkConfig(network: Network): NetworkConfig {
  const config = NETWORKS[network];
  if (!config) throw new Error(`Network not configured: ${network}`);
  return config;
}
