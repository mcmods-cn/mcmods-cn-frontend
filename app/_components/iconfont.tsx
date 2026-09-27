"use client";

import { useEffect, useSyncExternalStore } from "react";
import { normalizeIconfontIntegrity, normalizeIconfontURL } from "../_lib/iconfont-url.mts";

const iconfontEvent = "mcmods-iconfont-change";

export function IconfontLoader({ symbolUrl, integrity }: { symbolUrl?: string; integrity?: string }) {
  useEffect(() => {
    const url = normalizeIconfontURL(symbolUrl);
    const sri = normalizeIconfontIntegrity(integrity);
    const identity = `${url}#${sri}`;
    if (!url || !sri || Array.from(document.scripts).some((item) => item.dataset.mcmodsIconfont === identity)) return;
    const script = document.createElement("script");
    script.src = url;
    script.async = true;
    script.integrity = sri;
    script.crossOrigin = "anonymous";
    script.referrerPolicy = "no-referrer";
    script.dataset.mcmodsIconfont = identity;
    script.addEventListener("load", notifyIconfontChange);
    script.addEventListener("error", notifyIconfontChange);
    document.head.appendChild(script);
    return () => {
      script.removeEventListener("load", notifyIconfontChange);
      script.removeEventListener("error", notifyIconfontChange);
    };
  }, [integrity, symbolUrl]);
  return null;
}

export function IconFont({ name, label, fallback, className = "" }: { name: string; label?: string; fallback?: React.ReactNode; className?: string }) {
  const symbolID = name.startsWith("icon-") ? name : `icon-${name}`;
  const available = useSyncExternalStore(subscribeIconfont, () => Boolean(document.getElementById(symbolID)), () => false);
  if (!available) return fallback ? <span className={className} aria-label={label}>{fallback}</span> : null;
  return (
    <svg className={`iconfont-symbol ${className}`} aria-hidden={label ? undefined : true} aria-label={label} role={label ? "img" : undefined}>
      <use href={`#${symbolID}`} />
    </svg>
  );
}

function subscribeIconfont(onStoreChange: () => void) {
  window.addEventListener(iconfontEvent, onStoreChange);
  return () => window.removeEventListener(iconfontEvent, onStoreChange);
}

function notifyIconfontChange() {
  window.dispatchEvent(new Event(iconfontEvent));
}
