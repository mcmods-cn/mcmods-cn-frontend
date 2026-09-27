"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { apiRequest } from "../_lib/api";
import { useAuthSnapshot } from "../_lib/auth";
import { CreatorDetail, CreatorKind, CreatorRole } from "../_lib/community-api";
import { useI18n } from "../_lib/i18n-provider";
import type { BackendModAuthor } from "../_lib/mod-api";
import { notifySite } from "../_lib/site-notice";
import { CreatorPicker } from "./creator-picker";
import { LoginRequiredState, PageFeedback } from "./page-feedback";

const authorCreatorKinds: CreatorKind[] = ["author"];

export function CreatorMemberManager({ publicId }: { publicId: string }) {
  const { t } = useI18n();
  const { ready, token } = useAuthSnapshot();
  const [detail, setDetail] = useState<CreatorDetail | null>(null);
  const [roles, setRoles] = useState<CreatorRole[]>([]);
  const [members, setMembers] = useState<BackendModAuthor[]>([]);
  const [customRole, setCustomRole] = useState("");
  const [creatingRole, setCreatingRole] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError("");
    try {
      const [loadedDetail, roleResult] = await Promise.all([
        apiRequest<CreatorDetail>(`/api/v1/creators/${encodeURIComponent(publicId)}`, {}, token),
        apiRequest<{ items: CreatorRole[] }>("/api/v1/creator-roles", {}, token),
      ]);
      const detail = loadedDetail;
      if (detail.creator.kind !== "team" || !detail.canManageMembers) {
        throw new Error(t("creators.membersDenied"));
      }
      setDetail(detail);
      setRoles(roleResult.items);
      setMembers(detail.members.map((member) => ({
        creatorId: member.creatorId,
        kind: "author",
        name: member.name,
        avatarUrl: member.avatarUrl,
        roleId: member.role.id,
        role: member.role.name,
        title: member.title,
      })));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : t("creators.loadFailed"));
    } finally {
      setLoading(false);
    }
  }, [publicId, t, token]);

  useEffect(() => {
    if (!ready || !token) return;
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load, ready, token]);

  async function saveMembers(event: FormEvent) {
    event.preventDefault();
    if (!detail || members.some((member) => !member.creatorId || !member.roleId)) return;
    setSaving(true);
    try {
      await apiRequest(`/api/v1/creators/${encodeURIComponent(publicId)}/members`, {
        method: "PUT",
        body: JSON.stringify({
          members: members.map((member) => ({
            creatorId: member.creatorId,
            roleId: member.roleId,
            title: member.title?.trim() ?? "",
          })),
        }),
      }, token!);
      notifySite(t("creators.membersSaved"), t("creators.members"), "success");
      await load();
    } catch (saveError) {
      notifySite(saveError instanceof Error ? saveError.message : t("creators.membersSaveFailed"), t("creators.members"), "danger");
    } finally {
      setSaving(false);
    }
  }

  async function createRole() {
    if (!detail?.canCreateRoles || !customRole.trim()) return;
    setCreatingRole(true);
    try {
      const result = await apiRequest<{ id: string; code: string; name: string }>("/api/v1/creator-roles", {
        method: "POST",
        body: JSON.stringify({ name: customRole.trim(), description: "", translations: {} }),
      }, token!);
      setRoles((current) => [...current, { ...result, description: "", translations: {}, custom: true }]);
      setCustomRole("");
    } catch (roleError) {
      notifySite(roleError instanceof Error ? roleError.message : t("creators.roleCreateFailed"), t("creators.members"), "danger");
    } finally {
      setCreatingRole(false);
    }
  }

  const nextPath = `/teams/${encodeURIComponent(publicId)}/members`;
  if (!ready || (token && loading)) return <PageFeedback title={t("common.loading")} />;
  if (!token) return <LoginRequiredState nextPath={nextPath} description={t("creators.editLoginRequired")} />;
  if (error || !detail) return <PageFeedback title={error || t("creators.notFound")} tone="danger" action={<Link className="button-secondary focus-ring" href={`/teams/${encodeURIComponent(publicId)}`}>{t("creators.backToDetail")}</Link>} />;

  return (
    <main className="min-h-screen bg-[var(--background)] px-4 py-7 text-[var(--foreground)]">
      <form className="mx-auto max-w-5xl" onSubmit={saveMembers}>
        <Link className="focus-ring inline-flex rounded-sm text-sm font-bold text-[var(--accent)] hover:underline" href={`/teams/${encodeURIComponent(publicId)}`}>← {t("creators.backToDetail")}</Link>
        <header className="mt-4 flex flex-wrap items-start justify-between gap-4 border-b border-[var(--line)] pb-5">
          <div>
            <h1 className="text-3xl font-black">{t("creators.manageMembersTitle", { name: detail.creator.name })}</h1>
            <p className="mt-2 text-sm leading-6 text-[var(--muted)]">{t("creators.memberManagementDescription")}</p>
          </div>
          <button className="button-primary focus-ring" disabled={saving || members.some((member) => !member.creatorId || !member.roleId)} type="submit">{saving ? t("common.loading") : t("creators.saveMembers")}</button>
        </header>

        <section className="mt-6 rounded-lg border border-[var(--line)] bg-[var(--panel)] p-4">
          <h2 className="font-black">{t("creators.members")}</h2>
          <div className="mt-3"><CreatorPicker allowTitle allowedKinds={authorCreatorKinds} initialRoles={roles} value={members} onChange={setMembers} /></div>
        </section>

        {detail.canCreateRoles ? (
          <section className="mt-6 rounded-lg border border-[var(--line)] bg-[var(--panel)] p-4">
            <h2 className="font-black">{t("creators.customRole")}</h2>
            <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto]">
              <input className="field" maxLength={160} value={customRole} onChange={(event) => setCustomRole(event.target.value)} />
              <button className="button-secondary focus-ring" disabled={creatingRole || !customRole.trim()} type="button" onClick={() => void createRole()}>{creatingRole ? t("common.loading") : t("common.create")}</button>
            </div>
          </section>
        ) : null}
      </form>
    </main>
  );
}
