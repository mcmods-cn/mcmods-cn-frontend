"use client";

import { useEffect, useSyncExternalStore } from "react";

const iconfontEvent = "mcmods-iconfont-change";

export function IconfontLoader({ symbolUrl }: { symbolUrl?: string }) {
  useEffect(() => {
    const url = normalizeIconfontURL(symbolUrl);
    if (!url || Array.from(document.scripts).some((item) => item.dataset.mcmodsIconfont === url)) return;
    const script = document.createElement("script");
    script.src = url;
    script.async = true;
    script.dataset.mcmodsIconfont = url;
    script.addEventListener("load", notifyIconfontChange);
    script.addEventListener("error", notifyIconfontChange);
    document.head.appendChild(script);
    return () => {
      script.removeEventListener("load", notifyIconfontChange);
      script.removeEventListener("error", notifyIconfontChange);
    };
  }, [symbolUrl]);
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

function normalizeIconfontURL(value?: string) {
  if (!value) return "";
  const candidate = value.startsWith("//") ? `https:${value}` : value;
  try {
    const url = new URL(candidate);
    if (url.protocol !== "https:" || !url.hostname.endsWith("alicdn.com")) return "";
    return url.toString();
  } catch {
    return "";
  }
}
