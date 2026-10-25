"use client";

import { didResolverUrl, TIERS, type Tier } from "@acta-gate/shared";
import {
  Ban,
  ExternalLink,
  Fingerprint,
  Loader2,
  RotateCcw,
  Send,
  ShieldCheck,
  UserX,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";

import { Address, shortAddress } from "@/components/address";
import { CredentialCard } from "@/components/credential-card";
import { Button } from "@/components/ui/button";
import type { Action, DemoState } from "@/hooks/use-demo";
import { cn } from "@/lib/utils";

/** The frame each role sits in: numbered eyebrow, name, one line of context. */
function RolePanel({
  index,
  role,
  name,
  description,
  children,
}: {
  index: number;
  role: string;
  name: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <motion.section
      className="group relative flex flex-col gap-5 overflow-hidden rounded-2xl border border-border bg-surface p-6 transition-colors duration-500 hover:border-primary/40"
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 140, damping: 20, delay: 0.45 + index * 0.1 }}
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-24 -top-24 size-56 rounded-full bg-[radial-gradient(closest-side,var(--glow),transparent)] opacity-0 blur-2xl transition-opacity duration-700 group-hover:opacity-100"
      />
      <div className="relative">
        <p className="eyebrow flex items-center gap-3">
          <span className="text-foreground/80">{String(index).padStart(2, "0")}</span>
          <span className="h-px w-6 rounded-full bg-border-strong" aria-hidden="true" />
          <span>{role}</span>
        </p>
        <h2 className="mt-3 text-2xl font-bold">{name}</h2>
        <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{description}</p>
      </div>
      <div className="relative flex flex-col gap-5">{children}</div>
    </motion.section>
  );
}

/** The icon of a button, or a spinner while its own flow runs. */
function ActionIcon({
  demo,
  action,
  children,
}: {
  demo: DemoState;
  action: Action;
  children: React.ReactNode;
}) {
  return demo.busy && demo.flow?.action === action ? (
    <Loader2 className="animate-spin" />
  ) : (
    <>{children}</>
  );
}

/** The holder's `did:stellar`, with a link to ACTA's resolver on testnet. */
function Did({ value, resolvable }: { value: string; resolvable: boolean }) {
  const id = value.slice(value.lastIndexOf(":") + 1);
  const label = `did:stellar:…:${id.slice(0, 4)}…${id.slice(-4)}`;
  const text = (
    <span className="inline-flex items-center gap-2 font-mono text-[12px] text-foreground/85">
      {label}
      {resolvable && <ExternalLink className="size-3.5 opacity-40 group-hover:opacity-100" />}
    </span>
  );
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="eyebrow">Cédula</span>
      {resolvable ? (
        <a
          href={didResolverUrl(value)}
          target="_blank"
          rel="noreferrer"
          title={`${value} · resolver en did.acta.build`}
          className="group transition-colors hover:text-foreground"
        >
          {text}
        </a>
      ) : (
        <span title={value}>{text}</span>
      )}
    </div>
  );
}

export function HolderPanel({ demo }: { demo: DemoState }) {
  const { config, holder, busy } = demo;
  const testnet = config?.mode === "testnet";

  return (
    <RolePanel
      index={1}
      role="Titular"
      name="Marta"
      description="Su identidad es una smart account con passkey. ACTA le crea el vault: ella no firma ni paga nada."
    >
      <AnimatePresence mode="wait" initial={false}>
        {holder ? (
          <motion.div
            key="holder"
            className="flex flex-col gap-5"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
          >
            <div className="space-y-2 rounded-xl bg-surface-sunken p-4">
              <Address label="Smart account" value={holder.address} />
              {holder.did && <Did value={holder.did} resolvable={testnet} />}
              {holder.vault && <Address label="Vault" value={holder.vault} />}
            </div>
            <CredentialCard holder={holder} issuerName={config?.issuer.name ?? "Emisor"} />
            <Button
              variant="ghost"
              size="sm"
              className="self-start"
              disabled={busy}
              onClick={demo.reset}
            >
              <RotateCcw /> Empezar con otra titular
            </Button>
          </motion.div>
        ) : (
          <motion.div
            key="empty"
            className="flex flex-col gap-4"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
          >
            <div className="grid place-items-center rounded-2xl border border-dashed border-border-strong px-6 py-10 text-center">
              <motion.span
                className="grid size-14 place-items-center rounded-full bg-primary/15 text-primary"
                animate={{ scale: [1, 1.06, 1] }}
                transition={{ repeat: Infinity, duration: 2.4, ease: "easeInOut" }}
              >
                <Fingerprint className="size-7" />
              </motion.span>
              <p className="mt-4 text-sm text-muted-foreground">
                {testnet
                  ? "Una passkey de tu dispositivo controla la smart account. Sin frase semilla, sin XLM."
                  : "En modo simulado se usa una dirección de prueba."}
              </p>
            </div>
            <Button size="lg" disabled={!config || busy} onClick={demo.createWallet}>
              <ActionIcon demo={demo} action="wallet">
                <Fingerprint />
              </ActionIcon>
              {testnet ? "Crear wallet con Face ID" : "Crear wallet de Marta"}
            </Button>
          </motion.div>
        )}
      </AnimatePresence>
    </RolePanel>
  );
}

