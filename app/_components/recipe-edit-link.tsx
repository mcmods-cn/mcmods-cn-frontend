"use client";

import Link from "next/link";
import type { ReactNode } from "react";

export function RecipeEditLink({
  children,
  className,
  href,
}: {
  children: ReactNode;
  className: string;
  href: string;
}) {
  return <Link
    className={className}
    href={recipeEditorTabHref(href)}
    rel="noopener noreferrer"
    target="_blank"
  >
    {children}
  </Link>;
}

export function recipeEditorTabHref(href: string) {
  if (!href || /(?:^|[?&])closeOnComplete=1(?:&|$)/.test(href)) return href;
  return `${href}${href.includes("?") ? "&" : "?"}closeOnComplete=1`;
}
