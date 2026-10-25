"use client";

import type { ActivityEvent, ActivityKind } from "@acta-gate/shared";
import {
  Ban,
  ExternalLink,
  FileCheck2,
  Link2,
  type LucideIcon,
  Send,
  ShieldX,
  Vault,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";

import { cn } from "@/lib/utils";

const ICONS: Record<ActivityKind, { icon: LucideIcon; alert?: boolean }> = {
  vault_deployed: { icon: Vault },
  credential_issued: { icon: FileCheck2 },
  gate_registered: { icon: Link2 },
  credential_revoked: { icon: Ban, alert: true },
  payment_sent: { icon: Send },
  payment_rejected: { icon: ShieldX, alert: true },
};

export function ActivityFeed({
  events,
  explorerUrl,
}: {
  events: ActivityEvent[];
  explorerUrl: string | null;
}) {
  if (events.length === 0) {
    return (
      <p className="rounded-2xl border border-dashed border-border-strong p-8 text-center text-sm text-muted-foreground">
        Todavía no hay actividad. Empieza creando la wallet de Marta.
      </p>
    );
  }

  return (
    <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface">
      <AnimatePresence initial={false}>
        {events.map((e) => {
          const { icon: Icon, alert } = ICONS[e.kind];
          return (
            <motion.li
              key={e.id}
              layout
              className="flex items-center gap-4 px-5 py-3.5 transition-colors hover:bg-foreground/[0.03]"
              initial={{ opacity: 0, x: -24, backgroundColor: "rgb(69 93 253 / 0.18)" }}
              animate={{ opacity: 1, x: 0, backgroundColor: "rgb(69 93 253 / 0)" }}
              transition={{
                type: "spring",
                stiffness: 200,
                damping: 24,
                backgroundColor: { duration: 1.6 },
              }}
            >
              <motion.span
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: "spring", stiffness: 400, damping: 16, delay: 0.1 }}
                className={cn(
                  "grid size-8 shrink-0 place-items-center rounded-full",
                  alert ? "bg-cherry/15 text-cherry" : "bg-primary/15 text-primary",
                )}
              >
                <Icon className="size-4" />
              </motion.span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{e.title}</p>
                <p className="truncate font-mono text-[11px] text-muted-foreground">{e.detail}</p>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1 font-mono text-[10px] text-muted-foreground">
                <time dateTime={e.at}>{new Date(e.at).toLocaleTimeString()}</time>
                {e.txHash && explorerUrl ? (
                  <a
                    href={`${explorerUrl}/tx/${e.txHash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-primary hover:underline"
                  >
                    {e.txHash.slice(0, 8)}
                    <ExternalLink className="size-3" />
                  </a>
                ) : (
                  <span className="uppercase tracking-[0.12em]">sim</span>
                )}
              </div>
            </motion.li>
          );
        })}
      </AnimatePresence>
    </ul>
  );
}
