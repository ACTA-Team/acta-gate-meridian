"use client";

import type {
  ActivityEvent,
  DemoConfig,
  HolderView,
  PaymentResult,
  ProposalView,
  Tier,
  VoteActionResult,
} from "@acta-gate/shared";
import { useCallback, useEffect, useRef, useState } from "react";

import { useI18n } from "@/i18n/provider";
import { api, ApiRequestError } from "@/lib/api";
import { createHolderWallet, randomContractAddress, signHolderAuth } from "@/lib/wallet";

const HOLDER_KEY = "acta-gate:holder";
const MIN_STAGE_MS = 700;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export type Action =
  "wallet" | "issue" | "register" | "revoke" | "pay-holder" | "pay-stranger" | "propose" | "vote";

export type StageStatus = "pending" | "active" | "done" | "error";

export interface Stage {
  label: string;
  detail: string;
  status: StageStatus;
  txHash: string | null;
  startedAt: number | null;
}

export type OutcomeTone = "success" | "rejected" | "error";

export interface Flow {
  action: Action;
  title: string;
  stages: Stage[];
  outcome: { tone: OutcomeTone; title: string; detail: string } | null;
}

function readStoredHolder(): string | null {
  try {
    return localStorage.getItem(HOLDER_KEY);
  } catch {
    return null;
  }
}

function storeHolder(address: string | null) {
  try {
    if (address) localStorage.setItem(HOLDER_KEY, address);
    else localStorage.removeItem(HOLDER_KEY);
  } catch {
    // Private mode: the demo still works, it just forgets on reload.
  }
}

/** What one stage of a flow does: returns its transaction hash, if any. */
type StageRun = () => Promise<string | null | void>;

