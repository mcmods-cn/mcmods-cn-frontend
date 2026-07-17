"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { apiRequest } from "../_lib/api";
import { useAuthSnapshot } from "../_lib/auth";
import {
  CreatorDetail as CreatorDetailRecord,
  CreatorKind,
  CreatorLink,
  CreatorMember,
  CreatorRole,
  CreatorSnapshot,
  CreatorSummary,
  creatorHref,
  translatedRecord,
} from "../_lib/community-api";
import { useI18n } from "../_lib/i18n-provider";
import { uploadUserFileToOSS } from "../_lib/oss-upload";
import { notifySite } from "../_lib/site-notice";
import { MarkdownRenderer } from "./markdown-renderer";
import { ToolsPlayground } from "./tools-playground";

type CreatorDetailProps = {
  kind: CreatorKind;
  publicId: string;
};

export function CreatorDetail({ kind, publicId }: CreatorDetailProps) {
  const { locale, t } = useI18n();
  const { ready, token, user } = useAuthSnapshot();
  const [record, setRecord] = useState<CreatorDetailRecord | null>(null);
  const [roles, setRoles] = useState<CreatorRole[]>([]);
  const [loading, setLoading] = useState(true);
  const [editOpen, setEditOpen] = useState(false);
  const [claimOpen, setClaimOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [detail, roleResult] = await Promise.all([
        apiRequest<CreatorDetailRecord>(`/api/v1/creators/${encodeURIComponent(publicId)}`, {}, token || undefined),
        apiRequest<{ items: CreatorRole[] }>("/api/v1/creator-roles", {}, token || undefined),
      ]);
      if (detail.creator.kind !== kind) throw new Error(t("creators.kindMismatch"));
      setRecord(detail);
      setRoles(roleResult.items);
    } catch (error) {
      setRecord(null);
      notifySite(error instanceof Error ? error.message : t("creators.loadFailed"), t("creators.title"), "danger");
    } finally {
      setLoading(false);
    }
  }, [kind, publicId, t, token]);

  useEffect(() => {
    if (!ready) return;
    const timer = window.setTimeout(() => {
      void load();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [load, ready]);

  if (loading) return <CreatorPageState text={t("common.loading")} />;
  if (!record) return <CreatorPageState text={t("creators.notFound")} />;

  const creator = record.creator;
  return (
    <main className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <section className="border-b border-[var(--line)] bg-[var(--panel)]">
        <div className="mx-auto flex max-w-7xl flex-wrap items-start justify-between gap-5 px-4 py-8">
          <div className="flex min-w-0 items-center gap-5">
            <CreatorAvatar creator={creator} size="large" />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-md bg-[var(--accent-soft)] px-2 py-1 text-xs font-black text-[var(--accent)]">
                  {t(`creators.kinds.${creator.kind}`)}
                </span>
                {creator.claimed ? (
                  <span className="rounded-md border border-[var(--line)] px-2 py-1 text-xs font-black">
                    {t("creators.claimed")}
                  </span>
                ) : null}
                {creator.reviewStatus && creator.reviewStatus !== "approved" ? (
                  <span className="rounded-md border border-[var(--line)] px-2 py-1 text-xs font-black">
                    {t(`creators.reviewStatuses.${creator.reviewStatus}`)}
                  </span>
                ) : null}
              </div>
              <h1 className="mt-3 break-words text-3xl font-black">{creator.name}</h1>
              <p className="mt-2 font-mono text-sm text-[var(--muted)]">{creator.publicId}</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {record.canEdit ? (
              <button className="button-primary focus-ring" type="button" onClick={() => setEditOpen(true)}>
                {t("common.edit")}
              </button>
            ) : null}
            {record.canClaim ? (
              <button className="button-secondary focus-ring" type="button" onClick={() => setClaimOpen(true)}>
                {t("creators.claim")}
              </button>
            ) : null}
            {!user && !record.claimedUser ? (
              <Link className="button-secondary focus-ring" href={`/login?next=${encodeURIComponent(creatorHref(creator))}`}>
                {t("common.login")}
              </Link>
            ) : null}
          </div>
        </div>
      </section>

      <div className="mx-auto grid max-w-7xl gap-6 px-4 py-7 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-7">
          <DetailSection title={t("creators.introduction")}>
            <MarkdownRenderer emptyText={t("creators.noIntroduction")} markdown={record.descriptionMarkdown} />
          </DetailSection>

          {creator.kind === "team" ? (
            <DetailSection title={t("creators.members")}>
              {record.members.length ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  {record.members.map((member) => (
                    <Link
                      className="focus-ring flex min-w-0 items-center gap-3 rounded-lg border border-[var(--line)] p-3 hover:border-[var(--accent)]"
                      href={`/authors/${member.creatorId}`}
                      key={`${member.creatorId}:${member.role.id}`}
                    >
                      <CreatorAvatar creator={member} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-black">{member.name}</span>
                        <span className="mt-1 block truncate text-sm text-[var(--muted)]">
                          {member.title || roleDisplayName(member.role, roles, locale)}
                        </span>
                      </span>
                    </Link>
                  ))}
                </div>
              ) : <EmptyLine>{t("creators.noMembers")}</EmptyLine>}
            </DetailSection>
          ) : null}

          <DetailSection title={t("creators.works")}>
            {record.works.length ? (
              <div className="grid gap-3 sm:grid-cols-2">
                {record.works.map((work) => (
                  <Link
                    className="focus-ring flex min-w-0 gap-4 rounded-lg border border-[var(--line)] p-4 transition hover:-translate-y-0.5 hover:border-[var(--accent)]"
                    href={`/mods/${work.siteId}`}
                    key={work.uniqueId}
                  >
                    <span className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-lg bg-[var(--panel-subtle)] font-black text-[var(--muted)]">
                      {work.iconUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img alt="" className="h-full w-full object-cover" src={work.iconUrl} />
                      ) : "MOD"}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate font-black text-[var(--accent)]">
                        {work.secondaryName || work.primaryName}
                      </span>
                      {work.secondaryName ? (
                        <span className="mt-0.5 block truncate text-xs text-[var(--muted)]">{work.primaryName}</span>
                      ) : null}
                      <span className="mt-2 line-clamp-2 text-sm leading-6 text-[var(--muted)]">{work.summary}</span>
                    </span>
                  </Link>
                ))}
              </div>
            ) : <EmptyLine>{t("creators.noWorks")}</EmptyLine>}
          </DetailSection>
        </div>

        <aside className="space-y-4">
          {record.claimedUser ? (
            <section className="surface rounded-lg p-4">
              <h2 className="font-black">{t("creators.claimedAccount")}</h2>
              <Link
                className="focus-ring mt-3 flex items-center gap-3 rounded-lg border border-[var(--line)] p-3 hover:border-[var(--accent)]"
                href={`/user/${record.claimedUser.id}`}
              >
                <CreatorAvatar creator={{ name: record.claimedUser.displayName || record.claimedUser.username, avatarUrl: record.claimedUser.avatarUrl }} />
                <span className="min-w-0">
                  <span className="block truncate font-black">{record.claimedUser.displayName || record.claimedUser.username}</span>
                  <span className="block truncate text-xs text-[var(--muted)]">@{record.claimedUser.username}</span>
                </span>
              </Link>
            </section>
          ) : null}

          <section className="surface rounded-lg p-4">
            <h2 className="font-black">{t("creators.relatedLinks")}</h2>
            {record.links.length ? (
              <div className="mt-3 grid gap-2">
                {record.links.map((link) => (
                  <a
                    className="focus-ring flex items-center justify-between gap-3 rounded-md border border-[var(--line)] px-3 py-2 text-sm font-bold hover:border-[var(--accent)] hover:text-[var(--accent)]"
                    href={link.url}
                    key={`${link.type}:${link.url}`}
                    rel="noreferrer"
                    target="_blank"
                  >
                    <span className="truncate">{link.label || link.type}</span>
                    <span aria-hidden="true">↗</span>
                  </a>
                ))}
              </div>
            ) : <EmptyLine>{t("creators.noLinks")}</EmptyLine>}
          </section>

          <section className="surface rounded-lg p-4">
            <h2 className="font-black">{t("creators.collaborators")}</h2>
            {record.collaborators.length ? (
              <div className="mt-3 grid gap-2">
                {record.collaborators.map((collaborator) => (
                  <Link
                    className="focus-ring flex min-w-0 items-center gap-3 rounded-md border border-[var(--line)] p-2 hover:border-[var(--accent)]"
                    href={creatorHref(collaborator)}
                    key={collaborator.publicId}
                  >
                    <CreatorAvatar creator={collaborator} />
                    <span className="min-w-0">
                      <span className="block truncate font-black">{collaborator.name}</span>
                      <span className="block text-xs text-[var(--muted)]">{t(`creators.kinds.${collaborator.kind}`)}</span>
                    </span>
                  </Link>
                ))}
              </div>
            ) : <EmptyLine>{t("creators.noCollaborators")}</EmptyLine>}
          </section>
        </aside>
      </div>

      {editOpen && token ? (
        <CreatorEditorDialog
          detail={record}
          roles={roles}
          token={token}
          onClose={() => setEditOpen(false)}
          onSaved={async (status) => {
            setEditOpen(false);
            notifySite(
              status === "pending" ? t("creators.editSubmitted") : t("creators.editSaved"),
              t("creators.title"),
              "success",
            );
            await load();
          }}
        />
      ) : null}
      {claimOpen && token ? (
        <ClaimCreatorDialog
          creator={creator}
          token={token}
          onClose={() => setClaimOpen(false)}
          onSubmitted={(status) => {
            setClaimOpen(false);
            notifySite(
              status === "approved" ? t("creators.claimApproved") : t("creators.claimSubmitted"),
              t("creators.claim"),
              "success",
            );
            void load();
          }}
        />
      ) : null}
    </main>
  );
}

