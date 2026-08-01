"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

type TooltipPosition = {
  left: number;
  top: number;
  above: boolean;
};

export function FloatingTooltip({
  children,
  content,
  className = "",
}: {
  children: React.ReactNode;
  content: React.ReactNode;
  className?: string;
}) {
  const anchorRef = useRef<HTMLSpanElement>(null);
  const [position, setPosition] = useState<TooltipPosition | null>(null);

  function openTooltip() {
    const anchor = anchorRef.current;
    if (!anchor) return;
    const bounds = anchor.getBoundingClientRect();
    const halfWidth = 104;
    const below = bounds.bottom + 54 <= window.innerHeight;
    setPosition({
      left: Math.max(halfWidth + 8, Math.min(bounds.left + bounds.width / 2, window.innerWidth - halfWidth - 8)),
      top: below ? bounds.bottom + 4 : bounds.top - 4,
      above: !below,
    });
  }

  useEffect(() => {
    if (!position) return;
    const closeTooltip = () => setPosition(null);
    window.addEventListener("resize", closeTooltip);
    window.addEventListener("scroll", closeTooltip, true);
    return () => {
      window.removeEventListener("resize", closeTooltip);
      window.removeEventListener("scroll", closeTooltip, true);
    };
  }, [position]);

  return (
    <span ref={anchorRef} className={`block h-full w-full ${className}`} onMouseEnter={openTooltip} onMouseLeave={() => setPosition(null)}>
      {children}
      {position ? createPortal(
        <span
          className={`pointer-events-none fixed z-[110] min-w-28 max-w-52 -translate-x-1/2 whitespace-nowrap rounded border border-white/15 bg-[#171717]/95 px-2 py-1 text-left text-white shadow-xl ${position.above ? "-translate-y-full" : ""}`}
          role="tooltip"
          style={{ left: position.left, top: position.top }}
        >
          {content}
        </span>,
        document.body,
      ) : null}
    </span>
  );
}
