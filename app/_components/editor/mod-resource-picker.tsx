"use client";

import { useCallback, useState } from "react";
import { apiRequest } from "../../_lib/api";
import type { CatalogResourceRef, ResourcePageLoader } from "../../_lib/editor-types";
import type { BackendModList, BackendModRecord } from "../../_lib/mod-api";
import type { BackendModpackList, BackendModpackRecord } from "../../_lib/modpack-api";
import type { ServerCatalogItem, ServerCatalogResponse } from "../../_lib/server-api";
import { isSimpleProjectType, localizedSimpleProject, type SimpleProjectList, type SimpleProjectRecord, type SimpleProjectType } from "../../_lib/simple-project-api";
import { useI18n } from "../../_lib/i18n-provider";
import {
  ResourcePickerDialog,
  type ResourcePickerLabels,
} from "./resource-picker-dialog";
import { SelectedResourceList } from "./selected-resource-list";

type ModResourcePickerDialogProps = {
  open: boolean;
  token?: string;
  value: readonly CatalogResourceRef[];
  multiple?: boolean;
  excludeSiteId?: string;
  projectTypes?: readonly ProjectResourceType[];
  allowUnresolved?: boolean;
  labels?: ResourcePickerLabels;
  onClose: () => void;
  onConfirm: (resources: CatalogResourceRef[]) => void;
};

type ModResourceSelectionFieldProps = {
  token?: string;
  value: readonly CatalogResourceRef[];
  multiple?: boolean;
  buttonLabel?: string;
  emptyLabel?: string;
  excludeSiteId?: string;
  projectTypes?: readonly ProjectResourceType[];
  onChange: (resources: CatalogResourceRef[]) => void;
};

export type ProjectResourceType = "mod" | "modpack" | "minecraft_server" | SimpleProjectType;

export function ModResourcePickerDialog({
  open,
  token = "",
  value,
  multiple = true,
  excludeSiteId = "",
  projectTypes = ["mod"],
  allowUnresolved = true,
  labels,
  onClose,
  onConfirm,
}: ModResourcePickerDialogProps) {
  const { t } = useI18n();
  const projectTypeKey = projectTypes.join(",");
  const loadModPage = useCallback<ResourcePageLoader>(async (options, requestToken, signal) => {
    const requestedTypes = projectTypeKey.split(",").filter((value): value is ProjectResourceType => value === "mod" || value === "modpack" || value === "minecraft_server" || isSimpleProjectType(value));
    const fetchProjectPage = async (projectType: ProjectResourceType, limit: number, offset: number) => {
      const parameters = new URLSearchParams({ limit: String(limit), offset: String(offset) });
      if (options.query) parameters.set("q", options.query);
      if (projectType === "modpack") {
        const result = await apiRequest<BackendModpackList>(`/api/v1/modpacks?${parameters}`, { signal }, requestToken || undefined);
        return { items: result.items.map(modpackRecordToPickerResource), total: result.total };
      }
      if (projectType === "minecraft_server") {
        parameters.delete("offset");
        parameters.set("page", String(Math.floor(offset / limit) + 1));
        const result = await apiRequest<ServerCatalogResponse>(`/api/v1/servers?${parameters}`, { signal }, requestToken || undefined);
        return { items: result.items.map(serverRecordToPickerResource), total: result.total };
      }
      if (isSimpleProjectType(projectType)) {
        const result = await apiRequest<SimpleProjectList>(`/api/v1/content-projects/${projectType}?${parameters}`, { signal }, requestToken || undefined);
        return { items: result.items.map(simpleProjectRecordToPickerResource), total: result.total };
      }
      const result = await apiRequest<BackendModList>(`/api/v1/mods?${parameters}`, { signal }, requestToken || undefined);
      return { items: result.items.map(modRecordToPickerResource), total: result.total };
    };
    if (requestedTypes.length === 1) {
      const page = await fetchProjectPage(requestedTypes[0], options.limit, options.offset);
      const containsExcluded = page.items.some((item) => item.source?.siteId === excludeSiteId);
      return {
        items: page.items.filter((item) => item.source?.siteId !== excludeSiteId),
        total: Math.max(0, page.total - (containsExcluded ? 1 : 0)),
        limit: options.limit,
        offset: options.offset,
      };
    }
    const counts = await Promise.all(requestedTypes.map((projectType) => fetchProjectPage(projectType, 1, 0)));
    let remainingOffset = options.offset;
    let remainingLimit = options.limit;
    const items: CatalogResourceRef[] = [];
    for (let index = 0; index < requestedTypes.length && remainingLimit > 0; index += 1) {
      const projectTotal = counts[index].total;
      if (remainingOffset >= projectTotal) {
        remainingOffset -= projectTotal;
        continue;
      }
      const page = await fetchProjectPage(requestedTypes[index], remainingLimit, remainingOffset);
      items.push(...page.items);
      remainingLimit -= page.items.length;
      remainingOffset = 0;
    }
    const containsExcluded = items.some((item) => item.source?.siteId === excludeSiteId);
    return {
      items: items.filter((item) => item.source?.siteId !== excludeSiteId),
      total: Math.max(0, counts.reduce((total, result) => total + result.total, 0) - (containsExcluded ? 1 : 0)),
      limit: options.limit,
      offset: options.offset,
    };
  }, [excludeSiteId, projectTypeKey]);
  const defaultLabels: ResourcePickerLabels = {
    title: t("mods.submission.relationshipPicker.title"),
    description: t("mods.submission.relationshipPicker.description"),
    searchPlaceholder: t("mods.submission.relationshipPicker.search"),
    empty: t("mods.submission.relationshipPicker.empty"),
    selected: t("mods.submission.relationshipPicker.selected"),
    notFound: t("mods.submission.relationshipPicker.notFound"),
    manualPrompt: t("mods.submission.relationshipPicker.manualPrompt"),
    manualPlaceholder: "MODID",
    addManualInput: t("mods.submission.relationshipPicker.addInput"),
    backToResults: t("common.back"),
    insert: t("mods.submission.relationshipPicker.insert"),
    invalidIdentifier: t("mods.submission.relationshipPicker.invalid"),
  };

  return (
    <ResourcePickerDialog
      allowUnresolved={allowUnresolved}
      loadPage={loadModPage}
      multiple={multiple}
      open={open}
      token={token}
      unresolvedKind={projectTypes.length === 1 ? projectTypes[0] : "mod"}
      unresolvedRegistry={projectTypes.length === 1 ? projectTypes[0] : "mods"}
      value={value}
      validateUnresolved={validModIdentifier}
      labels={{ ...defaultLabels, ...labels }}
      onClose={onClose}
      onConfirm={onConfirm}
    />
  );
}

