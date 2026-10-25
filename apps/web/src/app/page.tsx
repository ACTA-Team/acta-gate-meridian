"use client";

import Image from "next/image";
import { WifiOff } from "lucide-react";
import { Fragment } from "react";
import { Toaster } from "sonner";

import { ActivityFeed } from "@/components/activity-feed";
import { Header } from "@/components/header";
import { HolderPanel, IssuerPanel, TreasuryPanel } from "@/components/panels";
import { Steps } from "@/components/steps";
import { TxDialog } from "@/components/tx-dialog";
import { useDemo } from "@/hooks/use-demo";

/** Entrance delay for the CSS `.enter` animation. */
const delay = (ms: number) => ({ "--d": `${ms}ms` }) as React.CSSProperties;

/** Headline that rises in word by word, like the hero on acta.build. */
function Headline({ lead, accent }: { lead: string; accent: string }) {
  const words = [
    ...lead.split(" ").map((w) => ({ w, accent: false })),
    ...accent.split(" ").map((w) => ({ w, accent: true })),
  ];
  return (
    <h1 className="text-balance mt-5 text-[2.2rem] font-bold leading-[1.05] sm:text-[3.2rem]">
      {words.map(({ w, accent }, i) => (
        <Fragment key={i}>
          <span
            className={`enter inline-block [--enter-blur:8px] [--enter-y:0.45em] ${accent ? "text-primary" : ""}`}
            style={delay(100 + i * 70)}
          >
            {w}
          </span>{" "}
        </Fragment>
      ))}
    </h1>
  );
}

export default function Home() {
  const demo = useDemo();
  const { config } = demo;

  return (
    <>
      <Header mode={config?.mode ?? null} />

      <main className="relative isolate overflow-hidden">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-40 -top-40 -z-10 size-176 animate-drift rounded-full bg-[radial-gradient(closest-side,var(--glow),transparent)] blur-3xl"
        />
        <div
          aria-hidden="true"
          className="bg-rules pointer-events-none absolute inset-0 -z-10 mask-[radial-gradient(ellipse_at_top,black,transparent_60%)]"
        />

        <div className="mx-auto max-w-7xl px-5 pb-20 pt-28 sm:px-8 sm:pt-32">
          <section className="max-w-3xl">
            <p className="eyebrow enter">HackMeridian 2026 · Track Scale</p>
            <Headline lead="Que cualquier contrato pueda exigir una credencial" accent="válida." />
            <p
              className="enter mt-5 max-w-2xl text-[15px] leading-relaxed text-muted-foreground sm:text-lg"
              style={delay(700)}
            >
              La tesorería de {config?.issuer.name ?? "GrantFox"} solo le paga a quien tiene una
              credencial{" "}
              <span className="font-mono text-foreground">
                {config?.credentialType ?? "ContributorBadge"}
              </span>{" "}
              {config?.requiredTier ?? "Gold"} vigente. Nadie mantiene una allowlist: la revocación
              llega sola a un contrato ajeno.
            </p>
          </section>

          {config?.mode === "mock" && (
            <p
              className="enter mt-8 rounded-xl border border-border-strong bg-surface-sunken px-4 py-3 text-[13px] text-muted-foreground"
              style={delay(350)}
            >
              <span className="font-mono text-foreground">Modo simulado.</span> El backend corre en
              memoria las mismas reglas que vc-vault, vc-gate y credential-policy. Con{" "}
              <span className="font-mono">GATE_MODE=testnet</span> llama a los contratos
              desplegados.
            </p>
          )}

          {demo.offline && (
            <div className="enter mt-6 flex items-center gap-3 rounded-xl border border-cherry/40 bg-cherry/10 px-4 py-3 text-sm">
              <WifiOff className="size-4 shrink-0 text-cherry" />
              <p>{demo.offline}</p>
            </div>
          )}

          <section className="mt-10">
            <Steps holder={demo.holder} activity={demo.activity} />
          </section>

          <section className="mt-6 grid gap-5 lg:grid-cols-3">
            <HolderPanel demo={demo} />
            <IssuerPanel demo={demo} />
            <TreasuryPanel demo={demo} />
          </section>

          <section className="mt-14">
            <p className="eyebrow flex items-center gap-3">
              <span className="relative flex size-1.5" aria-hidden="true">
                <span className="absolute inset-0 animate-ping-soft rounded-full bg-cherry/70" />
                <span className="relative size-1.5 rounded-full bg-cherry" />
              </span>
              Actividad on-chain
            </p>
            <div className="mt-4">
              <ActivityFeed events={demo.activity} explorerUrl={config?.explorerUrl ?? null} />
            </div>
          </section>
        </div>
      </main>

      <TxDialog
        flow={demo.flow}
        explorerUrl={config?.explorerUrl ?? null}
        onClose={demo.closeFlow}
      />
      <Toaster
        position="bottom-right"
        toastOptions={{
          classNames: {
            toast:
              "!rounded-2xl !border !border-border-strong !bg-background !text-foreground !shadow-lift !font-sans",
            description: "!text-muted-foreground !font-mono !text-[11px]",
          },
        }}
      />

      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-5 py-6 font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground sm:px-8">
          <span>ACTA Gate · vc-vault · vc-gate · credential-policy</span>
          <span className="flex items-center gap-2">
            Built on
            <Image
              src="/stellar.png"
              alt="Stellar"
              width={90}
              height={20}
              className="h-4 w-auto opacity-80 invert dark:invert-0"
            />
          </span>
        </div>
      </footer>
    </>
  );
}
