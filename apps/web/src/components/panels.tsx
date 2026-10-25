"use client";

import {
  didResolverUrl,
  MAX_TITLE_LEN,
  TIERS,
  type ProposalView,
  type Tier,
} from "@acta-gate/shared";
import {
  Ban,
  ExternalLink,
  Fingerprint,
  Loader2,
  RotateCcw,
  Send,
  ShieldCheck,
  ThumbsDown,
  ThumbsUp,
  UserX,
  Vote,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";

import { Address, shortAddress } from "@/components/address";
import { CredentialCard } from "@/components/credential-card";
import { Button } from "@/components/ui/button";
import type { Action, DemoState } from "@/hooks/use-demo";
import { useI18n } from "@/i18n/provider";
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

/** The holder's `did:stellar`, with a link to ACTA's resolver. */
function Did({ value }: { value: string }) {
  const { t } = useI18n();
  const id = value.slice(value.lastIndexOf(":") + 1);
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="eyebrow">{t.holder.did}</span>
      <a
        href={didResolverUrl(value)}
        target="_blank"
        rel="noreferrer"
        title={`${value} · ${t.holder.resolver}`}
        className="group inline-flex items-center gap-2 font-mono text-[12px] text-foreground/85 transition-colors hover:text-foreground"
      >
        did:stellar:…:{id.slice(0, 4)}…{id.slice(-4)}
        <ExternalLink className="size-3.5 opacity-40 group-hover:opacity-100" />
      </a>
    </div>
  );
}

export function HolderPanel({ demo }: { demo: DemoState }) {
  const { config, holder, busy } = demo;
  const { t } = useI18n();

  return (
    <RolePanel index={1} role={t.holder.role} name="Marta" description={t.holder.description}>
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
              {holder.did && <Did value={holder.did} />}
              {holder.vault && <Address label="Vault" value={holder.vault} />}
            </div>
            <CredentialCard
              holder={holder}
              issuerName={config?.issuer.name ?? t.holder.issuerFallback}
            />
            <Button
              variant="ghost"
              size="sm"
              className="self-start"
              disabled={busy}
              onClick={demo.reset}
            >
              <RotateCcw /> {t.holder.reset}
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
              <p className="mt-4 text-sm text-muted-foreground">{t.holder.passkeyHint}</p>
            </div>
            <Button size="lg" disabled={!config || busy} onClick={demo.createWallet}>
              <ActionIcon demo={demo} action="wallet">
                <Fingerprint />
              </ActionIcon>
              {t.holder.create}
            </Button>
          </motion.div>
        )}
      </AnimatePresence>
    </RolePanel>
  );
}

export function IssuerPanel({ demo }: { demo: DemoState }) {
  const { config, holder, busy } = demo;
  const { t } = useI18n();
  const [tier, setTier] = useState<Tier>("Gold");
  const hasVault = Boolean(holder?.vault);
  const valid = holder?.credential?.status === "valid";
  // Issued in the vault but not in vc-gate: the gate cannot see it yet.
  const unregistered = valid && !holder?.gate.registered;

  return (
    <RolePanel
      index={2}
      role={t.issuer.role}
      name={config?.issuer.name ?? "GrantFox"}
      description={t.issuer.description}
    >
      {config && (
        <Address
          label={t.issuer.address}
          value={config.issuer.address}
          className="rounded-xl bg-surface-sunken p-4"
        />
      )}

      <div>
        <p className="eyebrow mb-2">{t.issuer.tier}</p>
        <div className="relative grid grid-cols-2 rounded-full border border-border-strong p-1">
          {TIERS.map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setTier(option)}
              className={cn(
                "relative z-10 rounded-full py-1.5 text-sm font-medium transition-colors duration-300",
                tier === option
                  ? "text-primary-foreground"
                  : "text-foreground/70 hover:text-foreground",
              )}
            >
              {tier === option && (
                <motion.span
                  layoutId="tier-pill"
                  className="absolute inset-0 -z-10 rounded-full bg-primary"
                  transition={{ type: "spring", stiffness: 400, damping: 32 }}
                />
              )}
              {option}
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
                {t.issuer.unregistered}
              </div>
              <Button className="w-full" disabled={busy} onClick={demo.register}>
                <ActionIcon demo={demo} action="register">
                  <ShieldCheck />
                </ActionIcon>
                {t.issuer.register}
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
          {t.issuer.issue(tier)}
        </Button>
        <Button variant="outline" disabled={!valid || busy} onClick={demo.revoke}>
          <ActionIcon demo={demo} action="revoke">
            <Ban />
          </ActionIcon>
          {t.issuer.revoke}
        </Button>
      </div>
      {!hasVault && <p className="text-xs text-muted-foreground">{t.common.needWallet}</p>}
    </RolePanel>
  );
}

