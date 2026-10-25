import type { ChainMode } from "@acta-gate/shared";
import { Router } from "express";

export function healthRouter(mode: ChainMode) {
  const router = Router();
  router.get("/", (_req, res) => {
    res.json({ status: "ok", mode });
  });
  return router;
}
