"use client";

import { FormEvent, ReactNode, useEffect, useRef, useState } from "react";
import { apiRequest } from "../_lib/api";
import { hasSameI18nPlaceholders } from "../_lib/i18n-message.mts";
import { Locale, supportedLocales, useI18n } from "../_lib/i18n-provider";
import { EmptyState, InlineMessage, LocalizedTextPairEditor, Permission, PermissionCatalog, Role, RolePermissionEntry, User, UserPermissionDetails, UserPermissionEntry, aiTranslationTaskTypes, buildNewPermissionPayload, cleanError, cloneRole, editableLocalizedText, localizedText, normalizeLocalizedTexts, notifyAdminNotice, parsePermissionInput, permissionInfoForCode, permissionModule, permissionSuggestions, permissionTemplateCode, runAITranslationTask, setLocalizedText, splitCodes, withFallbackLocalizedText } from "./admin-console-shared";

function PermissionGroupEditor({
  catalog,
  token,
  refreshCatalog,
}: {
  catalog: PermissionCatalog;
  token: string;
  refreshCatalog: () => Promise<void>;
}) {
  const { locale, t } = useI18n();
  const firstRole = catalog.roles[0]?.code ?? "";
  const [selectedCode, setSelectedCode] = useState(firstRole);
  const selectedRole = catalog.roles.find((role) => role.code === selectedCode) ?? catalog.roles[0];
  const [draft, setDraft] = useState<Role | null>(selectedRole ? cloneRole(selectedRole) : null);
  const [sourceLocale, setSourceLocale] = useState<Locale>("zh-CN");
  const [targetLocale, setTargetLocale] = useState<Locale>(locale);
  const [bulkPermissionInput, setBulkPermissionInput] = useState("");
  const [bulkPermissionAllow, setBulkPermissionAllow] = useState(true);
  const [bulkPermissionExpiresAt, setBulkPermissionExpiresAt] = useState("");
  const [bulkPermissionName, setBulkPermissionName] = useState("");
  const [bulkPermissionDescription, setBulkPermissionDescription] = useState("");
  const [selectedModule, setSelectedModule] = useState("all");
  const [selectedPermissionIndexes, setSelectedPermissionIndexes] = useState<number[]>([]);
  const [message, setMessage] = useState("");
  const selectionVersion = useRef(0);
  const savePending = useRef(false);
  const [saving, setSaving] = useState(false);
  const currentDraft = draft ?? (selectedRole ? cloneRole(selectedRole) : null);

  function selectRole(role: Role) {
    selectionVersion.current += 1;
    setSelectedCode(role.code);
    setDraft(cloneRole(role));
    setSelectedPermissionIndexes([]);
    setMessage("");
  }

  function startCreateRole() {
    selectionVersion.current += 1;
    setSelectedCode("");
    setDraft({ code: "", name: "", description: "", translations: {}, weight: 0, parents: [], permissions: [], permissionEntries: [] });
    setSelectedPermissionIndexes([]);
    setMessage("");
  }

  function updatePermissionAt(index: number, patch: Partial<RolePermissionEntry>) {
    if (!currentDraft) return;
    const permissionEntries = currentDraft.permissionEntries.map((permission, permissionIndex) =>
      permissionIndex === index ? { ...permission, ...patch } : permission,
    );
    setDraft({
      ...currentDraft,
      permissionEntries,
      permissions: permissionEntries.map((permission) => permission.code),
    });
  }

  function removePermissionAt(index: number) {
    if (!currentDraft) return;
    const permissionEntries = currentDraft.permissionEntries.filter((_, permissionIndex) => permissionIndex !== index);
    setDraft({
      ...currentDraft,
      permissionEntries,
      permissions: permissionEntries.map((permission) => permission.code),
    });
    setSelectedPermissionIndexes((current) => current.filter((item) => item !== index).map((item) => (item > index ? item - 1 : item)));
  }

  function togglePermissionSelection(index: number) {
    setSelectedPermissionIndexes((current) =>
      current.includes(index) ? current.filter((item) => item !== index) : [...current, index],
    );
  }

  function setVisiblePermissionSelection(checked: boolean) {
    const visibleIndexes = visibleDraftPermissions.map((permission) => permission.index);
    setSelectedPermissionIndexes((current) => {
      if (checked) return Array.from(new Set([...current, ...visibleIndexes]));
      return current.filter((index) => !visibleIndexes.includes(index));
    });
  }

  function bulkUpdatePermissionAllow(allow: boolean) {
    if (!currentDraft || selectedPermissionIndexes.length === 0) return;
    const selected = new Set(selectedPermissionIndexes);
    const permissionEntries = currentDraft.permissionEntries.map((permission, index) =>
      selected.has(index) ? { ...permission, allow } : permission,
    );
    setDraft({ ...currentDraft, permissionEntries, permissions: permissionEntries.map((permission) => permission.code) });
  }

  function bulkRemovePermissions() {
    if (!currentDraft || selectedPermissionIndexes.length === 0) return;
    const selected = new Set(selectedPermissionIndexes);
    const permissionEntries = currentDraft.permissionEntries.filter((_, index) => !selected.has(index));
    setDraft({ ...currentDraft, permissionEntries, permissions: permissionEntries.map((permission) => permission.code) });
    setSelectedPermissionIndexes([]);
  }

  async function saveRole(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!currentDraft || !token) {
      setMessage(t("admin.permissionLoginRequired"));
      return;
    }
    const payload = {
      ...withFallbackLocalizedText(currentDraft),
      parents: splitCodes(currentDraft.parents.join(",")),
      permissions: currentDraft.permissionEntries.map((permission) => permission.code),
      permissionEntries: currentDraft.permissionEntries,
    };
    const creating = selectedCode === "";
    if (savePending.current) return;
    savePending.current = true;
    const requestedSelectionVersion = selectionVersion.current;
    setSaving(true);
    try {
      const saved = await apiRequest<Role>(
        creating ? "/api/v1/admin/roles" : `/api/v1/admin/roles/${encodeURIComponent(currentDraft.code)}`,
        { method: creating ? "POST" : "PUT", body: JSON.stringify(payload) },
        token,
      );
      await refreshCatalog();
      if (requestedSelectionVersion !== selectionVersion.current) return;
      setSelectedCode(saved.code);
      setDraft(cloneRole(saved));
      setMessage(t("admin.roleSaved"));
    } catch (error) {
      if (requestedSelectionVersion === selectionVersion.current) setMessage(cleanError(error));
    } finally {
      savePending.current = false;
      setSaving(false);
    }
  }

  async function deleteRole() {
    if (!currentDraft || !selectedCode || !token) {
      setMessage(t("admin.selectExistingRole"));
      return;
    }
    if (!window.confirm(t("admin.confirmDeleteRole", { code: currentDraft.code }))) return;
    try {
      await apiRequest<{ ok: boolean }>(
        `/api/v1/admin/roles/${encodeURIComponent(currentDraft.code)}`,
        { method: "DELETE" },
        token,
      );
      await refreshCatalog();
      setSelectedCode("");
      setDraft({ code: "", name: "", description: "", translations: {}, weight: 0, parents: [], permissions: [], permissionEntries: [] });
      setMessage(t("admin.roleDeleted"));
    } catch (error) {
      setMessage(cleanError(error));
    }
  }

  async function addPermissionEntriesFromInput() {
    if (!currentDraft || !token) {
      setMessage(t("admin.selectRoleAndLoginRequired"));
      return;
    }
    const codes = parsePermissionInput(bulkPermissionInput);
    if (codes.length === 0) {
      setMessage(t("admin.permissionInputRequired"));
      return;
    }
    const existingCodes = new Set(catalog.permissions.map((permission) => permission.code));
    const currentCodes = new Set(currentDraft.permissionEntries.map((permission) => permission.code));
    try {
      for (const code of codes) {
        if (!existingCodes.has(code)) {
          await apiRequest<{ ok: boolean }>(
            "/api/v1/admin/permissions",
            {
              method: "POST",
              body: JSON.stringify(buildNewPermissionPayload(code, bulkPermissionName, bulkPermissionDescription, targetLocale)),
            },
            token,
          );
        }
      }
      const appended = codes
        .filter((code) => !currentCodes.has(code))
        .map((code) => ({
          code,
          allow: bulkPermissionAllow,
          expiresAt: bulkPermissionExpiresAt,
        }));
      const permissionEntries = [...currentDraft.permissionEntries, ...appended];
      setDraft({
        ...currentDraft,
        permissionEntries,
        permissions: permissionEntries.map((permission) => permission.code),
      });
      setBulkPermissionInput("");
      setBulkPermissionName("");
      setBulkPermissionDescription("");
      await refreshCatalog();
      setMessage(t("admin.permissionAdded"));
    } catch (error) {
      setMessage(cleanError(error));
    }
  }

  if (!currentDraft) {
    return (
      <section className="surface overflow-hidden rounded-lg">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--line)] px-4 py-3">
          <div>
            <h2 className="text-lg font-bold">{t("admin.roleGroup")}</h2>
            <p className="text-sm text-[var(--muted)]">{t("admin.roleCount", { count: 0 })}</p>
          </div>
          <button className="button-primary focus-ring" type="button" onClick={startCreateRole}>
            {t("admin.newRole")}
          </button>
        </div>
        <div className="p-4">
          <EmptyState text={t("admin.noRoles")} />
        </div>
      </section>
    );
  }

  const modules = Array.from(new Set(catalog.permissions.map((permission) => permission.module)));
  const permissionMeta = new Map(catalog.permissions.map((permission) => [permission.code, permission]));
  const draftPermissionRows = currentDraft.permissionEntries.map((permission, index) => {
    const meta = permissionMeta.get(permission.code) ?? permissionMeta.get(permissionTemplateCode(permission.code));
    const localizedMeta = meta ? localizedText(meta, locale) : null;
    return {
      ...permission,
      index,
      module: meta?.module ?? permission.code.split(".")[0] ?? "custom",
      name: localizedMeta?.name ?? t("admin.customPermission"),
      description: localizedMeta?.description ?? t("admin.manualPermissionNode"),
    };
  });
  const visibleDraftPermissions =
    selectedModule === "all"
      ? draftPermissionRows
      : draftPermissionRows.filter((permission) => permission.module === selectedModule);
  const permissionOptions =
    selectedModule === "all"
      ? catalog.permissions
      : catalog.permissions.filter((permission) => permission.module === selectedModule);

  return (
    <div className="grid min-h-[calc(100vh-8rem)] gap-4 xl:grid-cols-[220px_minmax(0,1fr)]">
      <section className="surface overflow-hidden rounded-lg">
        <div className="flex items-center justify-between border-b border-[var(--line)] px-4 py-3">
          <div>
            <h2 className="text-lg font-bold">{t("admin.roleGroup")}</h2>
            <p className="text-sm text-[var(--muted)]">{t("admin.roleCount", { count: catalog.roles.length })}</p>
          </div>
          <button className="button-secondary focus-ring px-3 py-2" type="button" onClick={startCreateRole}>
            {t("admin.newRole")}
          </button>
        </div>
        <div className="max-h-[calc(100vh-14rem)] overflow-y-auto">
          {catalog.roles.map((role) => {
            const roleText = localizedText(role, locale);
            return (
            <button
              key={role.code}
              className={`grid w-full grid-cols-[1fr_auto] gap-3 border-b border-[var(--line)] px-4 py-3 text-left ${
                selectedCode === role.code ? "bg-[var(--panel-subtle)]" : "hover:bg-[var(--panel-subtle)]"
              }`}
              type="button"
              onClick={() => selectRole(role)}
            >
              <span>
                <span className="block font-bold">{roleText.name}</span>
                <span className="mt-1 block font-mono text-xs text-[var(--muted)]">{role.code}</span>
              </span>
              <span className="text-sm font-bold text-[var(--muted)]">{role.weight}</span>
            </button>
            );
          })}
        </div>
      </section>

      <section className="grid gap-4">
        <form className="surface overflow-hidden rounded-lg p-4" onSubmit={saveRole}>
            <fieldset disabled={saving} className="contents">
          <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="grid gap-3 lg:grid-cols-[auto_minmax(220px,360px)_auto] lg:items-center">
                <span className="text-2xl font-bold">Group:</span>
                <div className="field text-xl font-bold">{localizedText(currentDraft, locale).name || t("admin.unnamedRole")}</div>
                <span className="break-all font-mono text-xl font-bold text-[var(--muted)]">({currentDraft.code || "new_group"})</span>
              </div>
              <div className="mt-3 grid gap-3 text-sm font-semibold md:grid-cols-[140px_minmax(220px,1fr)]">
                <label className="grid gap-1">
                  {t("admin.weight")}:
                  <input
                    className="field px-2 py-1"
                    onChange={(event) => setDraft({ ...currentDraft, weight: Number(event.target.value) })}
                    type="number"
                    value={currentDraft.weight}
                  />
                </label>
                <label className="grid gap-1">
                  {t("admin.roleId")}
                  <input
                    className="field font-mono"
                    disabled={selectedCode !== ""}
                    onChange={(event) => setDraft({ ...currentDraft, code: event.target.value })}
                    placeholder="project_editor.[ProjectID]"
                    value={currentDraft.code}
                  />
                </label>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {selectedCode ? (
                <button className="button-secondary focus-ring border-red-500/40 text-red-600" type="button" onClick={deleteRole}>
                  {t("admin.deleteRole")}
                </button>
              ) : null}
              <button className="button-primary focus-ring" type="submit">
                {t("admin.saveRole")}
              </button>
            </div>
          </div>
          <div className="grid gap-3">
            <label className="text-sm font-semibold">
              {t("admin.parentGroups")}
              <ParentRolePicker
                roles={catalog.roles.filter((role) => role.code !== currentDraft.code)}
                value={currentDraft.parents}
                onChange={(parents) => setDraft({ ...currentDraft, parents })}
              />
            </label>
            <label className="text-sm font-semibold">
              {t("admin.localizedDisplay")}
              <LocalizedTextPairEditor
                description={t("admin.localizedDisplayDesc")}
                sourceLocale={sourceLocale}
                targetLocale={targetLocale}
                value={currentDraft}
                onChange={(translations) => setDraft({ ...currentDraft, translations })}
                onSourceLocaleChange={setSourceLocale}
                onTargetLocaleChange={setTargetLocale}
              />
            </label>
            {message ? <InlineMessage text={message} /> : null}
          </div>
        </fieldset>
          </form>

        <section className="surface rounded-lg">
          <div className="border-b border-[var(--line)] px-4 py-3">
            <h2 className="text-lg font-bold">{t("admin.permissionNodes")} ({currentDraft.permissions.length})</h2>
          </div>
          <div className="flex flex-wrap items-center gap-2 border-b border-[var(--line)] px-4 py-3 text-sm">
            <span className="font-semibold text-[var(--muted)]">{t("admin.selectedCount", { count: selectedPermissionIndexes.length })}</span>
            <button className="button-secondary focus-ring px-3 py-2" disabled={selectedPermissionIndexes.length === 0} type="button" onClick={() => bulkUpdatePermissionAllow(true)}>
              {t("admin.bulkSetTrue")}
            </button>
            <button className="button-secondary focus-ring px-3 py-2" disabled={selectedPermissionIndexes.length === 0} type="button" onClick={() => bulkUpdatePermissionAllow(false)}>
              {t("admin.bulkSetFalse")}
            </button>
            <button className="button-secondary focus-ring border-red-500/40 px-3 py-2 text-red-600" disabled={selectedPermissionIndexes.length === 0} type="button" onClick={bulkRemovePermissions}>
              {t("admin.bulkDelete")}
            </button>
          </div>
          <div className="grid gap-4 p-4 xl:grid-cols-[160px_1fr]">
            <div className="grid h-fit gap-2">
              <button
                className={`focus-ring rounded-md border border-[var(--line)] px-3 py-2 text-left text-sm font-semibold ${
                  selectedModule === "all" ? "bg-[var(--accent)] text-[var(--on-accent)]" : "hover:bg-[var(--panel-subtle)]"
                }`}
                type="button"
                onClick={() => setSelectedModule("all")}
              >
                {t("admin.moduleAll")}
              </button>
              {modules.map((module) => (
                <button
                  key={module}
                  className={`focus-ring rounded-md border border-[var(--line)] px-3 py-2 text-left text-sm font-semibold ${
                    selectedModule === module ? "bg-[var(--accent)] text-[var(--on-accent)]" : "hover:bg-[var(--panel-subtle)]"
                  }`}
                  type="button"
                  onClick={() => setSelectedModule(module)}
                >
                  {module}
                </button>
              ))}
            </div>
            <div className="max-h-[520px] overflow-y-auto">
              <table className="w-full min-w-[760px] border-separate border-spacing-0 text-left text-sm">
                <thead className="text-[var(--muted)]">
                  <tr>
                    <th className="border-b border-[var(--line)] px-3 py-3">
                      <input
                        checked={visibleDraftPermissions.length > 0 && visibleDraftPermissions.every((permission) => selectedPermissionIndexes.includes(permission.index))}
                        type="checkbox"
                        onChange={(event) => setVisiblePermissionSelection(event.target.checked)}
                      />
                    </th>
                    <th className="border-b border-[var(--line)] px-3 py-3">{t("admin.permission")}</th>
                    <th className="border-b border-[var(--line)] px-3 py-3">{t("admin.value")}</th>
                    <th className="border-b border-[var(--line)] px-3 py-3">{t("admin.expiresAt")}</th>
                    <th className="border-b border-[var(--line)] px-3 py-3">{t("admin.description")}</th>
                    <th className="border-b border-[var(--line)] px-3 py-3">{t("admin.operation")}</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleDraftPermissions.map((permission) => (
                    <tr key={`permission-${permission.index}`} className="hover:bg-[var(--panel-subtle)]">
                      <td className="border-b border-[var(--line)] px-3 py-3">
                        <input
                          checked={selectedPermissionIndexes.includes(permission.index)}
                          type="checkbox"
                          onChange={() => togglePermissionSelection(permission.index)}
                        />
                      </td>
                      <td className="border-b border-[var(--line)] px-3 py-3">
                        <input
                          className="field px-3 py-2 font-mono"
                          onChange={(event) => updatePermissionAt(permission.index, { code: event.target.value.trim() })}
                          placeholder="project.edit.[ProjectID]"
                          value={permission.code}
                        />
                      </td>
                      <td className="border-b border-[var(--line)] px-3 py-3">
                        <button
                          className={`focus-ring rounded-md px-3 py-2 font-mono font-bold ${
                            permission.allow
                              ? "bg-[var(--panel-subtle)] text-[var(--accent)]"
                              : "bg-[var(--panel-subtle)] text-[var(--red)]"
                          }`}
                          type="button"
                          onClick={() => updatePermissionAt(permission.index, { allow: !permission.allow })}
                        >
                          {permission.allow ? "true" : "false"}
                        </button>
                      </td>
                      <td className="border-b border-[var(--line)] px-3 py-3">
                        <label className="grid gap-1">
                          <span className="text-xs font-semibold text-[var(--muted)]">
                            {permission.expiresAt ? t("admin.expireTime") : t("admin.neverExpires")}
                          </span>
                          <input
                            className="field px-3 py-2"
                            onChange={(event) => updatePermissionAt(permission.index, { expiresAt: event.target.value })}
                            title={t("admin.emptyDateMeansNever")}
                            type="date"
                            value={permission.expiresAt ? permission.expiresAt.slice(0, 10) : ""}
                          />
                        </label>
                      </td>
                      <td className="border-b border-[var(--line)] px-3 py-3 text-[var(--muted)]">
                        <span className="block font-semibold text-[var(--foreground)]">{permission.name}</span>
                        <span className="mt-1 block">{permission.description}</span>
                      </td>
                      <td className="border-b border-[var(--line)] px-3 py-3">
                        <button
                          className="button-secondary focus-ring whitespace-nowrap px-3 py-2"
                          type="button"
                          onClick={() => removePermissionAt(permission.index)}
                        >
                          {t("common.delete")}
                        </button>
                      </td>
                    </tr>
                  ))}
                  {visibleDraftPermissions.length === 0 ? (
                    <tr>
                      <td className="px-3 py-8 text-center text-[var(--muted)]" colSpan={6}>
                        {t("admin.noPermissionNodesInFilter")}
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>
          <PermissionBulkAdder
            allow={bulkPermissionAllow}
            description={bulkPermissionDescription}
            expiresAt={bulkPermissionExpiresAt}
            input={bulkPermissionInput}
            name={bulkPermissionName}
            permissions={permissionOptions}
            selectedCodes={currentDraft.permissionEntries.map((permission) => permission.code)}
            onAdd={addPermissionEntriesFromInput}
            onAllowChange={setBulkPermissionAllow}
            onDescriptionChange={setBulkPermissionDescription}
            onExpiresAtChange={setBulkPermissionExpiresAt}
            onInputChange={setBulkPermissionInput}
            onNameChange={setBulkPermissionName}
          />
        </section>

      </section>
    </div>
  );
}

