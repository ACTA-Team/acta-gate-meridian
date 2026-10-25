"use client";

import { Check, ChevronDown, Languages } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";

import { Logo } from "@/components/logo";
import { AnimatedThemeToggler } from "@/components/ui/animated-theme-toggler";
import { Badge } from "@/components/ui/badge";
import { LOCALE_NAMES, LOCALES } from "@/i18n/messages";
import { useI18n } from "@/i18n/provider";
import { cn } from "@/lib/utils";

/** A pill like the theme button: the current language, and a small menu of the others. */
function LanguageMenu() {
  const { locale, setLocale, t } = useI18n();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent | KeyboardEvent) => {
      if (
        e instanceof KeyboardEvent ? e.key === "Escape" : !root.current?.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);

  return (
    <div ref={root} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`${t.header.language}: ${LOCALE_NAMES[locale]}`}
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "flex h-9 items-center gap-2 rounded-full border border-border-strong pl-3 pr-2.5 text-foreground/80 transition-colors hover:border-primary/60 hover:text-foreground",
          open && "border-primary/60 text-foreground",
        )}
      >
        <motion.span
          key={locale}
          initial={{ rotate: -90, opacity: 0 }}
          animate={{ rotate: 0, opacity: 1 }}
          transition={{ type: "spring", stiffness: 300, damping: 18 }}
        >
          <Languages className="size-4" />
        </motion.span>
        <span className="relative inline-flex h-4 w-5 overflow-hidden font-mono text-[11px] uppercase leading-4 tracking-[0.12em]">
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.span
              key={locale}
              initial={{ y: 14, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: -14, opacity: 0 }}
              transition={{ type: "spring", stiffness: 380, damping: 30 }}
            >
              {locale}
            </motion.span>
          </AnimatePresence>
        </span>
        <motion.span animate={{ rotate: open ? 180 : 0 }} transition={{ duration: 0.25 }}>
          <ChevronDown className="size-3.5 opacity-60" />
        </motion.span>
      </button>

      <AnimatePresence>
        {open && (
          <motion.ul
            role="menu"
            aria-label={t.header.language}
            className="absolute right-0 top-[calc(100%+0.5rem)] w-44 origin-top-right overflow-hidden rounded-2xl border border-border-strong bg-background p-1.5 shadow-lift"
            initial={{ opacity: 0, scale: 0.92, y: -6 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -4 }}
            transition={{ type: "spring", stiffness: 420, damping: 30 }}
          >
            {LOCALES.map((l) => (
              <li key={l} role="none">
                <button
                  type="button"
                  role="menuitemradio"
                  aria-checked={locale === l}
                  lang={l}
                  onClick={() => {
                    setLocale(l);
                    setOpen(false);
                  }}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm transition-colors",
                    locale === l
                      ? "bg-primary/10 text-foreground"
                      : "text-foreground/75 hover:bg-foreground/[0.05] hover:text-foreground",
                  )}
                >
                  <span className="w-5 font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                    {l}
                  </span>
                  <span className="flex-1">{LOCALE_NAMES[l]}</span>
                  {locale === l && <Check className="size-4 text-primary" />}
                </button>
              </li>
            ))}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  );
}

export function Header() {
  const { t } = useI18n();
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
          <Badge variant="accent">
            <span className="size-1.5 rounded-full bg-primary" />
            Testnet
          </Badge>
          <LanguageMenu />
          <AnimatedThemeToggler
            duration={550}
            aria-label={t.header.theme}
            className="grid size-9 place-items-center rounded-full border border-border-strong text-foreground/80 transition-colors hover:border-primary/60 hover:text-foreground [&_svg]:size-4"
          />
        </div>
      </nav>
    </header>
  );
}
