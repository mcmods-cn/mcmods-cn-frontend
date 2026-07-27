"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { apiRequest } from "../_lib/api";
import { loadModContentSections } from "../_lib/mod-content-api";
import { getModExportEntryDetail, type ModExportRevision } from "../_lib/mod-export-api";
import { useI18n } from "../_lib/i18n-provider";

const legacyCategoryTemplates: Record<string, string> = {
  itemsBlocks: "item_block",
  fluids: "fluid",
  dimensions: "dimension",
  biomes: "biome",
  entities: "entity",
  enchantments: "enchantment",
  buffs: "mob_effect",
  naturalGeneration: "natural_generation",
  worldStructures: "world_structure",
  keybinds: "key_mapping",
  achievements: "advancement",
  industrialMedia: "chemical",
  multiblocks: "multiblock",
  commands: "command",
  skills: "skill",
  elements: "element",
};

type LegacyEntry = {
  entityId?: string;
  registry?: string;
  objectId?: string;
};

export function LegacyModDataRedirect({
  siteId,
  revisionId,
  category,
  entry,
}: {
  siteId: string;
  revisionId: string;
  category: string;
  entry?: LegacyEntry;
}) {
  const router = useRouter();
  const { locale, t } = useI18n();
  const [failed, setFailed] = useState(false);
  const entryEntityId = entry?.entityId || "";
  const entryRegistry = entry?.registry || "";
  const entryObjectId = entry?.objectId || "";
  const hasEntry = Boolean(entry);

  useEffect(() => {
    let cancelled = false;
    async function resolveCanonicalURL() {
      const [revisionResult, sections] = await Promise.all([
        apiRequest<{ items: ModExportRevision[] }>(`/api/v1/mods/${encodeURIComponent(siteId)}/export-data`),
        loadModContentSections(siteId),
      ]);
      const revision = revisionResult.items.find((item) => item.id === revisionId);
      const versionPublicId = revision?.targetVersionPublicId || "";
      const templateCode = legacyCategoryTemplates[category] || "";
      const section = sections.find((item) =>
        !item.parentPublicId
        && item.versionPublicId === versionPublicId
        && item.templateCode === templateCode
        && item.status === "active");

      if (!hasEntry) {
        return section
          ? `/mods/${encodeURIComponent(siteId)}/data/sections/${encodeURIComponent(section.publicId)}`
          : `/mods/${encodeURIComponent(siteId)}`;
      }

      let resourcePublicId = /^[a-z0-9]{9}$/.test(entryEntityId) ? entryEntityId : "";
      if (!resourcePublicId && revision) {
        const detail = await getModExportEntryDetail(
          revisionId,
          entryRegistry,
          entryEntityId,
          entryObjectId,
          locale,
          "",
        );
        resourcePublicId = detail.publicId || detail.entityId;
      }
      if (!resourcePublicId || !versionPublicId) {
        return section
          ? `/mods/${encodeURIComponent(siteId)}/data/sections/${encodeURIComponent(section.publicId)}`
          : `/mods/${encodeURIComponent(siteId)}`;
      }
      const parameters = new URLSearchParams({ version: versionPublicId });
      if (section) parameters.set("section", section.publicId);
      return `/mods/${encodeURIComponent(siteId)}/resources/${encodeURIComponent(resourcePublicId)}?${parameters}`;
    }
    resolveCanonicalURL()
      .then((url) => { if (!cancelled) router.replace(url); })
      .catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
  }, [category, entryEntityId, entryObjectId, entryRegistry, hasEntry, locale, revisionId, router, siteId]);

  if (failed) {
    return <main className="grid min-h-[65vh] place-items-center p-6 text-center">
      <div>
        <p className="font-bold">{t("modContent.sectionPage.notFound")}</p>
        <Link className="mt-4 inline-block font-bold text-[var(--accent)] hover:underline" href={`/mods/${encodeURIComponent(siteId)}`}>{t("modContent.sectionPage.back")}</Link>
      </div>
    </main>;
  }
  return <main className="grid min-h-[65vh] place-items-center p-6 text-[var(--muted)]">{t("common.loading")}</main>;
}
