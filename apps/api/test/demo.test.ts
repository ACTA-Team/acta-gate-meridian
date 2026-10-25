import type {
  ActionResult,
  HolderView,
  PaymentResult,
  ProposalView,
  VoteActionResult,
} from "@acta-gate/shared";
import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";

import type { createApp } from "../src/app.js";
import { loadConfig } from "../src/config.js";
import { smartAccount, testApp } from "./helpers.js";

/** The demo table in `docs/IDEA.md`, against the contracts' rules in memory. */
describe("demo flow", () => {
  let app: ReturnType<typeof createApp>;
  const marta = smartAccount();

  const pay = async (to: string) =>
    (await request(app).post("/payments").send({ to, amount: "25" })).body as PaymentResult;

  beforeEach(() => {
    app = testApp();
  });

  it("pays a Gold holder, rejects others, and rejects after the issuer revokes", async () => {
    // 1a. ACTA registers Marta's did:stellar.
    const did = await request(app).post("/dids").send({ address: marta });
    expect(did.status).toBe(201);
    const didView = (did.body as ActionResult).holder;
    expect(didView.did).toMatch(/^did:stellar:testnet:[a-z2-7]{26}$/);
    expect(didView.vault).toBeNull();

    // 1b. ACTA creates Marta's vault, bound to that DID.
    const created = await request(app).post("/holders").send({ address: marta });
    expect(created.status).toBe(201);
    expect((created.body as ActionResult).holder.vault).toMatch(/^C/);
    expect((created.body as ActionResult).holder.did).toBe(didView.did);
    // Registering again is a no-op: same DID, nothing sent.
    const again = (await request(app).post("/dids").send({ address: marta })).body as ActionResult;
    expect(again.holder.did).toBe(didView.did);

    // 2. GrantFox issues Contributor Gold in the vault, then registers it in vc-gate.
    const issued = (await request(app).post("/credentials").send({ address: marta, tier: "Gold" }))
      .body as ActionResult;
    expect(issued.holder.credential?.status).toBe("valid");
    expect(issued.holder.gate.registered).toBe(false);
    const registered = (await request(app).post("/credentials/register").send({ address: marta }))
      .body as ActionResult;
    expect(registered.holder.gate).toEqual({
      registered: true,
      isValid: true,
      claims: { tier: "Gold" },
    });

    // 3. The treasury pays Marta.
    expect((await pay(marta)).status).toBe("paid");

    // 4. An address without a credential is rejected.
    const stranger = await pay(smartAccount());
    expect(stranger).toMatchObject({ status: "rejected", reason: "RecipientNotCredentialed" });

    // 5. GrantFox revokes; the next payment bounces, and nobody touched an allowlist.
    const revoked = (await request(app).post("/credentials/revoke").send({ address: marta }))
      .body as ActionResult;
    expect(revoked.holder.credential?.status).toBe("revoked");
    expect(revoked.holder.gate.isValid).toBe(false);
    expect((await pay(marta)).status).toBe("rejected");

    const activity = (await request(app).get("/activity")).body as { kind: string }[];
    expect(activity.map((a) => a.kind)).toEqual([
      "payment_rejected",
      "credential_revoked",
      "payment_rejected",
      "payment_sent",
      "gate_registered",
      "credential_issued",
      "vault_deployed",
      "did_registered",
    ]);
  });

  it("creates a vault without a DID when the holder skipped that step", async () => {
    const created = (await request(app).post("/holders").send({ address: marta }))
      .body as ActionResult;
    expect(created.holder.did).toBeNull();
    expect(created.holder.vault).toMatch(/^C/);
  });

  it("refuses to issue when the holder has a DID but no vault yet", async () => {
    await request(app).post("/dids").send({ address: marta });
    const res = await request(app).post("/credentials").send({ address: marta });
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("UnknownHolder");
  });

  it("rejects a Silver holder when the treasury requires Gold", async () => {
    await request(app).post("/holders").send({ address: marta });
    await request(app).post("/credentials").send({ address: marta, tier: "Silver" });
    await request(app).post("/credentials/register").send({ address: marta });
    expect((await pay(marta)).status).toBe("rejected");
  });

  it("refuses to issue before the vault exists", async () => {
    const res = await request(app).post("/credentials").send({ address: smartAccount() });
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("UnknownHolder");
  });

  it("validates addresses", async () => {
    const res = await request(app).post("/holders").send({ address: "not-an-address" });
    expect(res.status).toBe(400);
  });

  it("asks for every secret up front, and takes the contract IDs from shared", () => {
    expect(() => loadConfig({})).toThrow(/TREASURY_ADDRESS, SPONSOR_SECRET/);
    expect(() => loadConfig({})).not.toThrow(/VC_GATE_ID/);
  });
});

