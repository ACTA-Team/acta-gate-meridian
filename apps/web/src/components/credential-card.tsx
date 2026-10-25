"use client";

import type { HolderView } from "@acta-gate/shared";
import { AnimatePresence, motion } from "motion/react";

import { shortAddress } from "@/components/address";
import { LogoIcon } from "@/components/logo";
import { useI18n } from "@/i18n/provider";
import { cn } from "@/lib/utils";

/**
 * Marta's credential as a "paper" panel, like the hero card on acta.build.
 * Every value comes from the chain: the vault's `verify_vc` and `vc-gate`.
 * It turns in when issued, a sheen crosses it while valid, and a stamp lands
 * when it is revoked.
 */
export function CredentialCard({ holder, issuerName }: { holder: HolderView; issuerName: string }) {
  const { t } = useI18n();
  const vc = holder.credential;
  const revoked = vc?.status === "revoked";
  const valid = vc?.status === "valid" && holder.gate.isValid;
  const year = vc ? new Date(vc.issuedAt).getFullYear() : new Date().getFullYear();

  return (
    <div className="perspective-distant">
      <motion.div
        key={vc?.vcId ?? "empty"}
        className="relative overflow-hidden rounded-3xl bg-paper p-6 text-paper-ink shadow-soft"
        initial={vc ? { rotateY: -80, opacity: 0, scale: 0.92 } : { opacity: 0 }}
        animate={{ rotateY: 0, opacity: 1, scale: 1 }}
        transition={{ type: "spring", stiffness: 120, damping: 16 }}
        whileHover={{ y: -4, rotateX: 4, rotateY: -4 }}
      >
        <motion.div
          aria-hidden="true"
          className="pointer-events-none absolute -right-14 -top-14 size-48 animate-drift rounded-full blur-3xl"
          animate={{
            backgroundColor: revoked ? "rgb(188 15 15 / 0.28)" : "rgb(69 93 253 / 0.3)",
          }}
          transition={{ duration: 0.8 }}
        />

        {valid && (
          <motion.div
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-0 w-1/3 -skew-x-12 bg-linear-to-r from-transparent via-white/25 to-transparent"
            initial={{ left: "-40%" }}
            animate={{ left: "140%" }}
            transition={{ duration: 1.6, repeat: Infinity, repeatDelay: 2.4, ease: "easeInOut" }}
          />
        )}

        <div className="relative flex items-start justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <span className="grid size-8 place-items-center rounded-full bg-blue">
              <LogoIcon size={14} onDark />
            </span>
            <p className="font-mono text-[10px] uppercase leading-snug tracking-[0.18em] text-paper-muted">
              Contributor
              <br />
              Badge
            </p>
          </div>
          <p className="font-mono text-2xl font-bold leading-none tracking-tight">{year}</p>
        </div>

        <h3 className="relative mt-8 text-xl font-semibold leading-tight">
          {vc ? (
            <>
              Contributor <span className="font-light">{vc.tier}</span>
            </>
          ) : (
            <span className="font-light text-paper-muted">{t.credential.waiting}</span>
          )}
        </h3>
        <p className="relative mt-1 font-mono text-[11px] text-paper-muted">
          {issuerName} →{" "}
          {holder.vault ? `vault ${shortAddress(holder.vault)}` : t.credential.noVault}
        </p>

        <dl className="relative mt-5 space-y-2 rounded-2xl bg-paper-inset p-4 font-mono text-[11px]">
          <Row label="vault.verify_vc">
            <Status tone={vc?.status === "valid" ? "ok" : revoked ? "alert" : "idle"}>
              {vc ? { valid: "Valid", revoked: "Revoked", invalid: "Invalid" }[vc.status] : "—"}
            </Status>
          </Row>
          <Row label="vc-gate.is_valid">
            <Status tone={holder.gate.isValid ? "ok" : holder.gate.registered ? "alert" : "idle"}>
              {holder.gate.registered ? String(holder.gate.isValid) : t.credential.unregistered}
            </Status>
          </Row>
          <Row label="claims">
            <Swap
              value={
                Object.keys(holder.gate.claims).length
                  ? Object.entries(holder.gate.claims)
                      .map(([k, v]) => `${k}: ${v}`)
                      .join(", ")
                  : "—"
              }
            />
          </Row>
        </dl>

        <AnimatePresence>
          {revoked && (
            <motion.div
              className="pointer-events-none absolute inset-0 grid place-items-center"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <motion.span
                className="rounded-xl border-[3px] border-cherry px-5 py-2 font-mono text-2xl font-bold uppercase tracking-[0.2em] text-cherry mix-blend-multiply dark:mix-blend-normal"
                initial={{ scale: 2.4, rotate: -24, opacity: 0 }}
                animate={{ scale: 1, rotate: -12, opacity: 0.9 }}
                transition={{ type: "spring", stiffness: 300, damping: 14, delay: 0.15 }}
              >
                {t.credential.revoked}
              </motion.span>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-paper-muted">{label}</dt>
      <dd className="text-right">{children}</dd>
    </div>
  );
}

/** A value that slides when it changes. */
function Swap({ value }: { value: string }) {
  return (
    <span className="relative inline-flex overflow-hidden">
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={value}
          initial={{ y: 10, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -10, opacity: 0 }}
          transition={{ type: "spring", stiffness: 380, damping: 30 }}
        >
          {value}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}

function Status({ tone, children }: { tone: "ok" | "alert" | "idle"; children: string }) {
  return (
    <span className="flex items-center justify-end gap-2 font-bold">
      {tone !== "idle" && (
        <span className="relative flex size-1.5">
          {tone === "ok" && (
            <span className="absolute inset-0 animate-ping-soft rounded-full bg-blue" />
          )}
          <span
            className={cn(
              "relative size-1.5 rounded-full transition-colors duration-500",
              tone === "ok" ? "bg-blue" : "bg-paper-alert",
            )}
          />
        </span>
      )}
      <Swap value={children} />
    </span>
  );
}