export function ModResourceSelectionField({
  token = "",
  value,
  multiple = true,
  buttonLabel,
  emptyLabel,
  excludeSiteId,
  projectTypes = ["mod"],
  onChange,
}: ModResourceSelectionFieldProps) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  return (
    <div className="grid gap-3">
      <SelectedResourceList
        items={value}
        labels={{ empty: emptyLabel ?? t("mods.submission.relationshipPicker.empty") }}
        onRemove={(resource) => onChange(value.filter((item) => item.publicId !== resource.publicId))}
      />
      <button className="button-secondary focus-ring justify-self-start" type="button" onClick={() => setOpen(true)}>
        {buttonLabel ?? t("mods.submission.relationshipPicker.title")}
      </button>
      <ModResourcePickerDialog
        excludeSiteId={excludeSiteId}
        projectTypes={projectTypes}
        multiple={multiple}
        open={open}
        token={token}
        value={value}
        onClose={() => setOpen(false)}
        onConfirm={(resources) => {
          onChange(resources);
          setOpen(false);
        }}
      />
    </div>
  );
}

function simpleProjectRecordToPickerResource(project: SimpleProjectRecord): CatalogResourceRef {
  const localization = localizedSimpleProject(project, project.defaultLocale);
  return {
    publicId: project.id,
    id: project.siteId,
    registry: project.projectType,
    kind: project.projectType,
    names: Object.fromEntries(project.localizations.filter((item) => item.name).map((item) => [item.locale, item.name])),
    resolvedName: localization.name || project.siteId,
    iconUrl: project.iconUrl,
    source: { publicId: project.id, siteId: project.siteId, name: localization.name || project.siteId },
  };
}

function modpackRecordToPickerResource(modpack: BackendModpackRecord): CatalogResourceRef {
  return {
    publicId: modpack.id,
    id: modpack.siteId,
    registry: "modpacks",
    kind: "modpack",
    names: { [modpack.defaultLocale]: modpack.secondaryName || modpack.primaryName },
    resolvedName: modpack.secondaryName || modpack.primaryName,
    iconUrl: modpack.iconUrl,
    source: { publicId: modpack.id, siteId: modpack.siteId, name: modpack.primaryName },
  };
}

function modRecordToPickerResource(mod: BackendModRecord): CatalogResourceRef {
  return {
    publicId: mod.id,
    id: mod.modIds.find((item) => item.primary)?.identifier || mod.modIds[0]?.identifier || mod.siteId,
    registry: "mods",
    kind: "mod",
    names: Object.fromEntries(mod.localizations.filter((item) => item.name).map((item) => [item.locale, item.name])),
    resolvedName: mod.secondaryName || mod.primaryName,
    iconUrl: mod.iconUrl,
    source: { publicId: mod.id, siteId: mod.siteId, name: mod.primaryName },
  };
}

function serverRecordToPickerResource(server: ServerCatalogItem): CatalogResourceRef {
  return {
    publicId: server.id,
    id: server.id,
    registry: "minecraft_server",
    kind: "minecraft_server",
    names: {},
    resolvedName: server.name,
    iconUrl: server.iconDataUri,
    source: { publicId: server.id, siteId: server.id, name: server.name },
  };
}

export function unresolvedModResource(identifier: string): CatalogResourceRef {
  const normalized = identifier.trim().toLowerCase();
  return {
    publicId: `unresolved:mod:${normalized}`,
    id: normalized,
    registry: "mods",
    kind: "mod",
    names: {},
    unresolved: true,
    rawIdentifier: normalized,
  };
}

export function modIdentifierFromResource(resource: CatalogResourceRef) {
  return (resource.rawIdentifier || resource.id).trim().toLowerCase();
}

export function validModIdentifier(identifier: string) {
  return /^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/.test(identifier);
}
