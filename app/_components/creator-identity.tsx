"use client";
/* eslint-disable @next/next/no-img-element */

import Link from "next/link";
import type { BackendCreatorIdentity } from "../_lib/mod-api";
import { useI18n } from "../_lib/i18n-provider";

export function CreatorIdentityAvatar({ creator, size = "normal" }: { creator: Pick<BackendCreatorIdentity, "avatarUrl" | "name">; size?: "small" | "normal" }) {
  const sizeClass = size === "small" ? "h-9 w-9 text-sm" : "h-12 w-12 text-base";
  return <span className={`grid shrink-0 place-items-center overflow-hidden rounded-lg bg-[var(--accent-soft)] font-black text-[var(--accent)] ${sizeClass}`}>
    {creator.avatarUrl ? <img alt="" className="h-full w-full object-cover" src={creator.avatarUrl} /> : creator.name.trim().slice(0, 1).toUpperCase()}
  </span>;
}

export function CreatorTeamMemberGroup({ members, linkMembers = true }: { members: readonly BackendCreatorIdentity[]; linkMembers?: boolean }) {
  const { t } = useI18n();
  if (!members.length) return null;
  return <section className="rounded-lg border border-[var(--line)] bg-[var(--panel)] p-3">
    <h4 className="text-xs font-black text-[var(--muted)]">{t("creators.teamMembers")}</h4>
    <div className="mt-2 grid gap-2 sm:grid-cols-2">
      {members.map((member, index) => {
        const content = <>
          <CreatorIdentityAvatar creator={member} size="small" />
          <span className="min-w-0">
            <span className="block truncate text-sm font-black">{member.name}</span>
            <span className="block truncate text-xs text-[var(--muted)]">{[member.title, member.role].filter(Boolean).join(" · ") || t("creators.noRole")}</span>
          </span>
        </>;
        return member.creatorId && linkMembers
          ? <Link className="focus-ring flex min-w-0 items-center gap-2 rounded-md bg-[var(--panel-subtle)] p-2 hover:text-[var(--accent)]" href={`/authors/${member.creatorId}`} key={member.creatorId}>{content}</Link>
          : <div className="flex min-w-0 items-center gap-2 rounded-md bg-[var(--panel-subtle)] p-2" key={`${member.name}:${index}`}>{content}</div>;
      })}
    </div>
  </section>;
}