/** All the demo state, and one flow per step of the demo table. */
export function useDemo() {
  const [config, setConfig] = useState<DemoConfig | null>(null);
  const [holder, setHolder] = useState<HolderView | null>(null);
  const [activity, setActivity] = useState<ActivityEvent[]>([]);
  const [payment, setPayment] = useState<PaymentResult | null>(null);
  const [proposals, setProposals] = useState<ProposalView[]>([]);
  const [flow, setFlow] = useState<Flow | null>(null);
  /** `url`: the backend is unreachable. `message`: it answered with an error. */
  const [offline, setOffline] = useState<{ url: string } | { message: string } | null>(null);
  const { t } = useI18n();
  const running = useRef(false);

  const refresh = useCallback(async (address: string | null) => {
    const [events, view, list] = await Promise.all([
      api.activity(),
      address ? api.holder(address) : Promise.resolve(null),
      // 503 while credential-vote is not deployed: the vote panel stays off.
      api.proposals(address).catch(() => []),
    ]);
    setActivity(events);
    setHolder(view);
    setProposals(list);
    return view;
  }, []);

  useEffect(() => {
    api
      .config()
      .then(async (cfg) => {
        setConfig(cfg);
        const stored = readStoredHolder();
        // The backend may have restarted; it rebuilds holders from vc-gate when it can.
        const view = stored ? await api.holder(stored).catch(() => null) : null;
        if (stored && !view?.vault) storeHolder(null);
        await refresh(view?.vault ? stored : null);
      })
      .catch((e: Error) =>
        setOffline(
          e instanceof ApiRequestError && e.code === "Offline"
            ? { url: e.message }
            : { message: e.message },
        ),
      );
  }, [refresh]);

  const patchStage = (index: number, patch: Partial<Stage>) =>
    setFlow((f) =>
      f ? { ...f, stages: f.stages.map((s, i) => (i === index ? { ...s, ...patch } : s)) } : f,
    );

  /**
   * Runs the stages one after the other, so the dialog shows real progress:
   * each stage is one call to the backend, and most are one transaction.
   */
  const runFlow = useCallback(
    async (
      action: Action,
      title: string,
      stages: { label: string; detail: string; run: StageRun }[],
      finish: () => Promise<Flow["outcome"]>,
    ) => {
      if (running.current) return;
      running.current = true;
      setFlow({
        action,
        title,
        outcome: null,
        stages: stages.map((s) => ({
          label: s.label,
          detail: s.detail,
          status: "pending",
          txHash: null,
          startedAt: null,
        })),
      });

      let current = 0;
      try {
        for (const [i, stage] of stages.entries()) {
          current = i;
          patchStage(i, { status: "active", startedAt: Date.now() });
          // A floor so a stage that answers at once still reads as a step.
          const [txHash] = await Promise.all([stage.run(), sleep(MIN_STAGE_MS)]);
          patchStage(i, { status: "done", txHash: txHash ?? null });
        }
        const outcome = await finish();
        setFlow((f) => (f ? { ...f, outcome } : f));
      } catch (e) {
        patchStage(current, { status: "error" });
        if (e instanceof Rejection) {
          const outcome = { tone: "rejected" as const, title: e.title, detail: e.message };
          setFlow((f) => (f ? { ...f, outcome } : f));
          return;
        }
        const message = e instanceof Error ? e.message : String(e);
        setFlow((f) =>
          f ? { ...f, outcome: { tone: "error", title: t.flows.failed, detail: message } } : f,
        );
      } finally {
        running.current = false;
      }
    },
    [t],
  );

  const address = holder?.address ?? null;
  const issuerName = config?.issuer.name ?? t.holder.issuerFallback;

  const pay = (action: "pay-holder" | "pay-stranger", amount: string) => {
    let to = "";
    let result: PaymentResult | null = null;
    return runFlow(
      action,
      t.flows.pay.title(amount),
      [
        {
          label: t.flows.pay.sign,
          detail: t.flows.pay.signDetail,
          run: async () => {
            to = action === "pay-holder" ? address! : await randomContractAddress();
            result = await api.pay(to, amount);
            setPayment(result);
            return result.txHash;
          },
        },
        {
          label: t.flows.pay.policy,
          detail: "check(holder, issuer, type, { tier })",
          run: async () => {
            if (result?.status === "rejected") {
              throw new Rejection(t.flows.pay.rejected, result.reason ?? "");
            }
          },
        },
      ],
      async () => {
        await refresh(address);
        return {
          tone: "success",
          title: t.flows.pay.done,
          detail: t.flows.pay.doneDetail(amount, to),
        };
      },
    ).then(() => refresh(address));
  };

  /**
   * `propose` and `vote` need Marta's signature. The first call runs the
   * contract in simulation: a rejection from the gate lands here, before she
   * signs. In testnet it answers `unsigned` with her auth entry; she signs it
   * with the passkey and the second call submits it.
   */
  const holderCall = (
    action: "propose" | "vote",
    title: string,
    gateDetail: string,
    rejectedTitle: string,
    call: (auth?: string) => Promise<VoteActionResult>,
    success: (result: Extract<VoteActionResult, { status: "accepted" }>) => Flow["outcome"],
  ) => {
    let result: VoteActionResult | null = null;
    const settle = (r: VoteActionResult) => {
      result = r;
      if (r.status === "rejected") throw new Rejection(rejectedTitle, r.reason);
    };
    return runFlow(
      action,
      title,
      [
        {
          label: t.flows.holderCall.gate,
          detail: gateDetail,
          run: async () => settle(await call()),
        },
        {
          label: t.flows.holderCall.sign,
          detail: t.flows.holderCall.signDetail,
          run: async () => {
            const pending = result!;
            if (pending.status !== "unsigned")
              return pending.status === "accepted" ? pending.txHash : null;
            settle(await call(await signHolderAuth(address!, pending.authEntry, t.wallet)));
            return result!.status === "accepted" ? result!.txHash : null;
          },
        },
      ],
      async () => {
        await refresh(address);
        return success(result as unknown as Extract<VoteActionResult, { status: "accepted" }>);
      },
    ).then(() => refresh(address));
  };

  return {
    config,
    proposals,
    holder,
    activity,
    payment,
    flow,
    offline,
    busy: flow !== null && flow.outcome === null,
    closeFlow: () => setFlow((f) => (f?.outcome ? null : f)),

    createWallet: () => {
      let wallet = "";
      return runFlow(
        "wallet",
        t.flows.wallet.title,
        [
          {
            label: t.flows.wallet.passkey,
            detail: t.flows.wallet.passkeyDetail,
            run: async () => {
              const created = await createHolderWallet("Marta", t.wallet);
              wallet = created.address;
              return created.txHash;
            },
          },
          {
            label: t.flows.wallet.did,
            detail: t.flows.wallet.didDetail,
            run: async () => (await api.registerDid(wallet)).txHash,
          },
          {
            label: t.flows.wallet.vault,
            detail: t.flows.wallet.vaultDetail,
            run: async () => {
              const { txHash } = await api.createHolder(wallet);
              storeHolder(wallet);
              return txHash;
            },
          },
        ],
        async () => {
          await refresh(wallet);
          return {
            tone: "success",
            title: t.flows.wallet.done,
            detail: t.flows.wallet.doneDetail,
          };
        },
      );
    },

    issue: (tier: Tier) =>
      runFlow(
        "issue",
        t.flows.issue.title(tier),
        [
          {
            label: t.flows.issue.issue(issuerName),
            detail: t.flows.issue.issueDetail,
            run: async () => (await api.issue(address!, tier)).txHash,
          },
          {
            label: t.flows.issue.register,
            detail: `register · tier: ${tier}`,
            run: async () => (await api.register(address!)).txHash,
          },
        ],
        async () => {
          const view = await refresh(address);
          return {
            tone: "success",
            title: t.flows.issue.done(tier),
            detail: `vc-gate.is_valid → ${String(view?.gate.isValid ?? false)}`,
          };
        },
      ),

    /** Completes an issuance whose registration in vc-gate did not go through. */
    register: () =>
      runFlow(
        "register",
        t.flows.register.title,
        [
          {
            label: t.flows.issue.register,
            detail: `register · tier: ${holder?.credential?.tier ?? ""}`,
            run: async () => (await api.register(address!)).txHash,
          },
        ],
        async () => {
          const view = await refresh(address);
          return {
            tone: "success",
            title: t.flows.register.done,
            detail: `vc-gate.is_valid → ${String(view?.gate.isValid ?? false)}`,
          };
        },
      ),

    revoke: () =>
      runFlow(
        "revoke",
        t.flows.revoke.title,
        [
          {
            label: t.flows.revoke.revoke(issuerName),
            detail: "revoke_by_issuer",
            run: async () => (await api.revoke(address!)).txHash,
          },
          {
            label: t.flows.revoke.gate,
            detail: t.flows.revoke.gateDetail,
            run: async () => {
              const view = await refresh(address);
              if (view?.gate.isValid) throw new Error(t.flows.revoke.stillValid);
            },
          },
        ],
        async () => ({
          tone: "rejected",
          title: t.flows.revoke.done,
          detail: t.flows.revoke.doneDetail,
        }),
      ),

    propose: (title: string) =>
      holderCall(
        "propose",
        t.flows.propose.title,
        "propose · check(tier)",
        t.flows.propose.rejected,
        (auth) => api.propose(address!, title, auth),
        (r) => ({
          tone: "success",
          title: t.flows.propose.done(r.proposal.id),
          detail: r.proposal.title,
        }),
      ),

    vote: (proposal: number, inFavor: boolean) =>
      holderCall(
        "vote",
        t.flows.vote.title(inFavor, proposal),
        t.flows.vote.gateDetail,
        t.flows.vote.rejected,
        (auth) => api.vote(address!, proposal, inFavor, auth),
        (r) => ({
          tone: "success",
          title: t.flows.vote.done,
          detail: t.flows.vote.doneDetail(r.proposal.id, r.proposal.inFavor, r.proposal.against),
        }),
      ),

    payHolder: (amount: string) => pay("pay-holder", amount),
    payStranger: (amount: string) => pay("pay-stranger", amount),

    reset: () => {
      storeHolder(null);
      setHolder(null);
      setPayment(null);
    },
  };
}

/** A gate said no (the treasury's policy, or the vote): a rejection, not a failure. */
class Rejection extends Error {
  constructor(
    readonly title: string,
    message: string,
  ) {
    super(message);
  }
}

export type DemoState = ReturnType<typeof useDemo>;
