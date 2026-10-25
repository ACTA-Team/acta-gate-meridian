import type { ChainMode } from "@acta-gate/shared";

import { Logo } from "@/components/logo";
import { AnimatedThemeToggler } from "@/components/ui/animated-theme-toggler";
import { Badge } from "@/components/ui/badge";

export function Header({ mode }: { mode: ChainMode | null }) {
  return (
    <header className="fixed inset-x-0 top-0 z-50 w-full border-b border-border bg-background/85 backdrop-blur-md">
      <nav className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between px-5 sm:px-8">
        <div className="flex items-center gap-3">
          <Logo priority />
          <span className="h-5 w-px bg-border-strong" aria-hidden="true" />
          <span className="font-mono text-[13px] uppercase tracking-[0.18em] text-foreground/80">
            Gate
          </span>
        </div>

        <div className="flex items-center gap-3">
          {mode && (
            <Badge variant={mode === "testnet" ? "accent" : "outline"}>
              <span
                className={
                  mode === "testnet"
                    ? "size-1.5 rounded-full bg-primary"
                    : "size-1.5 rounded-full bg-lavender"
                }
              />
              {mode === "testnet" ? "Testnet" : "Simulado"}
            </Badge>
          )}
          <AnimatedThemeToggler
            duration={550}
            aria-label="Cambiar tema"
            className="grid size-9 place-items-center rounded-full border border-border-strong text-foreground/80 transition-colors hover:border-primary/60 hover:text-foreground [&_svg]:size-4"
          />
        </div>
      </nav>
    </header>
  );
}
