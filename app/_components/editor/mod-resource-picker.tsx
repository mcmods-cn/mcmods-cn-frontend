"use client";

import { useCallback, useState } from "react";
import { apiRequest } from "../../_lib/api";
import type { CatalogResourceRef } from "../../_lib/editor-types";
import type { BackendModList, BackendModRecord } from "../../_lib/mod-api";
import { useI18n } from "../../_lib/i18n-provider";
import {
  ResourcePickerDialog,
  type ResourcePageLoader,
  type ResourcePickerLabels,
} from "./resource-picker-dialog";
import { SelectedResourceList } from "./selected-resource-list";

type ModResourcePickerDialogProps = {
  open: boolean;
  token?: string;
  value: readonly CatalogResourceRef[];
  multiple?: boolean;
  excludeSiteId?: string;
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
  onChange: (resources: CatalogResourceRef[]) => void;
};

export function ModResourcePickerDialog({
  open,
  token = "",
  value,
  multiple = true,
  excludeSiteId = "",
  labels,
  onClose,
  onConfirm,
}: ModResourcePickerDialogProps) {
  const { t } = useI18n();
  const loadModPage = useCallback<ResourcePageLoader>(async (options, requestToken, signal) => {
    const parameters = new URLSearchParams({
      limit: String(options.limit),
      offset: String(options.offset),
    });
    if (options.query) parameters.set("q", options.query);
    const result = await apiRequest<BackendModList>(
      `/api/v1/mods?${parameters}`,
      { signal },
      requestToken || undefined,
    );
    const containsExcluded = result.items.some((item) => item.siteId === excludeSiteId);
    return {
      items: result.items
        .filter((item) => item.siteId !== excludeSiteId)
        .map(modRecordToPickerResource),
      total: Math.max(0, result.total - (containsExcluded ? 1 : 0)),
      limit: options.limit,
      offset: options.offset,
    };
  }, [excludeSiteId]);
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
      allowUnresolved
      loadPage={loadModPage}
      multiple={multiple}
      open={open}
      token={token}
      unresolvedKind="mod"
      unresolvedRegistry="mods"
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

export function modRecordToPickerResource(mod: BackendModRecord): CatalogResourceRef {
  return {
    publicId: mod.id,
    id: mod.modIds.find((item) => item.primary)?.identifier || mod.modId || mod.siteId,
    registry: "mods",
    kind: "mod",
    names: Object.fromEntries(mod.localizations.filter((item) => item.name).map((item) => [item.locale, item.name])),
    resolvedName: mod.secondaryName || mod.primaryName,
    iconUrl: mod.iconUrl,
    source: { publicId: mod.id, siteId: mod.siteId, name: mod.primaryName },
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
