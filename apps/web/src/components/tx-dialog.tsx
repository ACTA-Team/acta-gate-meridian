"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { ExternalLink, ShieldCheck, ShieldX, TriangleAlert, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import type { Flow, OutcomeTone, Stage } from "@/hooks/use-demo";
import { cn } from "@/lib/utils";

const spring = { type: "spring", stiffness: 320, damping: 26 } as const;

/** Seconds since the stage started, while it runs. */
function Elapsed({ since }: { since: number }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, []);
  return <>{Math.max(0, Math.floor((now - since) / 1000))} s</>;
}

function Indicator({ status }: { status: Stage["status"] }) {
  return (
    <span className="relative grid size-7 shrink-0 place-items-center">
      <AnimatePresence mode="wait" initial={false}>
        {status === "pending" && (
          <motion.span
            key="pending"
            className="size-3 rounded-full border border-border-strong"
            initial={{ scale: 0.6, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.6, opacity: 0 }}
          />
        )}
        {status === "active" && (
          <motion.span
            key="active"
            className="absolute inset-0"
            initial={{ scale: 0.6, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.6, opacity: 0 }}
          >
            <span className="absolute inset-0 animate-ping-soft rounded-full bg-primary/40" />
            <motion.span
              className="absolute inset-0 rounded-full border-2 border-primary/25 border-t-primary"
              animate={{ rotate: 360 }}
              transition={{ repeat: Infinity, duration: 0.9, ease: "linear" }}
            />
          </motion.span>
        )}
        {status === "done" && (
          <motion.span
            key="done"
            className="grid size-7 place-items-center rounded-full bg-primary text-primary-foreground"
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={spring}
          >
            <svg viewBox="0 0 24 24" className="size-4" fill="none">
              <motion.path
                d="M5 12.5l4.5 4.5L19 7.5"
                stroke="currentColor"
                strokeWidth={2.6}
                strokeLinecap="round"
                strokeLinejoin="round"
                initial={{ pathLength: 0 }}
                animate={{ pathLength: 1 }}
                transition={{ duration: 0.35, delay: 0.1 }}
              />
            </svg>
          </motion.span>
        )}
        {status === "error" && (
          <motion.span
            key="error"
            className="grid size-7 place-items-center rounded-full bg-cherry text-white"
            initial={{ scale: 0, rotate: -45 }}
            animate={{ scale: 1, rotate: 0, x: [0, -4, 4, -3, 3, 0] }}
            transition={{ ...spring, x: { duration: 0.4, delay: 0.15 } }}
          >
            <X className="size-4" strokeWidth={2.6} />
          </motion.span>
        )}
      </AnimatePresence>
    </span>
  );
}

const OUTCOME: Record<OutcomeTone, { icon: typeof ShieldCheck; ring: string; fill: string }> = {
  success: {
    icon: ShieldCheck,
    ring: "border-primary",
    fill: "bg-primary text-primary-foreground",
  },
  rejected: { icon: ShieldX, ring: "border-cherry", fill: "bg-cherry text-white" },
  error: { icon: TriangleAlert, ring: "border-cherry", fill: "bg-burgundy text-cream" },
};

function Outcome({ outcome }: { outcome: NonNullable<Flow["outcome"]> }) {
  const { icon: Icon, ring, fill } = OUTCOME[outcome.tone];
  return (
    <motion.div
      className="flex flex-col items-center px-2 pt-2 text-center"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ ...spring, delay: 0.1 }}
    >
      <span className="relative grid size-16 place-items-center">
        {[0, 0.25].map((delay) => (
          <motion.span
            key={delay}
            className={cn("absolute inset-0 rounded-full border-2", ring)}
            initial={{ scale: 1, opacity: 0.7 }}
            animate={{ scale: 2.2, opacity: 0 }}
            transition={{ duration: 1.1, delay: 0.2 + delay, ease: "easeOut" }}
          />
        ))}
        <motion.span
          className={cn("grid size-16 place-items-center rounded-full shadow-soft", fill)}
          initial={{ scale: 0, rotate: -20 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ type: "spring", stiffness: 260, damping: 14, delay: 0.15 }}
        >
          <Icon className="size-7" />
        </motion.span>
      </span>
      <h3 className="mt-5 text-xl font-bold">{outcome.title}</h3>
      <p
        className={cn(
          "mt-1.5 max-w-xs text-sm text-muted-foreground",
          outcome.tone !== "success" && "font-mono text-[12px] break-all",
        )}
      >
        {outcome.detail}
      </p>
    </motion.div>
  );
}