function CreatorEditorDialog({
  detail,
  roles: initialRoles,
  token,
  onClose,
  onSaved,
}: {
  detail: CreatorDetailRecord;
  roles: CreatorRole[];
  token: string;
  onClose: () => void;
  onSaved: (status: "pending" | "approved") => void | Promise<void>;
}) {
  const { locale, t } = useI18n();
  const [name, setName] = useState(detail.creator.name);
  const [descriptionMarkdown, setDescriptionMarkdown] = useState(detail.descriptionMarkdown);
  const [avatarUrl, setAvatarUrl] = useState(detail.creator.avatarUrl);
  const [avatarFileId, setAvatarFileId] = useState<number>();
  const [links, setLinks] = useState<CreatorLink[]>(detail.links);
  const [collaborators, setCollaborators] = useState<CreatorSummary[]>(detail.collaborators);
  const [members, setMembers] = useState<CreatorMember[]>(detail.members);
  const [roles, setRoles] = useState(initialRoles);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [saving, setSaving] = useState(false);

  const snapshot = useMemo<CreatorSnapshot>(() => ({
    kind: detail.creator.kind,
    name: name.trim(),
    descriptionMarkdown,
    avatarUrl,
    avatarFileId,
    links: links
      .map((link) => ({ type: link.type.trim(), url: link.url.trim(), label: link.label.trim() }))
      .filter((link) => link.type && link.url),
    collaboratorIds: collaborators.map((item) => item.publicId),
    members: detail.creator.kind === "team"
      ? members.map((member) => ({ creatorId: member.creatorId, roleId: member.role.id, title: member.title.trim() }))
      : [],
  }), [avatarFileId, avatarUrl, collaborators, descriptionMarkdown, detail.creator.kind, links, members, name]);

  async function uploadAvatar(file: File) {
    setUploadingAvatar(true);
    try {
      const uploaded = await uploadUserFileToOSS(file, token, "creator_avatar");
      setAvatarFileId(uploaded.id);
      setAvatarUrl(uploaded.accessUrl || uploaded.url || "");
    } catch (error) {
      notifySite(error instanceof Error ? error.message : t("creators.avatarUploadFailed"), t("creators.avatar"), "danger");
    } finally {
      setUploadingAvatar(false);
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!snapshot.name) return;
    setSaving(true);
    try {
      const result = await apiRequest<{ reviewStatus: "pending" | "approved" }>(
        `/api/v1/creators/${encodeURIComponent(detail.creator.publicId)}`,
        { method: "PUT", body: JSON.stringify(snapshot) },
        token,
      );
      await onSaved(result.reviewStatus);
    } catch (error) {
      notifySite(error instanceof Error ? error.message : t("creators.editFailed"), t("creators.title"), "danger");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[90] bg-black/50 p-3 sm:p-5" role="presentation" onMouseDown={onClose}>
      <form
        className="surface mx-auto flex h-full w-full max-w-7xl flex-col overflow-hidden rounded-lg"
        onMouseDown={(event) => event.stopPropagation()}
        onSubmit={submit}
      >
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--line)] px-4 py-3">
          <div>
            <h2 className="text-xl font-black">{t("creators.editTitle", { name: detail.creator.name })}</h2>
            <p className="mt-1 text-xs text-[var(--muted)]">{t("creators.editReviewHint")}</p>
          </div>
          <div className="flex gap-2">
            <button className="button-secondary focus-ring" type="button" onClick={onClose}>{t("common.close")}</button>
            <button className="button-primary focus-ring" disabled={saving || !name.trim()} type="submit">
              {saving ? t("common.loading") : t("common.save")}
            </button>
          </div>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
            <div className="min-w-0 space-y-5">
              <label className="block">
                <span className="mb-1 block text-sm font-black">{t("creators.name")}</span>
                <input className="field" maxLength={160} required value={name} onChange={(event) => setName(event.target.value)} />
              </label>
              <section>
                <div className="mb-2 flex items-center justify-between gap-3">
                  <h3 className="font-black">{t("creators.introduction")}</h3>
                  <span className="text-xs text-[var(--muted)]">Markdown</span>
                </div>
                <ToolsPlayground embedded editorTitle={t("creators.introduction")} value={descriptionMarkdown} onChange={setDescriptionMarkdown} />
              </section>
            </div>
            <aside className="space-y-5">
              <section className="rounded-lg border border-[var(--line)] p-4">
                <h3 className="font-black">{t("creators.avatar")}</h3>
                <div className="mt-3 flex items-center gap-3">
                  <CreatorAvatar creator={{ name, avatarUrl }} size="large" />
                  <label className="button-secondary focus-ring cursor-pointer">
                    {uploadingAvatar ? t("common.loading") : t("creators.chooseAvatar")}
                    <input
                      className="sr-only"
                      accept="image/png,image/jpeg,image/webp,image/gif,image/apng,.apng"
                      disabled={uploadingAvatar}
                      type="file"
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        event.target.value = "";
                        if (file) void uploadAvatar(file);
                      }}
                    />
                  </label>
                </div>
              </section>

              <LinkEditor links={links} onChange={setLinks} />
              <CreatorRelationPicker kinds={["author", "team"]} label={t("creators.collaborators")} selected={collaborators} token={token} onChange={setCollaborators} />
              {detail.creator.kind === "team" ? (
                <TeamMembersEditor members={members} roles={roles} token={token} locale={locale} onChange={setMembers} onRolesChange={setRoles} />
              ) : null}
            </aside>
          </div>
        </div>
      </form>
    </div>
  );
}

