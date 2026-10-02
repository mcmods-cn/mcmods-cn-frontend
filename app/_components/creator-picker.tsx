"use client";

import { apiErrorMessage } from "../_lib/api-error.mts";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { apiRequest } from "../_lib/api";
import { useAuthSnapshot } from "../_lib/auth";
import { CreatorDetail, CreatorKind, CreatorRole, CreatorSummary } from "../_lib/community-api";
import { loadCreatorPage, mergeCreatorPageItems } from "../_lib/creator-pagination.mts";
import { useI18n } from "../_lib/i18n-provider";
import type { BackendModAuthor } from "../_lib/mod-api";
import { CreatorIdentityAvatar, CreatorTeamMemberGroup } from "./creator-identity";

const allCreatorKinds: CreatorKind[] = ["author", "team"];
const noInitialRoles: CreatorRole[] = [];

export function CreatorPicker({
  value,
  onChange,
  allowedKinds = allCreatorKinds,
  allowTitle = false,
  initialRoles = noInitialRoles,
}: {
  value: BackendModAuthor[];
  onChange: (authors: BackendModAuthor[]) => void;
  allowedKinds?: CreatorKind[];
  allowTitle?: boolean;
  initialRoles?: CreatorRole[];
}) {
  const { t } = useI18n();
  const { token } = useAuthSnapshot();
  const [open, setOpen] = useState(false);
  const [loadedRoles, setLoadedRoles] = useState<CreatorRole[]>([]);
  const roles = initialRoles.length ? initialRoles : loadedRoles;

  useEffect(() => {
    let cancelled = false;
    if (initialRoles.length) return;
    apiRequest<{ items: CreatorRole[] }>("/api/v1/creator-roles")
      .then((result) => {
        if (!cancelled) setLoadedRoles(result.items);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [initialRoles]);

  function update(index: number, next: BackendModAuthor) {
    onChange(value.map((item, itemIndex) => itemIndex === index ? next : item));
  }

  return (
    <div className="@container grid min-w-0 gap-3">
      {value.length ? (
        <div className="grid gap-2">
          {value.map((author, index) => (
            <div className="rounded-lg border border-[var(--line)] bg-[var(--panel-subtle)] p-3" key={`${author.creatorId || author.name}:${index}`}>
              <div className={`grid min-w-0 gap-3 ${allowTitle ? "@min-[760px]:grid-cols-[minmax(180px,1fr)_200px_minmax(180px,1fr)_auto]" : "@min-[620px]:grid-cols-[minmax(180px,1fr)_240px_auto]"}`}>
                <div className="flex min-w-0 items-center gap-3">
                <CreatorIdentityAvatar creator={{ avatarUrl: author.avatarUrl || "", name: author.name }} />
                <div className="min-w-0">
                  <p className="truncate font-black">{author.name}</p>
                  <p className="truncate font-mono text-xs text-[var(--muted)]">
                    {author.creatorId || t("creators.pendingEntity")} · {t(`creators.kinds.${author.kind || "author"}`)}
                  </p>
                </div>
                </div>
              <select
                className="field min-w-0"
                value={author.roleId ?? ""}
                onChange={(event) => {
                  const roleId = event.target.value || undefined;
                  const role = roles.find((item) => item.id === roleId);
                  update(index, { ...author, roleId, role: role?.name || "" });
                }}
              >
                <option value="">{t("creators.noRole")}</option>
                {roles.map((role) => <option key={role.id} value={role.id}>{role.name}</option>)}
              </select>
              {allowTitle ? (
                <input className="field min-w-0" placeholder={t("creators.memberTitle")} value={author.title ?? ""} onChange={(event) => update(index, { ...author, title: event.target.value })} />
              ) : null}
              <button className="button-secondary focus-ring" type="button" onClick={() => onChange(value.filter((_, itemIndex) => itemIndex !== index))}>
                {t("common.delete")}
              </button>
              </div>
              {author.kind === "team" && author.members?.length ? <div className="mt-3 border-t border-[var(--line)] pt-3"><CreatorTeamMemberGroup linkMembers={false} members={author.members} /></div> : null}
            </div>
          ))}
        </div>
      ) : (
        <p className="rounded-lg border border-dashed border-[var(--line)] p-5 text-center text-sm font-semibold text-[var(--muted)]">
          {t("creators.pickerEmpty")}
        </p>
      )}
      <button className="button-secondary focus-ring justify-self-start" type="button" onClick={() => setOpen(true)}>
        + {t("mods.submission.actions.addAuthor")}
      </button>
      {open ? (
        <CreatorPickerDialog
          allowedKinds={allowedKinds}
          existing={new Set(value.map((item) => item.creatorId).filter(Boolean))}
          onClose={() => setOpen(false)}
          onInsert={async (creators) => {
            const additions = await Promise.all(creators.map(async (creator): Promise<BackendModAuthor> => {
              const detail = creator.kind === "team"
                ? await apiRequest<CreatorDetail>(`/api/v1/creators/${encodeURIComponent(creator.publicId)}`, {}, token || undefined)
                : null;
              return {
              creatorId: creator.publicId,
              kind: creator.kind,
              name: creator.name,
              avatarUrl: creator.avatarUrl,
              role: "",
              members: detail?.members.map((member) => ({
                creatorId: member.creatorId,
                kind: "author",
                name: member.name,
                avatarUrl: member.avatarUrl,
                roleId: member.role.id,
                role: member.role.name,
                title: member.title,
              })),
            };
            }));
            onChange([...value, ...additions]);
            setOpen(false);
          }}
        />
      ) : null}
    </div>
  );
}

function CreatorPickerDialog({
  allowedKinds,
  existing,
  onClose,
  onInsert,
}: {
  allowedKinds: CreatorKind[];
  existing: Set<string | undefined>;
  onClose: () => void;
  onInsert: (creators: CreatorSummary[]) => Promise<void>;
}) {
  const { t } = useI18n();
  const { token } = useAuthSnapshot();
  const [kind, setKind] = useState<"" | CreatorKind>(allowedKinds.length === 1 ? allowedKinds[0] : "");
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<CreatorSummary[]>([]);
  const [nextCursor, setNextCursor] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [message, setMessage] = useState("");
  const [selected, setSelected] = useState<CreatorSummary[]>([]);
  const [refreshKey, setRefreshKey] = useState(0);
  const [inserting, setInserting] = useState(false);
  const requestGeneration = useRef(0);

  useEffect(() => {
    const generation = ++requestGeneration.current;
    let cancelled = false;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setLoading(true);
      setLoadingMore(false);
      loadCreatorPage<CreatorSummary>(
        (path, signal) => apiRequest(path, { signal }, token || undefined),
        { limit: 40, kind, query, sort: "name", order: "asc" },
        "",
        controller.signal,
      )
        .then((result) => {
          if (!cancelled && requestGeneration.current === generation) {
            setItems(result.items.filter((item) => allowedKinds.includes(item.kind)));
            setNextCursor(result.nextCursor);
            setMessage("");
          }
        })
        .catch((error) => {
          if (!cancelled) setMessage(apiErrorMessage(error, t, t("creators.loadFailed")));
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, 180);
    return () => {
      cancelled = true;
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [allowedKinds, kind, query, refreshKey, t, token]);

  async function loadMore() {
    const cursor = nextCursor;
    if (!cursor || loadingMore) return;
    const generation = requestGeneration.current;
    setLoadingMore(true);
    setMessage("");
    try {
      const result = await loadCreatorPage<CreatorSummary>(
        (path, signal) => apiRequest(path, { signal }, token || undefined),
        { limit: 40, kind, query, sort: "name", order: "asc" },
        cursor,
      );
      if (requestGeneration.current !== generation) return;
      setItems((current) => mergeCreatorPageItems(
        current,
        result.items.filter((item) => allowedKinds.includes(item.kind)),
      ));
      setNextCursor(result.nextCursor);
    } catch (error) {
      if (requestGeneration.current === generation) {
        setMessage(apiErrorMessage(error, t, t("creators.loadFailed")));
      }
    } finally {
      if (requestGeneration.current === generation) setLoadingMore(false);
    }
  }

  const selectedIDs = useMemo(() => new Set(selected.map((item) => item.publicId)), [selected]);
  const available = useMemo(() => items.filter((item) => !existing.has(item.publicId)), [existing, items]);

  return (
    <div className="fixed inset-0 z-[90] grid place-items-center bg-black/50 p-4" role="presentation" onMouseDown={onClose}>
      <section className="surface flex max-h-[88vh] w-full max-w-3xl flex-col overflow-hidden rounded-lg" role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}>
        <header className="flex items-center justify-between gap-3 border-b border-[var(--line)] p-4">
          <div>
            <h2 className="text-xl font-black">{t("creators.selectTitle")}</h2>
            <p className="mt-1 text-sm text-[var(--muted)]">{t("creators.selectDescription")}</p>
          </div>
          <button className="button-secondary focus-ring" type="button" onClick={onClose}>{t("common.close")}</button>
        </header>
        <div className="grid min-h-0 flex-1 gap-4 overflow-y-auto p-4">
          <div className={`grid gap-2 ${allowedKinds.length > 1 ? "sm:grid-cols-[180px_1fr]" : ""}`}>
            {allowedKinds.length > 1 ? <select className="field" value={kind} onChange={(event) => setKind(event.target.value as "" | CreatorKind)}>
              <option value="">{t("creators.allKinds")}</option>
              {allowedKinds.map((item) => <option key={item} value={item}>{t(`creators.kinds.${item}`)}</option>)}
            </select> : null}
            <input className="field" value={query} placeholder={t("creators.searchPlaceholder")} onChange={(event) => setQuery(event.target.value)} />
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {available.map((creator) => (
              <button className={`focus-ring flex min-w-0 items-center gap-3 rounded-lg border p-3 text-left ${selectedIDs.has(creator.publicId) ? "border-[var(--accent)] bg-[var(--accent-soft)]" : "border-[var(--line)] hover:border-[var(--accent)]"}`} key={creator.publicId} type="button" onClick={() => setSelected((current) => current.some((item) => item.publicId === creator.publicId) ? current.filter((item) => item.publicId !== creator.publicId) : [...current, creator])}>
                <CreatorIdentityAvatar creator={creator} />
                <span className="min-w-0">
                  <span className="block truncate font-black">{creator.name}</span>
                  <span className="block truncate text-xs text-[var(--muted)]">{t(`creators.kinds.${creator.kind}`)} · {creator.publicId}</span>
                </span>
              </button>
            ))}
          </div>
          {nextCursor ? <button className="button-secondary focus-ring w-full" disabled={loadingMore} type="button" onClick={() => void loadMore()}>{loadingMore ? t("common.loading") : t("creators.loadMore")}</button> : null}
          {!loading && available.length === 0 ? <p className="py-5 text-center text-sm text-[var(--muted)]">{t("creators.noResults")}</p> : null}
          {loading ? <p className="py-5 text-center text-sm font-bold text-[var(--muted)]">{t("common.loading")}</p> : null}
          <section className="border-t border-[var(--line)] pt-4">
            <h3 className="font-black">{t("creators.selected", { count: selected.length })}</h3>
            <div className="mt-3 flex min-h-14 gap-2 overflow-x-auto rounded-lg border border-dashed border-[var(--line)] p-2">
              {selected.map((creator) => (
                <button className="focus-ring flex shrink-0 items-center gap-2 rounded-md bg-[var(--panel-subtle)] px-2 py-1 text-sm font-bold" key={creator.publicId} type="button" onClick={() => setSelected((current) => current.filter((item) => item.publicId !== creator.publicId))}>
                  <CreatorIdentityAvatar creator={creator} />
                  <span>{creator.name}</span>
                  <span aria-hidden="true">×</span>
                </button>
              ))}
              {!selected.length ? <span className="self-center px-2 text-sm text-[var(--muted)]">{t("creators.noneSelected")}</span> : null}
            </div>
          </section>
          {token ? (
            <section className="border-t border-[var(--line)] pt-4">
              <h3 className="font-black">{t("creators.quickCreate")}</h3>
              <p className="mt-1 text-sm text-[var(--muted)]">{t("creators.quickCreateDescription")}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Link className="button-primary focus-ring" href={allowedKinds.length === 1 && allowedKinds[0] === "team" ? "/teams/new" : "/authors/new"} rel="noopener noreferrer" target="_blank">
                  {t("creators.openCreatePage")}
                </Link>
                <button className="button-secondary focus-ring" type="button" onClick={() => setRefreshKey((current) => current + 1)}>{t("common.refresh")}</button>
              </div>
            </section>
          ) : null}
          {message ? <p className="rounded-lg border border-[var(--red)] p-3 text-sm font-bold text-[var(--red)]">{message}</p> : null}
        </div>
        <footer className="flex justify-end gap-2 border-t border-[var(--line)] p-4">
          <button className="button-secondary focus-ring" type="button" onClick={onClose}>{t("common.cancel")}</button>
          <button className="button-primary focus-ring" disabled={!selected.length || inserting} type="button" onClick={() => {
            setInserting(true);
            setMessage("");
            void onInsert(selected).catch((error) => setMessage(apiErrorMessage(error, t, t("creators.loadFailed")))).finally(() => setInserting(false));
          }}>{inserting ? t("common.loading") : t("creators.insertSelected")}</button>
        </footer>
      </section>
    </div>
  );
}