/**
 * Every on-chain action opens this: the stages advance as the backend
 * confirms each transaction, then the outcome lands.
 */
export function TxDialog({
  flow,
  explorerUrl,
  onClose,
}: {
  flow: Flow | null;
  explorerUrl: string | null;
  onClose: () => void;
}) {
  const running = flow !== null && flow.outcome === null;

  return (
    <Dialog.Root open={flow !== null} onOpenChange={(open) => !open && !running && onClose()}>
      <AnimatePresence>
        {flow && (
          <Dialog.Portal forceMount>
            <Dialog.Overlay asChild forceMount>
              <motion.div
                className="fixed inset-0 z-[60] bg-night/70 backdrop-blur-sm"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              />
            </Dialog.Overlay>
            <Dialog.Content
              asChild
              forceMount
              onEscapeKeyDown={(e) => running && e.preventDefault()}
            >
              <motion.div
                className="fixed left-1/2 top-1/2 z-[61] w-[calc(100%-2rem)] max-w-md overflow-hidden rounded-[1.75rem] border border-border-strong bg-background p-6 shadow-lift outline-none sm:p-7"
                initial={{ opacity: 0, scale: 0.92, x: "-50%", y: "-46%" }}
                animate={{ opacity: 1, scale: 1, x: "-50%", y: "-50%" }}
                exit={{ opacity: 0, scale: 0.95, x: "-50%", y: "-48%" }}
                transition={spring}
              >
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute -right-20 -top-20 size-56 animate-drift rounded-full bg-[radial-gradient(closest-side,var(--glow),transparent)] blur-2xl"
                />

                <div className="relative flex items-start justify-between gap-4">
                  <div>
                    <p className="eyebrow">{explorerUrl ? "Stellar testnet" : "Simulado"}</p>
                    <Dialog.Title className="mt-2 text-2xl font-bold">{flow.title}</Dialog.Title>
                    <Dialog.Description className="sr-only">
                      Progreso de las transacciones de esta acción
                    </Dialog.Description>
                  </div>
                  {!running && (
                    <Dialog.Close
                      className="grid size-8 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-foreground/[0.06] hover:text-foreground"
                      aria-label="Cerrar"
                    >
                      <X className="size-4" />
                    </Dialog.Close>
                  )}
                </div>

                <ol className="relative mt-6 space-y-1">
                  {flow.stages.map((stage, i) => (
                    <motion.li
                      key={stage.label}
                      className={cn(
                        "relative flex items-center gap-3 rounded-2xl px-3 py-3 transition-colors",
                        stage.status === "active" && "bg-primary/10",
                      )}
                      initial={{ opacity: 0, x: -12 }}
                      animate={{ opacity: stage.status === "pending" ? 0.55 : 1, x: 0 }}
                      transition={{ delay: 0.08 * i + 0.1 }}
                    >
                      {i < flow.stages.length - 1 && (
                        <span className="absolute left-[25px] top-11 h-[calc(100%-1.5rem)] w-px overflow-hidden bg-border-strong">
                          <motion.span
                            className="absolute inset-x-0 top-0 bg-primary"
                            animate={{ height: stage.status === "done" ? "100%" : "0%" }}
                            transition={{ duration: 0.5 }}
                          />
                        </span>
                      )}
                      <Indicator status={stage.status} />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium">{stage.label}</p>
                        <p className="truncate font-mono text-[11px] text-muted-foreground">
                          {stage.detail}
                        </p>
                      </div>
                      <div className="shrink-0 font-mono text-[11px] text-muted-foreground">
                        {stage.status === "active" && stage.startedAt && (
                          <Elapsed since={stage.startedAt} />
                        )}
                        {stage.status === "done" && stage.txHash && explorerUrl && (
                          <motion.a
                            href={`${explorerUrl}/tx/${stage.txHash}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-primary hover:underline"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                          >
                            {stage.txHash.slice(0, 6)}
                            <ExternalLink className="size-3" />
                          </motion.a>
                        )}
                      </div>
                    </motion.li>
                  ))}
                </ol>

                <AnimatePresence>
                  {flow.outcome && (
                    <motion.div
                      className="relative mt-4 border-t border-border pt-6"
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      transition={spring}
                    >
                      <Outcome outcome={flow.outcome} />
                      <Button className="mt-6 w-full" size="lg" onClick={onClose}>
                        Listo
                      </Button>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            </Dialog.Content>
          </Dialog.Portal>
        )}
      </AnimatePresence>
    </Dialog.Root>
  );
}