function UserPermissionNodeEditor({
  entries,
  catalog,
  selectedModule,
  onModuleChange,
  onUpdate,
  onRemove,
  onBulkUpdate,
  onBulkRemove,
  children,
}: {
  entries: UserPermissionEntry[];
  catalog: PermissionCatalog;
  selectedModule: string;
  onModuleChange: (module: string) => void;
  onUpdate: (index: number, patch: Partial<UserPermissionEntry>) => void;
  onRemove: (index: number) => void;
  onBulkUpdate: (indexes: number[], patch: Partial<UserPermissionEntry>) => void;
  onBulkRemove: (indexes: number[]) => void;
  children: ReactNode;
}) {
  const { t } = useI18n();
  const [selectedIndexes, setSelectedIndexes] = useState<number[]>([]);
  const roleMap = new Map(catalog.roles.map((role) => [`group.${role.code}`, role]));
  const rows = entries.map((entry, index) => {
    const role = roleMap.get(entry.code);
    const permission = permissionInfoForCode(catalog, entry.code);
    return {
      ...entry,
      index,
      module: role ? "group" : permission?.module || permissionModule(entry.code),
      name: role?.name || permission?.name || entry.code,
      description: role?.description || permission?.description || t("admin.permissionNotCataloged"),
    };
  });
  const modules = Array.from(new Set(rows.map((entry) => entry.module))).sort();
  const visibleRows = selectedModule === "all" ? rows : rows.filter((entry) => entry.module === selectedModule);

  function toggleSelection(index: number) {
    setSelectedIndexes((current) => (current.includes(index) ? current.filter((item) => item !== index) : [...current, index]));
  }

  function setVisibleSelection(checked: boolean) {
    const visibleIndexes = visibleRows.map((entry) => entry.index);
    setSelectedIndexes((current) => {
      if (checked) return Array.from(new Set([...current, ...visibleIndexes]));
      return current.filter((index) => !visibleIndexes.includes(index));
    });
  }

  function bulkUpdateAllow(allow: boolean) {
    if (selectedIndexes.length === 0) return;
    onBulkUpdate(selectedIndexes, { allow });
  }

  function bulkRemove() {
    if (selectedIndexes.length === 0) return;
    onBulkRemove(selectedIndexes);
    setSelectedIndexes([]);
  }

  function removeOne(index: number) {
    onRemove(index);
    setSelectedIndexes((current) => current.filter((item) => item !== index).map((item) => (item > index ? item - 1 : item)));
  }

  return (
    <section className="surface rounded-lg">
      <div className="border-b border-[var(--line)] px-4 py-3">
        <h2 className="text-lg font-bold">{t("admin.directPermissions")} ({entries.length})</h2>
      </div>
      <div className="flex flex-wrap items-center gap-2 border-b border-[var(--line)] px-4 py-3 text-sm">
        <span className="font-semibold text-[var(--muted)]">{t("admin.selectedCount", { count: selectedIndexes.length })}</span>
        <button className="button-secondary focus-ring px-3 py-2" disabled={selectedIndexes.length === 0} type="button" onClick={() => bulkUpdateAllow(true)}>
          {t("admin.bulkSetTrue")}
        </button>
        <button className="button-secondary focus-ring px-3 py-2" disabled={selectedIndexes.length === 0} type="button" onClick={() => bulkUpdateAllow(false)}>
          {t("admin.bulkSetFalse")}
        </button>
        <button className="button-secondary focus-ring border-red-500/40 px-3 py-2 text-red-600" disabled={selectedIndexes.length === 0} type="button" onClick={bulkRemove}>
          {t("admin.bulkDelete")}
        </button>
      </div>
      <div className="grid gap-4 p-4 xl:grid-cols-[160px_1fr]">
        <div className="grid h-fit gap-2">
          <button
            className={`focus-ring rounded-md border border-[var(--line)] px-3 py-2 text-left text-sm font-semibold ${
              selectedModule === "all" ? "bg-[var(--accent)] text-[var(--on-accent)]" : "hover:bg-[var(--panel-subtle)]"
            }`}
            type="button"
            onClick={() => onModuleChange("all")}
          >
            {t("admin.moduleAll")}
          </button>
          {modules.map((module) => (
            <button
              key={module}
              className={`focus-ring rounded-md border border-[var(--line)] px-3 py-2 text-left text-sm font-semibold ${
                selectedModule === module ? "bg-[var(--accent)] text-[var(--on-accent)]" : "hover:bg-[var(--panel-subtle)]"
              }`}
              type="button"
              onClick={() => onModuleChange(module)}
            >
              {module}
            </button>
          ))}
        </div>
        <div className="max-h-[520px] overflow-auto">
          <table className="w-full min-w-[760px] border-separate border-spacing-0 text-left text-sm">
            <thead className="text-[var(--muted)]">
              <tr>
                <th className="border-b border-[var(--line)] px-3 py-3">
                  <input
                    checked={visibleRows.length > 0 && visibleRows.every((entry) => selectedIndexes.includes(entry.index))}
                    type="checkbox"
                    onChange={(event) => setVisibleSelection(event.target.checked)}
                  />
                </th>
                <th className="border-b border-[var(--line)] px-3 py-3">{t("admin.permission")}</th>
                <th className="border-b border-[var(--line)] px-3 py-3">{t("admin.value")}</th>
                <th className="border-b border-[var(--line)] px-3 py-3">{t("admin.expiresAt")}</th>
                <th className="border-b border-[var(--line)] px-3 py-3">{t("admin.description")}</th>
                <th className="border-b border-[var(--line)] px-3 py-3">{t("admin.operation")}</th>
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((entry) => (
                <tr key={`user-permission-${entry.index}`} className="hover:bg-[var(--panel-subtle)]">
                  <td className="border-b border-[var(--line)] px-3 py-3">
                    <input checked={selectedIndexes.includes(entry.index)} type="checkbox" onChange={() => toggleSelection(entry.index)} />
                  </td>
                  <td className="border-b border-[var(--line)] px-3 py-3">
                    <input
                      className="field px-3 py-2 font-mono"
                      onChange={(event) => onUpdate(entry.index, { code: event.target.value.trim() })}
                      value={entry.code}
                    />
                  </td>
                  <td className="border-b border-[var(--line)] px-3 py-3">
                    <button
                      className={`focus-ring rounded-md px-3 py-2 font-mono font-bold ${
                        entry.allow ? "bg-[var(--panel-subtle)] text-[var(--accent)]" : "bg-[var(--panel-subtle)] text-[var(--red)]"
                      }`}
                      type="button"
                      onClick={() => onUpdate(entry.index, { allow: !entry.allow })}
                    >
                      {entry.allow ? "true" : "false"}
                    </button>
                  </td>
                  <td className="border-b border-[var(--line)] px-3 py-3">
                    <label className="grid gap-1">
                      <span className="text-xs font-semibold text-[var(--muted)]">{entry.expiresAt ? t("admin.expireTime") : t("admin.neverExpires")}</span>
                      <input
                        className="field px-3 py-2"
                        onChange={(event) => onUpdate(entry.index, { expiresAt: event.target.value })}
                        title={t("admin.emptyDateMeansNever")}
                        type="date"
                        value={entry.expiresAt ? entry.expiresAt.slice(0, 10) : ""}
                      />
                    </label>
                  </td>
                  <td className="border-b border-[var(--line)] px-3 py-3 text-[var(--muted)]">
                    <span className="block font-semibold text-[var(--foreground)]">{entry.name}</span>
                    <span className="mt-1 block">{entry.description}</span>
                  </td>
                  <td className="border-b border-[var(--line)] px-3 py-3">
                    <button className="button-secondary focus-ring whitespace-nowrap px-3 py-2" type="button" onClick={() => removeOne(entry.index)}>
                      {t("common.delete")}
                    </button>
                  </td>
                </tr>
              ))}
              {visibleRows.length === 0 ? (
                <tr>
                  <td className="px-3 py-8 text-center text-[var(--muted)]" colSpan={6}>
                    {t("admin.noPermissionNodesInFilter")}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
      {children}
    </section>
  );
}

function ParentRolePicker({
  roles,
  value,
  onChange,
}: {
  roles: Role[];
  value: string[];
  onChange: (roles: string[]) => void;
}) {
  const { locale } = useI18n();
  const [open, setOpen] = useState(false);

  function commit(nextValue: string) {
    onChange(splitCodes(nextValue));
  }

  function toggleRole(roleCode: string) {
    const next = value.includes(roleCode) ? value.filter((code) => code !== roleCode) : [...value, roleCode];
    onChange(next);
  }

  return (
    <div className="relative mt-2">
      <input
        className="field font-mono"
        onBlur={() => window.setTimeout(() => setOpen(false), 120)}
        onChange={(event) => commit(event.target.value)}
        onFocus={() => setOpen(true)}
        placeholder="project_editor.[ProjectID], moderator"
        value={value.join(", ")}
      />
      {open ? (
        <div className="absolute z-20 mt-2 max-h-72 w-full overflow-y-auto rounded-lg border border-[var(--line)] bg-[var(--panel)] shadow-xl">
          {roles.map((role) => {
            const selected = value.includes(role.code);
            const roleText = localizedText(role, locale);
            return (
              <button
                key={role.code}
                className={`grid w-full gap-1 px-4 py-3 text-left hover:bg-[var(--panel-subtle)] ${
                  selected ? "bg-[var(--accent)]/15" : ""
                }`}
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => toggleRole(role.code)}
              >
                <span className="font-mono font-bold">{role.code}</span>
                <span className="text-sm text-[var(--muted)]">{roleText.name || roleText.description}</span>
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

function PermissionBulkAdder({
  allow,
  description,
  expiresAt,
  input,
  name,
  permissions,
  selectedCodes,
  onAdd,
  onAllowChange,
  onDescriptionChange,
  onExpiresAtChange,
  onInputChange,
  onNameChange,
}: {
  allow: boolean;
  description: string;
  expiresAt: string;
  input: string;
  name: string;
  permissions: Permission[];
  selectedCodes: string[];
  onAdd: () => void;
  onAllowChange: (value: boolean) => void;
  onDescriptionChange: (value: string) => void;
  onExpiresAtChange: (value: string) => void;
  onInputChange: (value: string) => void;
  onNameChange: (value: string) => void;
}) {
  const { locale, t } = useI18n();
  const [pickerOpen, setPickerOpen] = useState(false);
  const selected = parsePermissionInput(input);
  const suggestions = permissionSuggestions(permissions, input, selectedCodes, locale);

  function appendPermission(code: string) {
    const next = Array.from(new Set([...selected, code])).join("\n");
    onInputChange(next);
  }

  function removePermission(code: string) {
    onInputChange(selected.filter((item) => item !== code).join("\n"));
  }

  function togglePermission(code: string) {
    if (selected.includes(code)) {
      removePermission(code);
      return;
    }
    appendPermission(code);
  }

  return (
    <div className="grid gap-3 border-t border-[var(--line)] bg-[var(--panel-muted)] p-4">
      <div className="relative">
        {pickerOpen && suggestions.length > 0 ? (
          <div className="absolute bottom-full left-0 z-30 max-h-[50vh] w-full overflow-y-auto rounded-t-lg border border-[var(--line)] bg-[var(--panel)] shadow-2xl md:w-[min(760px,100%)]">
            {suggestions.map((permission) => {
              const isSelected = selected.includes(permission.code);
              const permissionText = localizedText(permission, locale);
              return (
                <button
                  key={permission.code}
                  className={`grid w-full grid-cols-[1fr_auto] items-center gap-3 border-b border-[var(--line)] px-4 py-3 text-left last:border-b-0 ${
                    isSelected ? "bg-[#9be33b] text-black" : "hover:bg-[var(--panel-subtle)]"
                  }`}
                  type="button"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => togglePermission(permission.code)}
                >
                  <span>
                    <span className="block font-mono text-sm font-bold md:text-base">{permission.code}</span>
                    <span className={isSelected ? "text-black/60" : "text-[var(--muted)]"}>
                      {permissionText.description || permissionText.name}
                    </span>
                  </span>
                  {isSelected ? <span className="font-mono text-sm font-bold">{t("admin.selected")}</span> : null}
                </button>
              );
            })}
          </div>
        ) : null}

        <div className="rounded-lg border border-[var(--line)] bg-[var(--panel-subtle)] p-2 shadow-inner">
          {selected.length > 0 ? (
            <div className="mb-2 flex max-h-28 flex-wrap gap-2 overflow-y-auto">
              {selected.map((code) => (
                <button
                  key={code}
                  className="rounded bg-black/20 px-2.5 py-1 font-mono text-sm text-[var(--text)] hover:bg-black/30"
                  type="button"
                  onClick={() => removePermission(code)}
                >
                  {code} <span className="text-[var(--muted)]">x</span>
                </button>
              ))}
            </div>
          ) : null}
          <textarea
            className="min-h-24 w-full resize-y bg-transparent px-2 py-2 font-mono text-sm outline-none placeholder:text-[var(--muted)]"
            onBlur={() => window.setTimeout(() => setPickerOpen(false), 120)}
            onChange={(event) => {
              setPickerOpen(true);
              onInputChange(event.target.value);
            }}
            onFocus={() => setPickerOpen(true)}
            placeholder={t("admin.permissionBulkPlaceholder")}
            value={input}
          />
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-[160px_180px_1fr_1fr_auto]">
        <div className="grid grid-cols-2 gap-2">
          <button className={`focus-ring rounded-md px-3 py-2 font-mono font-bold ${allow ? "bg-[var(--accent)] text-[var(--on-accent)]" : "button-secondary"}`} type="button" onClick={() => onAllowChange(true)}>
            true
          </button>
          <button className={`focus-ring rounded-md px-3 py-2 font-mono font-bold ${!allow ? "bg-[var(--red)] text-white" : "button-secondary"}`} type="button" onClick={() => onAllowChange(false)}>
            false
          </button>
        </div>
        <input className="field" type="date" value={expiresAt} onChange={(event) => onExpiresAtChange(event.target.value)} />
        <input className="field" placeholder={t("admin.permissionNamePlaceholder")} value={name} onChange={(event) => onNameChange(event.target.value)} />
        <input className="field" placeholder={t("admin.permissionDescriptionPlaceholder")} value={description} onChange={(event) => onDescriptionChange(event.target.value)} />
        <button className="button-primary focus-ring" type="button" onClick={onAdd}>
          {t("common.create")}
        </button>
      </div>
    </div>
  );
}

function PermissionCatalogEditor({
  catalog,
  token,
  refreshCatalog,
}: {
  catalog: PermissionCatalog;
  token: string;
  refreshCatalog: () => Promise<void>;
}) {
  const { locale, t } = useI18n();
  const [query, setQuery] = useState("");
  const [draft, setDraft] = useState<Permission[]>(() =>
    catalog.permissions.map((permission) => ({
      ...permission,
      translations: normalizeLocalizedTexts(permission.translations),
    })),
  );
  const [sourceLocale, setSourceLocale] = useState<Locale>("zh-CN");
  const [targetLocale, setTargetLocale] = useState<Locale>(locale);
  const [saving, setSaving] = useState(false);
  const [aiCompleting, setAICompleting] = useState(false);
  const [message, setMessage] = useState("");
  const editVersion = useRef(0);
  useEffect(() => () => { editVersion.current += 1; }, [token]);

  const visible = draft.filter((permission) => {
    const keyword = query.trim().toLowerCase();
    if (!keyword) return true;
    const source = editableLocalizedText(permission, sourceLocale);
    const target = editableLocalizedText(permission, targetLocale);
    return `${permission.code} ${permission.module} ${permission.name} ${permission.description} ${source.name} ${source.description} ${target.name} ${target.description}`
      .toLowerCase()
      .includes(keyword);
  });

  function updatePermissionDraft(code: string, patch: Partial<Permission>) {
    editVersion.current += 1;
    setDraft((current) => current.map((permission) => (permission.code === code ? { ...permission, ...patch } : permission)));
  }

  async function savePermissions() {
    if (!token) {
      setMessage(t("admin.permissionLoginRequired"));
      return;
    }
    setSaving(true);
    setMessage("");
    try {
      for (const permission of draft) {
        await apiRequest<{ ok: boolean }>(
          "/api/v1/admin/permissions",
          {
            method: "POST",
            body: JSON.stringify({
              code: permission.code,
              module: permission.module.trim() || permissionModule(permission.code),
              name: withFallbackLocalizedText(permission).name,
              description: withFallbackLocalizedText(permission).description,
              translations: normalizeLocalizedTexts(permission.translations),
            }),
          },
          token,
        );
      }
      await refreshCatalog();
      setMessage(t("admin.permissionListSaved"));
    } catch (error) {
      setMessage(cleanError(error));
    } finally {
      setSaving(false);
    }
  }

  async function completePermissionTranslations() {
    if (sourceLocale === targetLocale) {
      notifyAdminNotice(t("admin.ai.sameLanguage"), t("admin.noticeTitle"), "danger");
      return;
    }
    const candidates = visible.filter((permission) => {
      const target = editableLocalizedText(permission, targetLocale);
      const source = editableLocalizedText(permission, sourceLocale);
      return (target.name.trim() === "" && source.name.trim() !== "") || (target.description.trim() === "" && source.description.trim() !== "");
    }).slice(0, 100);
    if (candidates.length === 0) {
      notifyAdminNotice(t("admin.ai.noMissingTranslations"));
      return;
    }
    const requestedEditVersion = editVersion.current;
    setAICompleting(true);
    try {
      const result = await runAITranslationTask(token, aiTranslationTaskTypes.permission, {
        sourceLocale,
        targetLocale,
        items: candidates.map((permission) => ({ key: permission.code, ...editableLocalizedText(permission, sourceLocale) })),
      });
      if (requestedEditVersion !== editVersion.current) {
        notifyAdminNotice(t("admin.ai.protectedEdits"));
        return;
      }
      const translated = new Map((result.items ?? []).map((item) => [item.key, item]));
      let completed = 0;
      const nextDraft = draft.map((permission) => {
        const item = translated.get(permission.code);
        if (!item) return permission;
        const target = editableLocalizedText(permission, targetLocale);
        const source = editableLocalizedText(permission, sourceLocale);
        const suggestedName = item.name?.trim() || "";
        const suggestedDescription = item.description?.trim() || "";
        const name = target.name || (source.name.trim() && hasSameI18nPlaceholders(source.name, suggestedName) ? suggestedName : "");
        const description = target.description || (source.description.trim() && hasSameI18nPlaceholders(source.description, suggestedDescription) ? suggestedDescription : "");
        if (name === target.name && description === target.description) return permission;
        completed += 1;
        return {
          ...permission,
          translations: setLocalizedText(permission.translations, targetLocale, { name, description }),
        };
      });
      setDraft(nextDraft);
      notifyAdminNotice(t("admin.ai.translationCompleted", { count: completed }));
    } catch (error) {
      notifyAdminNotice(cleanError(error), t("admin.noticeTitle"), "danger");
    } finally {
      setAICompleting(false);
    }
  }

  return (
    <section className="surface flex min-h-[calc(100vh-8rem)] flex-col rounded-lg p-4">
      <div className="mb-3 grid gap-3 xl:grid-cols-[minmax(220px,1fr)_auto] xl:items-center">
        <div className="min-w-0">
          <h2 className="text-lg font-bold">{t("admin.permissionList")}</h2>
          <p className="text-sm text-[var(--muted)]">{t("admin.permissionListI18nDesc")}</p>
        </div>
        <div className="grid min-w-0 gap-2 sm:grid-cols-[minmax(180px,1fr)_auto_auto_auto_auto] sm:items-center xl:min-w-[940px]">
          <input className="field min-w-0" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("admin.searchPermission")} />
          <select className="field w-auto py-2" value={sourceLocale} onChange={(event) => setSourceLocale(event.target.value as Locale)}>
            {supportedLocales.map((item) => (
              <option key={item.code} value={item.code}>
                {t("admin.sourceLanguage")}: {item.label}
              </option>
            ))}
          </select>
          <select className="field w-auto py-2" value={targetLocale} onChange={(event) => setTargetLocale(event.target.value as Locale)}>
            {supportedLocales.map((item) => (
              <option key={item.code} value={item.code}>
                {t("admin.targetLanguage")}: {item.label}
              </option>
            ))}
          </select>
          <button className="button-secondary focus-ring whitespace-nowrap" disabled={aiCompleting} type="button" onClick={completePermissionTranslations}>
            {aiCompleting ? t("admin.ai.completingTranslation") : t("admin.ai.completeTranslation")}
          </button>
          <button className="button-primary focus-ring" disabled={saving} type="button" onClick={savePermissions}>
            {saving ? t("admin.saving") : t("admin.savePermissionList")}
          </button>
        </div>
      </div>
      {message ? <InlineMessage text={message} /> : null}
      <div className="min-h-0 flex-1 overflow-y-auto pr-1">
        <div className="sticky top-0 z-10 grid gap-2 border-b border-[var(--line)] bg-[var(--panel)] py-3 text-xs font-bold uppercase text-[var(--muted)] lg:grid-cols-[1.2fr_140px_1.2fr_1.2fr_1.5fr]">
          <div>{t("admin.permissionNodes")}</div>
          <div>{t("admin.module")}</div>
          <div>{sourceLocale} {t("admin.reference")}</div>
          <div>{targetLocale} {t("admin.displayName")}</div>
          <div>{targetLocale} {t("admin.description")}</div>
        </div>
        {visible.map((permission) => (
          <div
            key={permission.code}
            className="grid gap-2 border-b border-[var(--line)] py-3 last:border-b-0 lg:grid-cols-[1.2fr_140px_1.2fr_1.2fr_1.5fr]"
          >
            <div className="font-mono text-sm font-bold">{permission.code}</div>
            <input
              className="field px-3 py-2"
              value={permission.module}
              onChange={(event) => updatePermissionDraft(permission.code, { module: event.target.value })}
            />
            <div className="rounded-md bg-[var(--panel-subtle)] px-3 py-2 text-sm text-[var(--muted)]">
              <span className="block font-semibold text-[var(--foreground)]">
                {editableLocalizedText(permission, sourceLocale).name || t("admin.emptyTranslation")}
              </span>
              <span className="mt-1 block">
                {editableLocalizedText(permission, sourceLocale).description || t("admin.emptyTranslation")}
              </span>
            </div>
            <input
              key={`${targetLocale}:${permission.code}:name`}
              className="field px-3 py-2"
              value={editableLocalizedText(permission, targetLocale).name}
              onChange={(event) =>
                updatePermissionDraft(permission.code, {
                  translations: setLocalizedText(permission.translations, targetLocale, { name: event.target.value }),
                })
              }
            />
            <input
              key={`${targetLocale}:${permission.code}:description`}
              className="field px-3 py-2"
              value={editableLocalizedText(permission, targetLocale).description}
              onChange={(event) =>
                updatePermissionDraft(permission.code, {
                  translations: setLocalizedText(permission.translations, targetLocale, { description: event.target.value }),
                })
              }
            />
          </div>
        ))}
      </div>
    </section>
  );
}

function UserRolePanel({
  catalog,
  token,
  users,
  refreshUsers,
}: {
  catalog: PermissionCatalog;
  token: string;
  users: User[];
  refreshUsers: () => Promise<void>;
}) {
  const { locale, t } = useI18n();
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const selectedUser = users.find((user) => user.id === selectedUserId) ?? users[0] ?? null;
  const userId = selectedUser?.id;
  const identity = `${token}:${userId ?? ""}`;
  const [loadedIdentity, setLoadedIdentity] = useState<string>();
  const [loadAttempt, setLoadAttempt] = useState(0);
  const selectionVersion = useRef(0);
  const savePending = useRef(false);
  const [details, setDetails] = useState<UserPermissionDetails | null>(null);
  const [draft, setDraft] = useState<UserPermissionEntry[]>([]);
  const [bulkPermissionInput, setBulkPermissionInput] = useState("");
  const [bulkPermissionAllow, setBulkPermissionAllow] = useState(true);
  const [bulkPermissionExpiresAt, setBulkPermissionExpiresAt] = useState("");
  const [bulkPermissionName, setBulkPermissionName] = useState("");
  const [bulkPermissionDescription, setBulkPermissionDescription] = useState("");
  const [selectedModule, setSelectedModule] = useState("all");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!token || !userId) return;
    let cancelled = false;
    async function loadUserPermissions() {
      try {
        const data = await apiRequest<UserPermissionDetails>(
          `/api/v1/admin/users/${userId}/permissions`,
          {},
          token,
        );
        if (!cancelled) {
          setLoadedIdentity(identity);
          setMessage("");
          setDetails(data);
          setDraft([
            ...data.roleBindings.filter((binding) => binding.editable).map((binding) => ({
              code: binding.code,
              allow: true,
              expiresAt: binding.expiresAt,
              source: binding.source,
              editable: true,
            })),
            ...data.directPermissions.filter((permission) => permission.editable).map((permission) => ({
              code: permission.code,
              allow: permission.allow,
              expiresAt: permission.expiresAt,
              source: permission.source,
              editable: true,
            })),
          ]);
        }
      } catch (error) {
        if (!cancelled) setMessage(cleanError(error));
      }
    }
    loadUserPermissions();
    return () => {
      cancelled = true;
    };
  }, [identity, loadAttempt, userId, token]);

  async function saveUserPermissions() {
    if (!selectedUser || loadedIdentity !== identity || savePending.current) return;
    if (!token) {
      setMessage(t("admin.permissionLoginRequired"));
      return;
    }
    savePending.current = true;
    const requestedSelectionVersion = selectionVersion.current;
    setSaving(true);
    setMessage("");
    try {
      await apiRequest<{ ok: boolean }>(
        `/api/v1/admin/users/${selectedUser.id}/permissions`,
        { method: "PUT", body: JSON.stringify({ permissions: draft }) },
        token,
      );
      await refreshUsers();
      if (requestedSelectionVersion === selectionVersion.current) setMessage(t("admin.userPermissionsSaved"));
    } catch (error) {
      if (requestedSelectionVersion === selectionVersion.current) setMessage(cleanError(error));
    } finally {
      savePending.current = false;
      setSaving(false);
    }
  }

  async function addUserPermissionEntriesFromInput() {
    if (!token) {
      setMessage(t("admin.permissionLoginRequired"));
      return;
    }
    const codes = parsePermissionInput(bulkPermissionInput).filter((code) => !code.includes("[") && !code.includes("]"));
    if (codes.length === 0) {
      setMessage(t("admin.userPermissionInputRequired"));
      return;
    }
    const existingCodes = new Set(catalog.permissions.map((permission) => permission.code));
    const currentCodes = new Set(draft.map((permission) => permission.code));
    try {
      for (const code of codes) {
        if (code.startsWith("group.")) continue;
        if (!existingCodes.has(code)) {
          await apiRequest<{ ok: boolean }>(
            "/api/v1/admin/permissions",
            {
              method: "POST",
              body: JSON.stringify(buildNewPermissionPayload(code, bulkPermissionName, bulkPermissionDescription, locale)),
            },
            token,
          );
        }
      }
      setDraft((current) => [
        ...current,
        ...codes
          .filter((code) => !currentCodes.has(code))
          .map((code) => ({ code, allow: bulkPermissionAllow, expiresAt: bulkPermissionExpiresAt })),
      ]);
      setBulkPermissionInput("");
      setBulkPermissionName("");
      setBulkPermissionDescription("");
      setMessage(t("admin.userPermissionAdded"));
    } catch (error) {
      setMessage(cleanError(error));
    }
  }

  const roleNameMap = new Map(catalog.roles.map((role) => [role.code, role.name || role.code]));
  const assignedRoleCodes = Array.from(
    new Set([
      ...(selectedUser?.roleCodes ?? []),
      ...draft.filter((permission) => permission.code.startsWith("group.")).map((permission) => permission.code.slice("group.".length)),
    ]),
  ).filter(Boolean);
  const protectedBindings = details
    ? [...details.roleBindings, ...details.directPermissions].filter((entry) => !entry.editable)
    : [];

  function bulkUpdateUserPermissionDraft(indexes: number[], patch: Partial<UserPermissionEntry>) {
    const selected = new Set(indexes);
    setDraft((current) => current.map((item, index) => (selected.has(index) ? { ...item, ...patch } : item)));
  }

  function bulkRemoveUserPermissionDraft(indexes: number[]) {
    const selected = new Set(indexes);
    setDraft((current) => current.filter((_, index) => !selected.has(index)));
  }

  return (
    <div className="grid min-h-[calc(100vh-8rem)] gap-4 xl:grid-cols-[220px_minmax(0,1fr)]">
      <section className="surface overflow-hidden rounded-lg">
        <div className="border-b border-[var(--line)] px-4 py-3">
          <h2 className="text-lg font-bold">{t("admin.users")}</h2>
          <p className="text-sm text-[var(--muted)]">{t("admin.userCount", { count: users.length })}</p>
        </div>
        <div className="max-h-[calc(100vh-14rem)] overflow-y-auto">
          {users.map((user) => (
            <button
              key={user.id}
              className={`w-full border-b border-[var(--line)] px-4 py-3 text-left ${
                selectedUser?.id === user.id ? "bg-[var(--panel-subtle)]" : "hover:bg-[var(--panel-subtle)]"
              }`}
              type="button"
              onClick={() => {
                selectionVersion.current += 1;
                setSelectedUserId(user.id);
                setDetails(null);
                setDraft([]);
                setMessage("");
              }}
            >
              <span className="block font-bold">{user.username}</span>
              <span className="mt-1 block text-sm text-[var(--muted)]">ID {user.id}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="surface rounded-lg">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--line)] px-4 py-3">
          <div>
            <p className="text-sm font-semibold text-[var(--muted)]">User</p>
            <h2 className="text-xl font-bold">{selectedUser ? selectedUser.username : t("admin.noUserSelected")}</h2>
            {assignedRoleCodes.length > 0 ? (
              <div className="mt-2 flex flex-wrap gap-2">
                {assignedRoleCodes.map((roleCode) => (
                  <span key={roleCode} className="rounded-md bg-[var(--panel-subtle)] px-2.5 py-1 text-xs font-semibold text-[var(--muted)]">
                    {roleNameMap.get(roleCode) ?? roleCode}
                    <span className="ml-1 font-mono text-[var(--foreground)]">({roleCode})</span>
                  </span>
                ))}
              </div>
            ) : (
              <p className="mt-2 text-sm text-[var(--muted)]">{t("admin.noRoleAssigned")}</p>
            )}
          </div>
          <button className="button-primary focus-ring" disabled={!selectedUser || loadedIdentity !== identity || saving} type="button" onClick={saveUserPermissions}>
            {saving ? t("admin.saving") : t("admin.saveUserPermissions")}
          </button>
        </div>
        {message ? <div className="px-4"><InlineMessage text={message} /></div> : null}
        {loadedIdentity !== identity && selectedUser ? <div className="p-4" role="status"><p>{message || t("common.loading")}</p>{message ? <button className="button-secondary focus-ring mt-2" type="button" onClick={() => { setMessage(""); setLoadAttempt((value) => value + 1); }}>{t("common.retry")}</button> : null}</div> : null}
        <fieldset disabled={loadedIdentity !== identity || saving} className="contents">
      {users.length === 0 ? (
        <EmptyState text={t("admin.noUsers")} />
      ) : (
        <>
          {protectedBindings.length > 0 ? (
            <section className="border-b border-[var(--line)] p-4">
              <h3 className="font-bold">{t("admin.directPermissions")}</h3>
              <div className="mt-3 overflow-auto">
                <table className="w-full min-w-[640px] text-left text-sm">
                  <thead className="text-[var(--muted)]">
                    <tr>
                      <th className="border-b border-[var(--line)] px-3 py-2">{t("admin.permission")}</th>
                      <th className="border-b border-[var(--line)] px-3 py-2">{t("admin.value")}</th>
                      <th className="border-b border-[var(--line)] px-3 py-2">{t("admin.permissionSource")}</th>
                      <th className="border-b border-[var(--line)] px-3 py-2">{t("admin.expiresAt")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {protectedBindings.map((entry) => (
                      <tr key={`${entry.code}:${entry.source}:${entry.sourceKey ?? ""}`}>
                        <td className="border-b border-[var(--line)] px-3 py-2 font-mono">{entry.code}</td>
                        <td className="border-b border-[var(--line)] px-3 py-2 font-mono">{String(entry.allow)}</td>
                        <td className="border-b border-[var(--line)] px-3 py-2">
                          {entry.source}{entry.sourceKey ? ` · ${entry.sourceKey}` : ""}
                        </td>
                        <td className="border-b border-[var(--line)] px-3 py-2">{entry.expiresAt || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ) : null}
          <UserPermissionNodeEditor
            key={`${identity}:${loadAttempt}`}
            entries={draft}
            catalog={catalog}
            selectedModule={selectedModule}
            onModuleChange={setSelectedModule}
            onUpdate={updatePermissionDraft}
            onRemove={(index) => setDraft((current) => current.filter((_, itemIndex) => itemIndex !== index))}
            onBulkUpdate={bulkUpdateUserPermissionDraft}
            onBulkRemove={bulkRemoveUserPermissionDraft}
          >
            <PermissionBulkAdder
              allow={bulkPermissionAllow}
              description={bulkPermissionDescription}
              expiresAt={bulkPermissionExpiresAt}
              input={bulkPermissionInput}
              name={bulkPermissionName}
              permissions={[
                ...catalog.roles.map((role) => ({
                  code: `group.${role.code}`,
                  module: "group",
                  name: localizedText(role, locale).name,
                  description: localizedText(role, locale).description,
                  translations: role.translations,
                })),
                ...catalog.permissions.filter((permission) => !permission.code.includes("[") && !permission.code.includes("]")),
              ]}
              selectedCodes={draft.map((permission) => permission.code)}
              onAdd={addUserPermissionEntriesFromInput}
              onAllowChange={setBulkPermissionAllow}
              onDescriptionChange={setBulkPermissionDescription}
              onExpiresAtChange={setBulkPermissionExpiresAt}
              onInputChange={setBulkPermissionInput}
              onNameChange={setBulkPermissionName}
            />
          </UserPermissionNodeEditor>
          {details ? (
            <div className="border-t border-[var(--line)] p-4 text-sm text-[var(--muted)]">
              {t("admin.effectivePermissions", { count: details.effectivePermissionRules.length })}
            </div>
          ) : null}
        </>
      )}
        </fieldset>
      </section>
    </div>
  );

  function updatePermissionDraft(index: number, patch: Partial<UserPermissionEntry>) {
    setDraft((current) => current.map((item, itemIndex) => (itemIndex === index ? { ...item, ...patch } : item)));
  }
}

export { PermissionGroupEditor, PermissionCatalogEditor, UserRolePanel };