function LinkEditor({ links, onChange }: { links: CreatorLink[]; onChange: (links: CreatorLink[]) => void }) {
  const { t } = useI18n();
  return (
    <section className="rounded-lg border border-[var(--line)] p-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-black">{t("creators.relatedLinks")}</h3>
        <button className="button-secondary focus-ring px-3 py-1.5 text-sm" type="button" onClick={() => onChange([...links, { type: "website", url: "", label: "" }])}>
          + {t("common.add")}
        </button>
      </div>
      <div className="mt-3 grid gap-3">
        {links.map((link, index) => (
          <div className="grid gap-2 rounded-md bg-[var(--panel-subtle)] p-3" key={`${index}:${link.type}:${link.url}`}>
            <div className="grid gap-2 sm:grid-cols-2">
              <input className="field" placeholder={t("creators.linkType")} value={link.type} onChange={(event) => onChange(links.map((item, itemIndex) => itemIndex === index ? { ...item, type: event.target.value } : item))} />
              <input className="field" placeholder={t("creators.linkLabel")} value={link.label} onChange={(event) => onChange(links.map((item, itemIndex) => itemIndex === index ? { ...item, label: event.target.value } : item))} />
            </div>
            <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
              <input className="field" placeholder="https://" type="url" value={link.url} onChange={(event) => onChange(links.map((item, itemIndex) => itemIndex === index ? { ...item, url: event.target.value } : item))} />
              <button className="button-secondary focus-ring" type="button" onClick={() => onChange(links.filter((_, itemIndex) => itemIndex !== index))}>{t("common.delete")}</button>
            </div>
          </div>
        ))}
        {!links.length ? <EmptyLine>{t("creators.noLinks")}</EmptyLine> : null}
      </div>
    </section>
  );
}

