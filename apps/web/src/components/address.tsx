"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { useI18n } from "@/i18n/provider";
import { cn } from "@/lib/utils";

export const shortAddress = (a: string) => `${a.slice(0, 6)}…${a.slice(-6)}`;

/** A Stellar address in mono, shortened, with a copy button. */
export function Address({
  value,
  label,
  className,
}: {
  value: string;
  label?: string;
  className?: string;
}) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await navigator.clipboard.writeText(value);
    toast(t.common.copied, { description: shortAddress(value) });
    setCopied(true);
    setTimeout(() => setCopied(false), 1400);
  };

  return (
    <div className={cn("flex items-center justify-between gap-3", className)}>
      {label && <span className="eyebrow">{label}</span>}
      <button
        type="button"
        onClick={copy}
        title={value}
        className="group inline-flex items-center gap-2 font-mono text-[12px] text-foreground/85 transition-colors hover:text-foreground"
      >
        {shortAddress(value)}
        {copied ? (
          <Check className="size-3.5 text-primary" />
        ) : (
          <Copy className="size-3.5 opacity-40 transition-opacity group-hover:opacity-100" />
        )}
      </button>
    </div>
  );
}
