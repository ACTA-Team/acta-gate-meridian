import { MAX_TITLE_LEN, TIERS } from "@acta-gate/shared";
import { StrKey } from "@stellar/stellar-sdk";
import { Router } from "express";
import { z } from "zod";

import type { Demo } from "./demo.js";

const Address = z
  .string()
  .refine((a) => StrKey.isValidEd25519PublicKey(a) || StrKey.isValidContract(a), {
    message: "must be a Stellar G… or C… address",
  });

const HolderBody = z.object({ address: Address });
const IssueBody = z.object({ address: Address, tier: z.enum(TIERS).default("Gold") });
const PayBody = z.object({
  to: Address,
  amount: z
    .string()
    .regex(/^\d+(\.\d{1,7})?$/, "must be a positive decimal")
    .default("10"),
});
/** A `SorobanAuthorizationEntry` in base64, signed by the holder's passkey (testnet). */
const Auth = z.string().max(8_192).optional();
const ProposeBody = z.object({
  proposer: Address,
  title: z
    .string()
    .trim()
    .min(1)
    .refine((t) => Buffer.byteLength(t) <= MAX_TITLE_LEN, {
      message: `must be at most ${MAX_TITLE_LEN} bytes`,
    }),
  auth: Auth,
});
const VoteBody = z.object({
  voter: Address,
  proposal: z.number().int().min(0).max(0xffff_ffff),
  inFavor: z.boolean(),
  auth: Auth,
});
const ProposalsQuery = z.object({ voter: Address.optional() });

export function demoRouter(demo: Demo) {
  const router = Router();

  router.get("/config", (_req, res) => {
    res.json(demo.info());
  });

  router.get("/activity", (_req, res) => {
    res.json(demo.recentActivity());
  });

  router.post("/dids", async (req, res) => {
    const { address } = HolderBody.parse(req.body);
    res.status(201).json(await demo.registerDid(address));
  });

  router.post("/holders", async (req, res) => {
    const { address } = HolderBody.parse(req.body);
    res.status(201).json(await demo.createHolder(address));
  });

  router.get("/holders/:address", async (req, res) => {
    const address = Address.parse(req.params.address);
    res.json(await demo.view(address));
  });

  router.post("/credentials", async (req, res) => {
    const { address, tier } = IssueBody.parse(req.body);
    res.status(201).json(await demo.issue(address, tier));
  });

  router.post("/credentials/register", async (req, res) => {
    const { address } = HolderBody.parse(req.body);
    res.json(await demo.register(address));
  });

  router.post("/credentials/revoke", async (req, res) => {
    const { address } = HolderBody.parse(req.body);
    res.json(await demo.revoke(address));
  });

  router.post("/payments", async (req, res) => {
    const { to, amount } = PayBody.parse(req.body);
    res.json(await demo.pay(to, amount));
  });

  router.get("/proposals", async (req, res) => {
    const { voter } = ProposalsQuery.parse(req.query);
    res.json(await demo.proposals(voter));
  });

  router.post("/proposals", async (req, res) => {
    const { proposer, title, auth } = ProposeBody.parse(req.body);
    res.json(await demo.propose(proposer, title, auth));
  });

  router.post("/votes", async (req, res) => {
    const { voter, proposal, inFavor, auth } = VoteBody.parse(req.body);
    res.json(await demo.vote(voter, proposal, inFavor, auth));
  });

  return router;
}