/** `credential-vote`, the second gate: `integration-tests/tests/treasury.rs`, in memory. */
describe("contributor vote", () => {
  let app: ReturnType<typeof createApp>;
  const marta = smartAccount();

  const holderWith = async (address: string, tier: "Gold" | "Silver") => {
    await request(app).post("/holders").send({ address });
    await request(app).post("/credentials").send({ address, tier });
    await request(app).post("/credentials/register").send({ address });
  };
  const propose = async (proposer: string, title = "Fund the docs sprint") =>
    (await request(app).post("/proposals").send({ proposer, title })).body as VoteActionResult;
  const vote = async (voter: string, proposal: number, inFavor = true) =>
    (await request(app).post("/votes").send({ voter, proposal, inFavor })).body as VoteActionResult;

  beforeEach(() => {
    app = testApp();
  });

  it("lets a Gold holder propose and vote, and nobody else", async () => {
    await holderWith(marta, "Gold");
    expect(((await request(app).get(`/holders/${marta}`)).body as HolderView).canVote).toBe(true);

    const proposed = await propose(marta);
    expect(proposed).toMatchObject({ status: "accepted", proposal: { id: 0, proposer: marta } });
    expect(await vote(marta, 0)).toMatchObject({
      status: "accepted",
      proposal: { inFavor: 1, against: 0 },
    });
    expect(await vote(marta, 0, false)).toMatchObject({
      status: "rejected",
      reason: "AlreadyVoted",
    });

    expect(await vote(smartAccount(), 0)).toMatchObject({ reason: "NotCredentialed" });
    const silver = smartAccount();
    await holderWith(silver, "Silver");
    expect(await propose(silver)).toMatchObject({ reason: "NotCredentialed" });
    expect(await vote(marta, 7)).toMatchObject({ reason: "ProposalNotFound" });

    const listed = (await request(app).get(`/proposals?voter=${marta}`)).body as ProposalView[];
    expect(listed).toMatchObject([{ id: 0, inFavor: 1, hasVoted: true }]);
  });

  it("one credential, two gates, one revocation", async () => {
    await holderWith(marta, "Gold");
    const first = await propose(marta);
    const second = await propose(marta, "Second proposal");
    if (first.status !== "accepted" || second.status !== "accepted")
      throw new Error("not accepted");

    expect((await request(app).post("/payments").send({ to: marta })).body.status).toBe("paid");
    expect((await vote(marta, first.proposal.id)).status).toBe("accepted");

    await request(app).post("/credentials/revoke").send({ address: marta });

    expect((await request(app).post("/payments").send({ to: marta })).body.status).toBe("rejected");
    expect(await vote(marta, second.proposal.id)).toMatchObject({ reason: "NotCredentialed" });
    expect(await propose(marta)).toMatchObject({ reason: "NotCredentialed" });
    // The vote already cast stays; the gate only stops new ones.
    const listed = (await request(app).get("/proposals")).body as ProposalView[];
    expect(listed.find((p) => p.id === first.proposal.id)?.inFavor).toBe(1);
  });

  it("caps the title at 128 bytes", async () => {
    const res = await request(app)
      .post("/proposals")
      .send({ proposer: marta, title: "x".repeat(129) });
    expect(res.status).toBe(400);
  });
});
