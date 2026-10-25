import { randomBytes } from "node:crypto";

import type { ActionResult, PaymentResult } from "@acta-gate/shared";
import { StrKey } from "@stellar/stellar-sdk";
import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";

import { createApp } from "../src/app.js";
import { loadConfig } from "../src/config.js";

const smartAccount = () => StrKey.encodeContract(randomBytes(32));

/** The demo table in `docs/IDEA ES.md`, in mock mode. */
describe("demo flow", () => {
  let app: ReturnType<typeof createApp>;
  const marta = smartAccount();

  const pay = async (to: string) =>
    (await request(app).post("/payments").send({ to, amount: "25" })).body as PaymentResult;

  beforeEach(() => {
    app = createApp(loadConfig({}));
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

  it("asks for every testnet setting up front", () => {
    expect(() => loadConfig({ GATE_MODE: "testnet" })).toThrow(/VAULT_FACTORY_ID/);
  });
});
