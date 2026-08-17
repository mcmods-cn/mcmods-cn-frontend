"use client";

import { useEffect, useState } from "react";
import type { CatalogResourceRef } from "../_lib/editor-types";
import {
  modIdentifierFromResource,
  ModResourceSelectionField,
  unresolvedModResource,
} from "./editor/mod-resource-picker";

export function CatalogContainedModFilter({
  values,
  token = "",
  buttonLabel,
  emptyLabel,
  onChange,
}: {
  values: readonly string[];
  token?: string;
  buttonLabel: string;
  emptyLabel: string;
  onChange: (values: string[]) => void;
}) {
  const valuesKey = values.join(",");
  const [selectedMods, setSelectedMods] = useState<CatalogResourceRef[]>(
    () => normalizeModIdentifiers(values).map(unresolvedModResource),
  );

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      const identifiers = normalizeModIdentifiers(valuesKey.split(","));
      setSelectedMods((current) => identifiers.map((identifier) =>
        current.find((resource) => modIdentifierFromResource(resource) === identifier)
        ?? unresolvedModResource(identifier)));
    });
    return () => { cancelled = true; };
  }, [valuesKey]);

  return (
    <ModResourceSelectionField
      buttonLabel={buttonLabel}
      emptyLabel={emptyLabel}
      projectTypes={["mod"]}
      token={token}
      value={selectedMods}
      onChange={(resources) => {
        setSelectedMods(resources);
        onChange(normalizeModIdentifiers(resources.map(modIdentifierFromResource)));
      }}
    />
  );
}

function normalizeModIdentifiers(values: readonly string[]) {
  return [...new Set(values
    .map((identifier) => identifier.trim().toLowerCase())
    .filter(Boolean))];
}
