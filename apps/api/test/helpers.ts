import { randomBytes } from "node:crypto";

import { Keypair, StrKey } from "@stellar/stellar-sdk";

import { createApp } from "../src/app.js";
import { loadConfig } from "../src/config.js";
import { MockChain } from "./mock-chain.js";

export const smartAccount = () => StrKey.encodeContract(randomBytes(32));

/** Every required setting, with throwaway keys: the double never touches the network. */
export const testConfig = () =>
  loadConfig({
    TREASURY_ADDRESS: smartAccount(),
    SPONSOR_SECRET: Keypair.random().secret(),
    ISSUER_SECRET: Keypair.random().secret(),
    TREASURY_SIGNER_SECRET: Keypair.random().secret(),
  });

/** The API on top of the contracts' rules in memory. */
export const testApp = () => {
  const config = testConfig();
  return createApp(config, new MockChain(config.REQUIRED_TIER));
};