export function TreasuryPanel({ demo }: { demo: DemoState }) {
  const { config, holder, busy, payment } = demo;
  const { t } = useI18n();
  const requirement = {
    credentialType: config?.credentialType ?? "ContributorBadge",
    tier: config?.requiredTier ?? "Gold",
  };
  const [amount, setAmount] = useState("25");

  return (
    <RolePanel
      index={3}
      role={t.treasury.role}
      name={config?.treasury.name ?? t.treasury.nameFallback}
      description={t.treasury.description(requirement)}
    >
      {config && (
        <Address
          label="Smart account"
          value={config.treasury.address}
          className="rounded-xl bg-surface-sunken p-4"
        />
      )}

      <label className="block">
        <span className="eyebrow mb-2 block">{t.treasury.amount}</span>
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
          {t.treasury.payHolder}
        </Button>
        <Button
          variant="outline"
          disabled={!config || busy || !amount}
          onClick={() => demo.payStranger(amount)}
        >
          <ActionIcon demo={demo} action="pay-stranger">
            <UserX />
          </ActionIcon>
          {t.treasury.payStranger}
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
            <p className="eyebrow">{t.treasury.last}</p>
            <p className="mt-1 text-lg font-bold">
              {payment.status === "paid" ? t.treasury.paid : t.treasury.rejected}
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

const encoder = new TextEncoder();

/** One proposal: the tally, and Marta's two buttons until she votes. */
function ProposalRow({ demo, proposal }: { demo: DemoState; proposal: ProposalView }) {
  const { holder, busy } = demo;
  const { t } = useI18n();
  const total = proposal.inFavor + proposal.against;
  const share = total ? (proposal.inFavor / total) * 100 : 0;
  const voting = busy && demo.flow?.action === "vote";

  return (
    <motion.li
      layout
      className="rounded-xl border border-border bg-surface-sunken p-4"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-mono text-[11px] text-muted-foreground">
            #{proposal.id} · {shortAddress(proposal.proposer)}
          </p>
          <p className="mt-1 break-words text-sm font-medium">{proposal.title}</p>
        </div>
        <p className="shrink-0 font-mono text-[11px] text-muted-foreground">
          {proposal.inFavor} · {proposal.against}
        </p>
      </div>
      <div className="mt-3 h-1 overflow-hidden rounded-full bg-cherry/30">
        <motion.div
          className="h-full rounded-full bg-primary"
          initial={false}
          animate={{ width: `${total ? share : 0}%` }}
          transition={{ type: "spring", stiffness: 90, damping: 18 }}
        />
      </div>
      {proposal.hasVoted ? (
        <p className="mt-3 font-mono text-[11px] text-primary">has_voted → true</p>
      ) : (
        <div className="mt-3 flex gap-2">
          <Button size="sm" disabled={!holder || busy} onClick={() => demo.vote(proposal.id, true)}>
            {voting ? <Loader2 className="animate-spin" /> : <ThumbsUp />} {t.vote.inFavor}
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={!holder || busy}
            onClick={() => demo.vote(proposal.id, false)}
          >
            <ThumbsDown /> {t.vote.against}
          </Button>
        </div>
      )}
    </motion.li>
  );
}

/**
 * `credential-vote`, the second gate: a plain contract that asks `vc-gate`
 * before letting Marta act. Here she signs; the treasury never needed her to.
 */
export function VotePanel({ demo }: { demo: DemoState }) {
  const { config, holder, busy, proposals } = demo;
  const { t } = useI18n();
  const [title, setTitle] = useState("");
  const vote = config?.vote ?? null;
  const tooLong = encoder.encode(title.trim()).length > MAX_TITLE_LEN;

  return (
    <RolePanel
      index={4}
      role={t.vote.role}
      name={vote?.name ?? t.vote.nameFallback}
      description={t.vote.description({
        credentialType: config?.credentialType ?? "ContributorBadge",
        tier: config?.requiredTier ?? "Gold",
      })}
    >
      {!vote ? (
        <p className="rounded-xl border border-dashed border-border-strong p-4 text-sm text-muted-foreground">
          {t.vote.notDeployed} <span className="font-mono">CREDENTIAL_VOTE_ID</span>{" "}
          {t.vote.notDeployedTail}
        </p>
      ) : (
        <div className="grid gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
          <div className="flex flex-col gap-4">
            <div className="space-y-2 rounded-xl bg-surface-sunken p-4">
              <Address label={t.vote.contract} value={vote.address} />
              <div className="flex items-center justify-between font-mono text-[11px]">
                <span className="text-muted-foreground">can_vote(Marta)</span>
                <span className={holder?.canVote ? "text-primary" : "text-cherry"}>
                  {holder ? String(holder.canVote) : "—"}
                </span>
              </div>
            </div>

            <form
              className="flex flex-col gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                const t = title.trim();
                if (!t || tooLong) return;
                void demo.propose(t).then(() => setTitle(""));
              }}
            >
              <label className="block">
                <span className="eyebrow mb-2 block">{t.vote.newProposal}</span>
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder={t.vote.placeholder}
                  className="h-10 w-full rounded-full border border-input bg-transparent px-4 text-sm outline-none transition-[border-color,box-shadow] duration-300 focus:border-primary focus:shadow-[0_0_0_4px_var(--glow)]"
                />
              </label>
              {tooLong && (
                <p className="font-mono text-[11px] text-cherry">{t.vote.tooLong(MAX_TITLE_LEN)}</p>
              )}
              <Button type="submit" disabled={!holder || busy || !title.trim() || tooLong}>
                <ActionIcon demo={demo} action="propose">
                  <Vote />
                </ActionIcon>
                {t.vote.propose}
              </Button>
              {!holder && <p className="text-xs text-muted-foreground">{t.common.needWallet}</p>}
            </form>
          </div>

          <div>
            <p className="eyebrow mb-2">{t.vote.proposals}</p>
            {proposals.length === 0 ? (
              <p className="rounded-xl border border-dashed border-border-strong p-6 text-center text-sm text-muted-foreground">
                {t.vote.empty}
              </p>
            ) : (
              <ul className="flex max-h-96 flex-col gap-2 overflow-y-auto pr-1">
                <AnimatePresence initial={false}>
                  {proposals.map((p) => (
                    <ProposalRow key={p.id} demo={demo} proposal={p} />
                  ))}
                </AnimatePresence>
              </ul>
            )}
          </div>
        </div>
      )}
    </RolePanel>
  );
}