function CreatorRelationPicker({
  kinds,
  label,
  selected,
  token,
  onChange,
}: {
  kinds: CreatorKind[];
  label: string;
  selected: CreatorSummary[];
  token: string;
  onChange: (selected: CreatorSummary[]) => void;
}) {
  const { t } = useI18n();
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<CreatorSummary[]>([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    if (!query.trim()) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      setSearching(true);
      apiRequest<{ items: CreatorSummary[] }>(`/api/v1/creators?query=${encodeURIComponent(query.trim())}&limit=30`, {}, token)
        .then((result) => {
          if (!cancelled) {
            const existing = new Set(selected.map((item) => item.publicId));
            setItems(result.items.filter((item) => kinds.includes(item.kind) && !existing.has(item.publicId)));
          }
        })
        .catch(() => {
          if (!cancelled) setItems([]);
        })
        .finally(() => {
          if (!cancelled) setSearching(false);
        });
    }, 180);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [kinds, query, selected, token]);

  return (
    <section className="rounded-lg border border-[var(--line)] p-4">
      <h3 className="font-black">{label}</h3>
      <div className="mt-3 flex flex-wrap gap-2">
        {selected.map((creator) => (
          <button className="focus-ring flex max-w-full items-center gap-2 rounded-md bg-[var(--panel-subtle)] px-2 py-1.5 text-left text-sm font-bold" key={creator.publicId} type="button" onClick={() => onChange(selected.filter((item) => item.publicId !== creator.publicId))}>
            <CreatorAvatar creator={creator} size="small" />
            <span className="truncate">{creator.name}</span>
            <span aria-hidden="true">×</span>
          </button>
        ))}
      </div>
      <input className="field mt-3" placeholder={t("creators.searchPlaceholder")} value={query} onChange={(event) => setQuery(event.target.value)} />
      {query.trim() ? (
        <div className="mt-2 max-h-52 overflow-y-auto rounded-md border border-[var(--line)]">
          {items.map((creator) => (
            <button
              className="focus-ring flex w-full items-center gap-3 border-b border-[var(--line)] p-2 text-left last:border-b-0 hover:bg-[var(--panel-subtle)]"
              key={creator.publicId}
              type="button"
              onClick={() => {
                onChange([...selected, creator]);
                setQuery("");
              }}
            >
              <CreatorAvatar creator={creator} size="small" />
              <span className="min-w-0">
                <span className="block truncate font-black">{creator.name}</span>
                <span className="block text-xs text-[var(--muted)]">{t(`creators.kinds.${creator.kind}`)} · {creator.publicId}</span>
              </span>
            </button>
          ))}
          {!searching && !items.length ? <p className="p-3 text-sm text-[var(--muted)]">{t("creators.noResults")}</p> : null}
          {searching ? <p className="p-3 text-sm text-[var(--muted)]">{t("common.loading")}</p> : null}
        </div>
      ) : null}
    </section>
  );
}

