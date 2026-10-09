"use client";

import Link from "next/link";
import { useId, type ComponentProps, type ReactNode } from "react";
import { cn } from "@/lib/format";

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("skeleton", className)} />;
}

export function Sparkline({
  data,
  className,
  height = 44,
  up,
}: {
  data: number[];
  className?: string;
  height?: number;
  up?: boolean;
}) {
  const gid = useId();
  if (data.length < 2) {
    return (
      <svg viewBox={`0 0 100 ${height}`} preserveAspectRatio="none" className={className}>
        <line x1="0" x2="100" y1={height * 0.6} y2={height * 0.6} stroke="var(--line-strong)" strokeDasharray="2 3" vectorEffect="non-scaling-stroke" />
      </svg>
    );
  }
  const min = Math.min(...data);
  const max = Math.max(...data);
  const span = max - min || 1;
  const rising = up ?? data[data.length - 1] >= data[0];
  const color = rising ? "var(--up)" : "var(--down)";
  const pts = data.map((v, i) => [(i / (data.length - 1)) * 100, height - 4 - ((v - min) / span) * (height - 8)]);
  const line = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(2)},${y.toFixed(2)}`).join(" ");
  return (
    <svg viewBox={`0 0 100 ${height}`} preserveAspectRatio="none" className={className}>
      <defs>
        <linearGradient id={gid} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.22" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${line} L100,${height} L0,${height} Z`} fill={`url(#${gid})`} />
      <path d={line} fill="none" stroke={color} strokeWidth="1.5" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
    </svg>
  );
}

export function Pill({ children, tone = "neutral", className }: { children: ReactNode; tone?: "neutral" | "up" | "warn" | "down"; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-[4px] border px-2 py-[1px] font-mono text-[10.5px] leading-[16px]",
        tone === "up" && "border-up/30 bg-up/5 text-up",
        tone === "warn" && "border-warn/30 bg-warn/5 text-warn",
        tone === "down" && "border-down/30 bg-down/5 text-down",
        tone === "neutral" && "border-line text-muted",
        className,
      )}
    >
      {children}
    </span>
  );
}

type ButtonProps = ComponentProps<"button"> & { variant?: "primary" | "ghost" | "outline"; size?: "sm" | "md" };

export function Button({ variant = "outline", size = "md", className, ...props }: ButtonProps) {
  return <button {...props} className={cn(buttonClass(variant, size), className)} />;
}

export function ButtonLink({
  variant = "outline",
  size = "md",
  className,
  ...props
}: ComponentProps<typeof Link> & { variant?: ButtonProps["variant"]; size?: ButtonProps["size"] }) {
  return <Link {...props} className={cn(buttonClass(variant, size), className)} />;
}

export function buttonClass(variant: ButtonProps["variant"] = "outline", size: ButtonProps["size"] = "md") {
  return cn(
    "inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-md font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40",
    size === "sm" ? "px-3.5 py-1.5 text-[12px]" : "px-5 py-2.5 text-[13px]",
    variant === "primary" && "bg-white text-black font-semibold hover:bg-neutral-200",
    variant === "outline" && "border border-line bg-surface text-fg hover:border-line-strong hover:bg-surface-2",
    variant === "ghost" && "text-muted hover:bg-surface-2 hover:text-fg",
  );
}

export function Panel({ children, className }: { children: ReactNode; className?: string }) {
  return <section className={cn("rounded-xl border border-line bg-surface", className)}>{children}</section>;
}

export function Mono({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cn("font-mono", className)}>{children}</span>;
}

/** Large sliding radio switch: a white block slides under the selected option. */
export function BigToggle<T extends string>({
  value,
  onChange,
  options,
  label,
  disabled,
  className,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string; sub: string }[];
  label: string;
  disabled?: boolean;
  className?: string;
}) {
  const index = Math.max(0, options.findIndex((o) => o.value === value));
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cn("relative grid border border-line-strong bg-bg p-1", className)}
      style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
    >
      <span
        aria-hidden
        className="absolute inset-y-1 left-1 bg-fg transition-transform duration-300 ease-out"
        style={{ width: `calc((100% - 8px) / ${options.length})`, transform: `translateX(${index * 100}%)` }}
      />
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            disabled={disabled}
            onClick={() => onChange(o.value)}
            className={cn(
              "group relative z-10 min-w-0 cursor-pointer px-4 py-3.5 text-left transition-colors disabled:cursor-default sm:px-5 sm:py-4",
              on ? "text-bg" : "text-muted hover:text-fg",
            )}
          >
            <div className="flex items-center gap-2.5">
              <span
                className={cn(
                  "flex h-4 w-4 shrink-0 items-center justify-center rounded-full border transition-colors",
                  on ? "border-bg" : "border-line-strong group-hover:border-muted",
                )}
              >
                {on && <span className="h-2 w-2 rounded-full bg-bg" />}
              </span>
              <span className="truncate font-serif text-[19px] font-bold leading-none sm:text-[21px]">{o.label}</span>
            </div>
            <div className={cn("mt-1.5 truncate pl-[26px] font-mono text-[11px]", on ? "text-bg/70" : "text-dim")}>{o.sub}</div>
          </button>
        );
      })}
    </div>
  );
}

export function Segmented<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string; icon?: ReactNode }[];
}) {
  return (
    <div className="inline-flex rounded-md border border-line bg-surface p-1">
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "flex cursor-pointer items-center gap-1.5 rounded-[4px] px-3.5 py-1.5 text-[12.5px] font-medium transition-colors",
            value === o.value ? "bg-white text-black" : "text-muted hover:bg-surface-2 hover:text-fg",
          )}
        >
          {o.icon}
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function CopyText({ value, display, className }: { value: string; display?: string; className?: string }) {
  return (
    <button
      onClick={() => void navigator.clipboard?.writeText(value)}
      className={cn("cursor-pointer font-mono transition-colors hover:text-fg", className)}
      title="Copy"
    >
      {display ?? value}
    </button>
  );
}
