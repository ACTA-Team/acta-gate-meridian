"use client";

import type { ActivityEvent, DemoConfig, HolderView, PaymentResult, Tier } from "@acta-gate/shared";
import { useCallback, useEffect, useRef, useState } from "react";

import { shortAddress } from "@/components/address";
import { api } from "@/lib/api";
import { createHolderWallet, randomContractAddress } from "@/lib/wallet";

const HOLDER_KEY = "acta-gate:holder";
const MIN_STAGE_MS = 700;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export type Action = "wallet" | "issue" | "register" | "revoke" | "pay-holder" | "pay-stranger";

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
  const [flow, setFlow] = useState<Flow | null>(null);
  const [offline, setOffline] = useState<string | null>(null);
  const running = useRef(false);

  const refresh = useCallback(async (address: string | null) => {
    const [events, view] = await Promise.all([
      api.activity(),
      address ? api.holder(address) : Promise.resolve(null),
    ]);
    setActivity(events);
    setHolder(view);
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
      .catch((e: Error) => setOffline(e.message));
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
          // A floor so instant (mock) stages still read as steps; testnet ones take longer anyway.
          const [txHash] = await Promise.all([stage.run(), sleep(MIN_STAGE_MS)]);
          patchStage(i, { status: "done", txHash: txHash ?? null });
        }
        const outcome = await finish();
        setFlow((f) => (f ? { ...f, outcome } : f));
      } catch (e) {
        patchStage(current, { status: "error" });
        if (e instanceof PolicyRejection) {
          const outcome = {
            tone: "rejected" as const,
            title: "Pago rechazado por la policy",
            detail: e.message,
          };
          setFlow((f) => (f ? { ...f, outcome } : f));
          return;
        }
        const message = e instanceof Error ? e.message : String(e);
        setFlow((f) =>
          f ? { ...f, outcome: { tone: "error", title: "Algo falló", detail: message } } : f,
        );
      } finally {
        running.current = false;
      }
    },
    [],
  );

  const address = holder?.address ?? null;
  const testnet = config?.mode === "testnet";

  const pay = (action: "pay-holder" | "pay-stranger", amount: string) => {
    let to = "";
    let result: PaymentResult | null = null;
    return runFlow(
      action,
      `Pago de ${amount} USDC`,
      [
        {
          label: "La tesorería firma el pago",
          detail: "Firmante Ed25519 · regla Default",
          run: async () => {
            to = action === "pay-holder" ? address! : await randomContractAddress();
            result = await api.pay(to, amount);
            setPayment(result);
            return result.txHash;
          },
        },
        {
          label: "credential-policy consulta vc-gate",
          detail: "is_valid · has_claim(tier)",
          run: async () => {
            if (result?.status === "rejected") throw new PolicyRejection(result.reason ?? "");
          },
        },
      ],
      async () => {
        await refresh(address);
        return {
          tone: "success",
          title: "Pago aprobado",
          detail: `${amount} USDC llegaron a ${shortAddress(to)}`,
        };
      },
    ).then(() => refresh(address));
  };

  return {
    config,
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
        "Wallet de Marta",
        [
          {
            label: "Passkey y smart account",
            detail: testnet ? "Tu navegador te pide Face ID o Touch ID" : "Simulado",
            run: async () => {
              const created = await createHolderWallet(config!.mode, "Marta");
              wallet = created.address;
              return created.txHash;
            },
          },
          {
            label: "ACTA crea tu vault",
            detail: "deploy_sponsored · Marta no firma ni paga",
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
            title: "Wallet lista",
            detail: "Tu smart account y tu vault ya están en Stellar.",
          };
        },
      );
    },

    issue: (tier: Tier) =>
      runFlow(
        "issue",
        `Credencial Contributor ${tier}`,
        [
          {
            label: `${config?.issuer.name ?? "El emisor"} emite en el vault`,
            detail: "vault.issue · guarda quién la emitió",
            run: async () => (await api.issue(address!, tier)).txHash,
          },
          {
            label: "Registro en vc-gate",
            detail: `register · tier: ${tier}`,
            run: async () => (await api.register(address!)).txHash,
          },
        ],
        async () => {
          const view = await refresh(address);
          return {
            tone: "success",
            title: `Contributor ${tier} emitida`,
            detail: `vc-gate.is_valid → ${String(view?.gate.isValid ?? false)}`,
          };
        },
      ),

    /** Completes an issuance whose registration in vc-gate did not go through. */
    register: () =>
      runFlow(
        "register",
        "Registrar en vc-gate",
        [
          {
            label: "Registro en vc-gate",
            detail: `register · tier: ${holder?.credential?.tier ?? ""}`,
            run: async () => (await api.register(address!)).txHash,
          },
        ],
        async () => {
          const view = await refresh(address);
          return {
            tone: "success",
            title: "Registrada en vc-gate",
            detail: `vc-gate.is_valid → ${String(view?.gate.isValid ?? false)}`,
          };
        },
      ),

    revoke: () =>
      runFlow(
        "revoke",
        "Revocar la credencial",
        [
          {
            label: `${config?.issuer.name ?? "El emisor"} revoca en el vault`,
            detail: "revoke_by_issuer",
            run: async () => (await api.revoke(address!)).txHash,
          },
          {
            label: "vc-gate lo ve en la siguiente lectura",
            detail: "Nadie toca el gate ni una allowlist",
            run: async () => {
              const view = await refresh(address);
              if (view?.gate.isValid) throw new Error("vc-gate todavía la ve válida");
            },
          },
        ],
        async () => ({
          tone: "rejected",
          title: "Credencial revocada",
          detail: "vc-gate.is_valid → false. El próximo pago a Marta va a rebotar.",
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

/** The policy said no: shown as a rejection, not as a failure. */
class PolicyRejection extends Error {}

export type DemoState = ReturnType<typeof useDemo>;
