import Image from "next/image";

import { cn } from "@/lib/utils";

/**
 * The ACTA "A" mark. There is a cream file and a navy one; both are
 * rendered and CSS shows the one the theme can read, so the right mark is
 * there on first paint. `onDark` pins the cream one for grounds that stay
 * dark in both themes.
 */
export function LogoIcon({
  size = 24,
  className,
  priority = false,
  onDark = false,
}: {
  size?: number;
  className?: string;
  priority?: boolean;
  onDark?: boolean;
}) {
  const shared = "size-full object-contain";
  return (
    <span
      className={cn("relative inline-flex shrink-0", className)}
      style={{ width: size, height: size }}
    >
      <Image
        src="/Iso-dark.png"
        alt=""
        width={size}
        height={size}
        priority={priority}
        className={cn(shared, onDark ? "hidden" : "dark:hidden")}
      />
      <Image
        src="/Iso-light.png"
        alt=""
        width={size}
        height={size}
        priority={priority}
        className={cn(shared, onDark ? "block" : "hidden dark:block")}
      />
    </span>
  );
}

/** Mark plus wordmark. */
export function Logo({
  size = 22,
  className,
  priority = false,
}: {
  size?: number;
  className?: string;
  priority?: boolean;
}) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <LogoIcon size={size} priority={priority} />
      <span className="text-[17px] font-semibold tracking-[0.04em] text-foreground">ACTA</span>
    </span>
  );
}