function TeamMembersEditor({
  members,
  roles,
  token,
  locale,
  onChange,
  onRolesChange,
}: {
  members: CreatorMember[];
  roles: CreatorRole[];
  token: string;
  locale: string;
  onChange: (members: CreatorMember[]) => void;
  onRolesChange: (roles: CreatorRole[]) => void;
}) {
  const { t } = useI18n();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<CreatorSummary[]>([]);
  const [customRole, setCustomRole] = useState("");
  const [creatingRole, setCreatingRole] = useState(false);

  useEffect(() => {
    if (!query.trim()) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      apiRequest<{ items: CreatorSummary[] }>(`/api/v1/creators?kind=author&query=${encodeURIComponent(query.trim())}&limit=30`, {}, token)
        .then((result) => {
          if (!cancelled) {
            const existing = new Set(members.map((item) => item.creatorId));
            setResults(result.items.filter((item) => !existing.has(item.publicId)));
          }
        })
        .catch(() => {
          if (!cancelled) setResults([]);
        });
    }, 180);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [members, query, token]);

  async function createRole() {
    if (!customRole.trim()) return;
    setCreatingRole(true);
    try {
      const result = await apiRequest<{ id: number; code: string; name: string }>(
        "/api/v1/creator-roles",
        { method: "POST", body: JSON.stringify({ name: customRole.trim(), description: "", translations: {} }) },
        token,
      );
      onRolesChange([...roles, { ...result, description: "", translations: {}, custom: true }]);
      setCustomRole("");
    } catch (error) {
      notifySite(error instanceof Error ? error.message : t("creators.roleCreateFailed"), t("creators.members"), "danger");
    } finally {
      setCreatingRole(false);
    }
  }

  return (
    <section className="rounded-lg border border-[var(--line)] p-4">
      <h3 className="font-black">{t("creators.members")}</h3>
      <div className="mt-3 grid gap-3">
        {members.map((member, index) => (
          <div className="grid gap-2 rounded-md bg-[var(--panel-subtle)] p-3" key={`${member.creatorId}:${member.role.id}:${index}`}>
            <div className="flex min-w-0 items-center gap-3">
              <CreatorAvatar creator={member} size="small" />
              <p className="min-w-0 flex-1 truncate font-black">{member.name}</p>
              <button className="button-secondary focus-ring px-2 py-1 text-xs" type="button" onClick={() => onChange(members.filter((_, itemIndex) => itemIndex !== index))}>{t("common.delete")}</button>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <select
                className="field"
                value={member.role.id}
                onChange={(event) => {
                  const role = roles.find((item) => item.id === Number(event.target.value));
                  if (!role) return;
                  onChange(members.map((item, itemIndex) => itemIndex === index ? { ...item, role: { id: role.id, code: role.code, name: role.name } } : item));
                }}
              >
                {roles.map((role) => <option key={role.id} value={role.id}>{translatedRecord(role.translations, locale, "name", role.name)}</option>)}
              </select>
              <input className="field" placeholder={t("creators.memberTitle")} value={member.title} onChange={(event) => onChange(members.map((item, itemIndex) => itemIndex === index ? { ...item, title: event.target.value } : item))} />
            </div>
          </div>
        ))}
      </div>
      <input className="field mt-3" placeholder={t("creators.searchAuthors")} value={query} onChange={(event) => setQuery(event.target.value)} />
      {query.trim() ? (
        <div className="mt-2 max-h-44 overflow-y-auto rounded-md border border-[var(--line)]">
          {results.map((creator) => (
            <button
              className="focus-ring flex w-full items-center gap-3 border-b border-[var(--line)] p-2 text-left last:border-b-0 hover:bg-[var(--panel-subtle)]"
              key={creator.publicId}
              type="button"
              onClick={() => {
                const role = roles[0];
                if (!role) return;
                onChange([...members, {
                  creatorId: creator.publicId,
                  name: creator.name,
                  avatarUrl: creator.avatarUrl,
                  role: { id: role.id, code: role.code, name: role.name },
                  title: "",
                }]);
                setQuery("");
              }}
            >
              <CreatorAvatar creator={creator} size="small" />
              <span className="truncate font-black">{creator.name}</span>
            </button>
          ))}
          {!results.length ? <p className="p-3 text-sm text-[var(--muted)]">{t("creators.noResults")}</p> : null}
        </div>
      ) : null}
      <div className="mt-4 border-t border-[var(--line)] pt-4">
        <p className="text-sm font-black">{t("creators.customRole")}</p>
        <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_auto]">
          <input className="field" value={customRole} onChange={(event) => setCustomRole(event.target.value)} />
          <button className="button-secondary focus-ring" disabled={creatingRole || !customRole.trim()} type="button" onClick={() => void createRole()}>
            {creatingRole ? t("common.loading") : t("common.create")}
          </button>
        </div>
      </div>
    </section>
  );
}

