"use client";

import type { ActivityEvent, HolderView } from "@acta-gate/shared";
import { Check } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";

import { cn } from "@/lib/utils";

/** The demo table from `docs/IDEA ES.md`. */
const STEPS = [
  "Marta crea su wallet con Face ID. ACTA le crea su vault",
  "GrantFox le emite Contributor Gold y la registra en vc-gate",
  "La tesorería le paga a Marta → pasa",
  "La tesorería le paga a alguien sin credencial → la policy lo rechaza",
  "GrantFox revoca en el vault → el siguiente pago a Marta se rechaza",
];

/**
 * Which steps are done for the current holder. The activity log is shared and
 * newest first: only what happened since this holder's vault was created counts.
 */
function progress(holder: HolderView | null, activity: ActivityEvent[]): boolean[] {
  const me = holder?.address;
  const born = activity.findIndex((e) => e.kind === "vault_deployed" && e.subject === me);
  const session = born === -1 ? [] : activity.slice(0, born + 1);
  const at = (match: (e: ActivityEvent) => boolean) => session.findIndex(match);

  const revoked = at((e) => e.kind === "credential_revoked" && e.subject === me);
  const rejectedHolder = at((e) => e.kind === "payment_rejected" && e.subject === me);

  return [
    Boolean(holder?.vault),
    Boolean(holder?.credential),
    at((e) => e.kind === "payment_sent" && e.subject === me) !== -1,
    at((e) => e.kind === "payment_rejected" && e.subject !== me) !== -1,
    // A smaller index is a later event: rejected after the revocation.
    revoked !== -1 && rejectedHolder !== -1 && rejectedHolder < revoked,
  ];
}

export function Steps({
  holder,
  activity,
}: {
  holder: HolderView | null;
  activity: ActivityEvent[];
}) {
  const done = progress(holder, activity);
  const current = done.indexOf(false);
  const completed = done.filter(Boolean).length;

  return (
    <div>
      <div className="mb-3 flex items-center gap-4">
        <span className="font-mono text-[11px] text-muted-foreground">
          {completed}/{STEPS.length}
        </span>
        <div className="relative h-1 flex-1 overflow-hidden rounded-full bg-border">
          <motion.div
            className="absolute inset-y-0 left-0 rounded-full bg-primary"
            initial={false}
            animate={{ width: `${(completed / STEPS.length) * 100}%` }}
            transition={{ type: "spring", stiffness: 90, damping: 18 }}
          />
        </div>
      </div>
      <ol className="grid gap-2 sm:grid-cols-5">
        {STEPS.map((step, i) => (
          <motion.li
            key={step}
            className={cn(
              "relative flex gap-3 rounded-xl border p-3 text-[13px] leading-snug transition-colors duration-500 sm:flex-col",
              done[i] && "border-primary/40 bg-primary/10",
              i === current && "border-highlight/60",
              !done[i] && i !== current && "border-border text-muted-foreground",
            )}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 + i * 0.06 }}
          >
            {i === current && (
              <motion.span
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 rounded-xl border border-highlight"
                animate={{ opacity: [0.15, 0.6, 0.15] }}
                transition={{ repeat: Infinity, duration: 2.2, ease: "easeInOut" }}
              />
            )}
            <span
              className={cn(
                "grid size-6 shrink-0 place-items-center rounded-full font-mono text-[10px] transition-colors duration-500",
                done[i] ? "bg-primary text-primary-foreground" : "border border-border-strong",
              )}
            >
              <AnimatePresence mode="wait" initial={false}>
                {done[i] ? (
                  <motion.span
                    key="check"
                    initial={{ scale: 0, rotate: -90 }}
                    animate={{ scale: 1, rotate: 0 }}
                    transition={{ type: "spring", stiffness: 400, damping: 15 }}
                  >
                    <Check className="size-3.5" />
                  </motion.span>
                ) : (
                  <motion.span key="n" exit={{ scale: 0 }}>
                    {String(i + 1).padStart(2, "0")}
                  </motion.span>
                )}
              </AnimatePresence>
            </span>
            {step}
          </motion.li>
        ))}
      </ol>
    </div>
  );
}
