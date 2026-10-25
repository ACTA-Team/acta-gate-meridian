import cors from "cors";
import express, { type ErrorRequestHandler } from "express";
import helmet from "helmet";

import { MockChain } from "./chain/mock.js";
import { StellarChain } from "./chain/stellar.js";
import { ContractError, type GateChain } from "./chain/types.js";
import type { Config } from "./config.js";
import { Demo } from "./demo.js";
import { errorHandler, HttpError } from "./errors.js";
import { healthRouter } from "./routes/health.js";
import { demoRouter } from "./routes.js";

export function createChain(config: Config): GateChain {
  return config.GATE_MODE === "testnet"
    ? new StellarChain(config)
    : new MockChain(config.REQUIRED_TIER);
}

/** A contract rejecting a call is the caller's problem, not a server error. */
const contractErrors: ErrorRequestHandler = (err, _req, _res, next) => {
  next(err instanceof ContractError ? new HttpError(422, err.code, err.message) : err);
};

export function createApp(config: Config, chain: GateChain = createChain(config)) {
  const app = express();
  app.use(helmet());
  app.use(cors({ origin: config.CORS_ORIGIN }));
  app.use(express.json());

  app.use("/health", healthRouter(chain.mode));
  app.use("/", demoRouter(new Demo(chain, config)));

  app.use((_req, _res, next) => next(new HttpError(404, "NotFound", "No such route")));
  app.use(contractErrors);
  app.use(errorHandler);

  return app;
}
