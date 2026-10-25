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
    /** ACTA Gate, deployed at the event. */
    credentialVote?: string;
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
      // Deployed for the demo: the factory is built with the vc-vault 0.5.0
      // template, whose vaults record the issuer (docs/deployments/acta-gate-testnet.md).
      vcVaultFactory: "CCPEKQVBJP5XK4WLJS3XOVJFH2Q2IQPJK4DAYKUS3NGMCGWMXUJU5TKU",
      vcGate: "CDNCAGEI3OCL5G6NL7UVKYR7Q34UPBGPO4SZB3YKOHCPKU5U33LN5UOD",
      credentialPolicy: "CBNICQYB5VOIWYPS4WF27OAKCKEALW54SYGFETN63UYF6537KCQZEH66",
      credentialVote: "CAZUHZRKTGYD2DSIQCTKX5KO3HS4FI565D256HFY5YWAJGLD367GBEAN",
      didStellarRegistry: "CCGVBGVF5V4L7N6QNHBZQLZ6LY7W6ZUFR4JCPWCUKATQWUFBX5TS3OWZ",
      usdc: "CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA",
    },
  },
};

export function getNetworkConfig(network: Network): NetworkConfig {
  const config = NETWORKS[network];
  if (!config) throw new Error(`Network not configured: ${network}`);
  return config;
}