function ClaimCreatorDialog({
  creator,
  token,
  onClose,
  onSubmitted,
}: {
  creator: CreatorSummary;
  token: string;
  onClose: () => void;
  onSubmitted: (status: "pending" | "approved") => void;
}) {
  const { t } = useI18n();
  const [proofMarkdown, setProofMarkdown] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    try {
      const result = await apiRequest<{ status: "pending" | "approved" }>(
        `/api/v1/creators/${encodeURIComponent(creator.publicId)}/claims`,
        { method: "POST", body: JSON.stringify({ proofMarkdown }) },
        token,
      );
      onSubmitted(result.status);
    } catch (error) {
      notifySite(error instanceof Error ? error.message : t("creators.claimFailed"), t("creators.claim"), "danger");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[90] grid place-items-center bg-black/50 p-4" role="presentation" onMouseDown={onClose}>
      <form className="surface w-full max-w-2xl rounded-lg p-5" onSubmit={submit} onMouseDown={(event) => event.stopPropagation()}>
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-xl font-black">{t("creators.claimTitle", { name: creator.name })}</h2>
          <button className="button-secondary focus-ring" type="button" onClick={onClose}>{t("common.close")}</button>
        </div>
        <p className="mt-2 text-sm leading-6 text-[var(--muted)]">{t("creators.claimDescription")}</p>
        <textarea className="field mt-4 min-h-44 resize-y" placeholder={t("creators.claimProof")} value={proofMarkdown} onChange={(event) => setProofMarkdown(event.target.value)} />
        <div className="mt-5 flex justify-end">
          <button className="button-primary focus-ring" disabled={submitting} type="submit">{submitting ? t("common.loading") : t("creators.submitClaim")}</button>
        </div>
      </form>
    </div>
  );
}

function DetailSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-b border-[var(--line)] pb-7">
      <h2 className="mb-4 text-2xl font-black">{title}</h2>
      {children}
    </section>
  );
}

function EmptyLine({ children }: { children: React.ReactNode }) {
  return <p className="mt-3 text-sm leading-6 text-[var(--muted)]">{children}</p>;
}

function CreatorPageState({ text }: { text: string }) {
  return (
    <main className="grid min-h-[65vh] place-items-center bg-[var(--background)] px-4">
      <p className="surface w-full max-w-lg rounded-lg p-6 text-center text-sm text-[var(--muted)]">{text}</p>
    </main>
  );
}

function CreatorAvatar({
  creator,
  size = "normal",
}: {
  creator: Pick<CreatorSummary, "avatarUrl" | "name">;
  size?: "small" | "normal" | "large";
}) {
  const sizes = size === "large" ? "h-24 w-24 text-3xl" : size === "small" ? "h-8 w-8 text-xs" : "h-11 w-11 text-base";
  return (
    <span className={`grid shrink-0 place-items-center overflow-hidden rounded-lg bg-[var(--accent-soft)] font-black text-[var(--accent)] ${sizes}`}>
      {creator.avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img alt="" className="h-full w-full object-cover" src={creator.avatarUrl} />
      ) : creator.name.trim().slice(0, 1).toUpperCase()}
    </span>
  );
}

function roleDisplayName(role: Pick<CreatorRole, "id" | "name">, roles: CreatorRole[], locale: string) {
  const full = roles.find((item) => item.id === role.id);
  return full ? translatedRecord(full.translations, locale, "name", full.name) : role.name;
}
