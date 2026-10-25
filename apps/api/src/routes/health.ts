import { Router } from "express";

export function healthRouter(network: string) {
  const router = Router();
  router.get("/", (_req, res) => {
    res.json({ status: "ok", network });
  });
  return router;
}