export function IssuerPanel({ demo }: { demo: DemoState }) {
  const { config, holder, busy } = demo;
  const [tier, setTier] = useState<Tier>("Gold");
  const hasVault = Boolean(holder?.vault);
  const valid = holder?.credential?.status === "valid";
  // Issued in the vault but not in vc-gate: the gate cannot see it yet.
  const unregistered = valid && !holder?.gate.registered;

  return (
    <RolePanel
      index={2}
      role="Emisor"
      name={config?.issuer.name ?? "GrantFox"}
      description="Emite la credencial en el vault de Marta y registra el claim público en vc-gate. Puede revocarla cuando quiera."
    >
      {config && (
        <Address
          label="Dirección"
          value={config.issuer.address}
          className="rounded-xl bg-surface-sunken p-4"
        />
      )}

      <div>
        <p className="eyebrow mb-2">Tier</p>
        <div className="relative grid grid-cols-2 rounded-full border border-border-strong p-1">
          {TIERS.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTier(t)}
              className={cn(
                "relative z-10 rounded-full py-1.5 text-sm font-medium transition-colors duration-300",
                tier === t ? "text-primary-foreground" : "text-foreground/70 hover:text-foreground",
              )}
            >
              {tier === t && (
                <motion.span
                  layoutId="tier-pill"
                  className="absolute inset-0 -z-10 rounded-full bg-primary"
                  transition={{ type: "spring", stiffness: 400, damping: 32 }}
                />
              )}
              {t}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <AnimatePresence initial={false}>
          {unregistered && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden"
            >
              <div className="mb-2 rounded-xl border border-cherry/40 bg-cherry/10 p-3 text-xs text-muted-foreground">
                La credencial está en el vault pero no en vc-gate: la tesorería todavía no la ve.
              </div>
              <Button className="w-full" disabled={busy} onClick={demo.register}>
                <ActionIcon demo={demo} action="register">
                  <ShieldCheck />
                </ActionIcon>
                Registrar en vc-gate
              </Button>
            </motion.div>
          )}
        </AnimatePresence>
        <Button
          variant={unregistered ? "outline" : "default"}
          disabled={!hasVault || busy}
          onClick={() => demo.issue(tier)}
        >
          <ActionIcon demo={demo} action="issue">
            <ShieldCheck />
          </ActionIcon>
          Emitir {tier} y registrar en vc-gate
        </Button>
        <Button variant="outline" disabled={!valid || busy} onClick={demo.revoke}>
          <ActionIcon demo={demo} action="revoke">
            <Ban />
          </ActionIcon>
          Revocar en el vault
        </Button>
      </div>
      {!hasVault && (
        <p className="text-xs text-muted-foreground">Primero crea la wallet de Marta.</p>
      )}
    </RolePanel>
  );
}

export function TreasuryPanel({ demo }: { demo: DemoState }) {
  const { config, holder, busy, payment } = demo;
  const [amount, setAmount] = useState("25");

  return (
    <RolePanel
      index={3}
      role="Tesorería"
      name={config?.treasury.name ?? "Tesorería"}
      description={`Smart account de OpenZeppelin. Su única regla lleva credential-policy: solo paga a quien tenga ${config?.credentialType ?? "la credencial"} ${config?.requiredTier ?? ""} válida.`}
    >
      {config && (
        <Address
          label="Smart account"
          value={config.treasury.address}
          className="rounded-xl bg-surface-sunken p-4"
        />
      )}

      <label className="block">
        <span className="eyebrow mb-2 block">Monto (USDC)</span>
        <input
          inputMode="decimal"
          value={amount}
          onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))}
          className="h-10 w-full rounded-full border border-input bg-transparent px-4 font-mono text-sm outline-none transition-[border-color,box-shadow] duration-300 focus:border-primary focus:shadow-[0_0_0_4px_var(--glow)]"
        />
      </label>

      <div className="flex flex-col gap-2">
        <Button disabled={!holder || busy || !amount} onClick={() => demo.payHolder(amount)}>
          <ActionIcon demo={demo} action="pay-holder">
            <Send />
          </ActionIcon>
          Pagarle a Marta
        </Button>
        <Button
          variant="outline"
          disabled={!config || busy || !amount}
          onClick={() => demo.payStranger(amount)}
        >
          <ActionIcon demo={demo} action="pay-stranger">
            <UserX />
          </ActionIcon>
          Pagarle a alguien sin credencial
        </Button>
      </div>

      <AnimatePresence mode="popLayout">
        {payment && (
          <motion.div
            key={`${payment.status}-${payment.to}-${payment.txHash}`}
            className={cn(
              "rounded-xl border p-4",
              payment.status === "paid"
                ? "border-primary/40 bg-primary/10"
                : "border-cherry/40 bg-cherry/10",
            )}
            initial={{ opacity: 0, scale: 0.94, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96 }}
            transition={{ type: "spring", stiffness: 260, damping: 22 }}
          >
            <p className="eyebrow">Último pago</p>
            <p className="mt-1 text-lg font-bold">
              {payment.status === "paid" ? "Pagado" : "Rechazado por la policy"}
            </p>
            <p className="mt-1 font-mono text-[11px] text-muted-foreground">
              {payment.amount} USDC → {shortAddress(payment.to)}
            </p>
            {payment.reason && (
              <p className="mt-2 font-mono text-[11px] text-cherry">{payment.reason}</p>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </RolePanel>
  );
}
