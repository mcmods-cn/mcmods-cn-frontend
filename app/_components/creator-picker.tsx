"use client";

import { useEffect, useMemo, useState } from "react";
import { apiRequest } from "../_lib/api";
import { useAuthSnapshot } from "../_lib/auth";
import { CreatorKind, CreatorRole, CreatorSummary } from "../_lib/community-api";
import { useI18n } from "../_lib/i18n-provider";
import type { BackendModAuthor } from "../_lib/mod-api";

export function CreatorPicker({
  value,
  onChange,
}: {
  value: BackendModAuthor[];
  onChange: (authors: BackendModAuthor[]) => void;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [roles, setRoles] = useState<CreatorRole[]>([]);

  useEffect(() => {
    let cancelled = false;
    apiRequest<{ items: CreatorRole[] }>("/api/v1/creator-roles")
      .then((result) => {
        if (!cancelled) setRoles(result.items);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  function update(index: number, next: BackendModAuthor) {
    onChange(value.map((item, itemIndex) => itemIndex === index ? next : item));
  }

  return (
    <div className="grid gap-3">
      {value.length ? (
        <div className="grid gap-2">
          {value.map((author, index) => (
            <div className="grid gap-3 rounded-lg border border-[var(--line)] bg-[var(--panel-subtle)] p-3 sm:grid-cols-[minmax(0,1fr)_240px_auto]" key={`${author.creatorId || author.name}:${index}`}>
              <div className="flex min-w-0 items-center gap-3">
                <CreatorAvatar creator={{ avatarUrl: author.avatarUrl || "", name: author.name }} />
                <div className="min-w-0">
                  <p className="truncate font-black">{author.name}</p>
                  <p className="truncate font-mono text-xs text-[var(--muted)]">
                    {author.creatorId || t("creators.pendingEntity")} · {t(`creators.kinds.${author.kind || "author"}`)}
                  </p>
                </div>
              </div>
              <select
                className="field"
                value={author.roleId ?? ""}
                onChange={(event) => {
                  const roleId = Number(event.target.value) || undefined;
                  const role = roles.find((item) => item.id === roleId);
                  update(index, { ...author, roleId, role: role?.name || "" });
                }}
              >
                <option value="">{t("creators.noRole")}</option>
                {roles.map((role) => <option key={role.id} value={role.id}>{role.name}</option>)}
              </select>
              <button className="button-secondary focus-ring" type="button" onClick={() => onChange(value.filter((_, itemIndex) => itemIndex !== index))}>
                {t("common.delete")}
              </button>
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
          existing={new Set(value.map((item) => item.creatorId).filter(Boolean))}
          onClose={() => setOpen(false)}
          onSelect={(creator) => {
            onChange([...value, {
              creatorId: creator.publicId,
              kind: creator.kind,
              name: creator.name,
              avatarUrl: creator.avatarUrl,
              role: "",
            }]);
            setOpen(false);
          }}
        />
      ) : null}
    </div>
  );
}

function CreatorPickerDialog({
  existing,
  onClose,
  onSelect,
}: {
  existing: Set<string | undefined>;
  onClose: () => void;
  onSelect: (creator: CreatorSummary) => void;
}) {
  const { t } = useI18n();
  const { token } = useAuthSnapshot();
  const [kind, setKind] = useState<"" | CreatorKind>("");
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<CreatorSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newKind, setNewKind] = useState<CreatorKind>("author");
  const [newName, setNewName] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(() => {
      setLoading(true);
      const params = new URLSearchParams({ limit: "60" });
      if (kind) params.set("kind", kind);
      if (query.trim()) params.set("query", query.trim());
      apiRequest<{ items: CreatorSummary[] }>(`/api/v1/creators?${params}`, {}, token || undefined)
        .then((result) => {
          if (!cancelled) setItems(result.items);
        })
        .catch((error) => {
          if (!cancelled) setMessage(error instanceof Error ? error.message : t("creators.loadFailed"));
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, 180);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [kind, query, t, token]);

  const available = useMemo(() => items.filter((item) => !existing.has(item.publicId)), [existing, items]);

  async function createAndSelect() {
    if (!token || !newName.trim()) return;
    setCreating(true);
    setMessage("");
    try {
      const result = await apiRequest<{ publicId: string; reviewStatus: CreatorSummary["reviewStatus"] }>(
        "/api/v1/creators",
        {
          method: "POST",
          body: JSON.stringify({
            kind: newKind,
            name: newName.trim(),
            descriptionMarkdown: "",
            avatarUrl: "",
            links: [],
            collaboratorIds: [],
            members: [],
          }),
        },
        token,
      );
      onSelect({
        publicId: result.publicId,
        kind: newKind,
        name: newName.trim(),
        avatarUrl: "",
        reviewStatus: result.reviewStatus,
        workCount: 0,
        claimed: false,
      });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t("creators.createFailed"));
    } finally {
      setCreating(false);
    }
  }

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
          <div className="grid gap-2 sm:grid-cols-[180px_1fr]">
            <select className="field" value={kind} onChange={(event) => setKind(event.target.value as "" | CreatorKind)}>
              <option value="">{t("creators.allKinds")}</option>
              <option value="author">{t("creators.kinds.author")}</option>
              <option value="team">{t("creators.kinds.team")}</option>
            </select>
            <input className="field" value={query} placeholder={t("creators.searchPlaceholder")} onChange={(event) => setQuery(event.target.value)} />
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {available.map((creator) => (
              <button className="focus-ring flex min-w-0 items-center gap-3 rounded-lg border border-[var(--line)] p-3 text-left hover:border-[var(--accent)]" key={creator.publicId} type="button" onClick={() => onSelect(creator)}>
                <CreatorAvatar creator={creator} />
                <span className="min-w-0">
                  <span className="block truncate font-black">{creator.name}</span>
                  <span className="block truncate text-xs text-[var(--muted)]">{t(`creators.kinds.${creator.kind}`)} · {creator.publicId}</span>
                </span>
              </button>
            ))}
          </div>
          {!loading && available.length === 0 ? <p className="py-5 text-center text-sm text-[var(--muted)]">{t("creators.noResults")}</p> : null}
          {loading ? <p className="py-5 text-center text-sm font-bold text-[var(--muted)]">{t("common.loading")}</p> : null}
          {token ? (
            <section className="border-t border-[var(--line)] pt-4">
              <h3 className="font-black">{t("creators.quickCreate")}</h3>
              <p className="mt-1 text-sm text-[var(--muted)]">{t("creators.quickCreateDescription")}</p>
              <div className="mt-3 grid gap-2 sm:grid-cols-[180px_1fr_auto]">
                <select className="field" value={newKind} onChange={(event) => setNewKind(event.target.value as CreatorKind)}>
                  <option value="author">{t("creators.kinds.author")}</option>
                  <option value="team">{t("creators.kinds.team")}</option>
                </select>
                <input className="field" value={newName} placeholder={t("creators.name")} onChange={(event) => setNewName(event.target.value)} />
                <button className="button-primary focus-ring" disabled={creating || !newName.trim()} type="button" onClick={() => void createAndSelect()}>
                  {creating ? t("common.loading") : t("common.create")}
                </button>
              </div>
            </section>
          ) : null}
          {message ? <p className="rounded-lg border border-[var(--red)] p-3 text-sm font-bold text-[var(--red)]">{message}</p> : null}
        </div>
      </section>
    </div>
  );
}

function CreatorAvatar({ creator }: { creator: Pick<CreatorSummary, "avatarUrl" | "name"> }) {
  return (
    <span className="grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-lg bg-[var(--accent-soft)] font-black text-[var(--accent)]">
      {creator.avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img alt="" className="h-full w-full object-cover" src={creator.avatarUrl} />
      ) : creator.name.slice(0, 1).toUpperCase()}
    </span>
  );
}
