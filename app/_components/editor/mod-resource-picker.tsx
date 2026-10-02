"use client";

import { useCallback, useState } from "react";
import { apiRequest } from "../../_lib/api";
import type { CatalogResourceRef, ResourcePageLoader } from "../../_lib/editor-types";
import type { BackendModList, BackendModRecord } from "../../_lib/mod-api";
import type { BackendModpackCard, BackendModpackList } from "../../_lib/modpack-api";
import type { ServerCatalogItem, ServerCatalogResponse } from "../../_lib/server-api";
import { loadCompositeProjectPage, type ProjectResourceSourcePage } from "../../_lib/project-resource-pagination.mts";
import { isSimpleProjectType, localizedSimpleProject, type SimpleProjectCard, type SimpleProjectList, type SimpleProjectType } from "../../_lib/simple-project-api";
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
  const { locale, t } = useI18n();
  const projectTypeKey = projectTypes.join(",");
  const loadModPage = useCallback<ResourcePageLoader>(async (options, requestToken, signal) => {
    const requestedTypes = projectTypeKey.split(",").filter((value): value is ProjectResourceType => value === "mod" || value === "modpack" || value === "minecraft_server" || isSimpleProjectType(value));
    const fetchProjectPage = async (projectType: ProjectResourceType, limit: number, offset: number, cursor = ""): Promise<ProjectResourceSourcePage<CatalogResourceRef>> => {
      const parameters = new URLSearchParams({ limit: String(limit) });
      if (options.query) parameters.set("q", options.query);
      if (excludeSiteId) parameters.set("excludeSiteId", excludeSiteId);
      if (projectType === "modpack") {
        parameters.set("offset", String(offset));
        const result = await apiRequest<BackendModpackList>(`/api/v1/modpacks?${parameters}`, { signal }, requestToken || undefined);
        return { items: result.items.map(modpackRecordToPickerResource), total: result.total };
      }
      if (projectType === "minecraft_server") {
        if (cursor) parameters.set("cursor", cursor);
        const result = await apiRequest<ServerCatalogResponse>(`/api/v1/servers?${parameters}`, { signal }, requestToken || undefined);
        return {
          items: result.items.map(serverRecordToPickerResource),
          hasMore: result.hasMore,
          nextCursor: result.nextCursor,
        };
      }
      if (isSimpleProjectType(projectType)) {
        parameters.set("offset", String(offset));
        parameters.set("locale", locale);
        const result = await apiRequest<SimpleProjectList>(`/api/v1/content-projects/${projectType}?${parameters}`, { signal }, requestToken || undefined);
        return { items: result.items.map(simpleProjectRecordToPickerResource), total: result.total };
      }
      parameters.set("offset", String(offset));
      const result = await apiRequest<BackendModList>(`/api/v1/mods?${parameters}`, { signal }, requestToken || undefined);
      return { items: result.items.map(modRecordToPickerResource), total: result.total };
    };
    if (requestedTypes.length === 1) {
      const page = await fetchProjectPage(requestedTypes[0], options.limit, options.offset, options.cursor);
      return {
        items: page.items,
        total: page.total ?? 0,
        limit: options.limit,
        offset: options.offset,
        hasMore: page.hasMore,
        nextCursor: page.nextCursor,
      };
    }
    const scope = JSON.stringify([requestedTypes, options.query, excludeSiteId, locale]);
    const page = await loadCompositeProjectPage(requestedTypes, scope, options.limit, options.cursor ?? "", fetchProjectPage);
    return {
      items: page.items,
      total: 0,
      limit: options.limit,
      offset: options.offset,
      hasMore: page.hasMore,
      nextCursor: page.nextCursor,
    };
  }, [excludeSiteId, locale, projectTypeKey]);
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

function simpleProjectRecordToPickerResource(project: SimpleProjectCard): CatalogResourceRef {
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

function modpackRecordToPickerResource(modpack: BackendModpackCard): CatalogResourceRef {
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
