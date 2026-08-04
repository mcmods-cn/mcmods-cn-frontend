import { apiRequest } from "./api";
import type { ModContentLocalization, ModContentTemplateDefinition } from "./mod-content-api";

export type AdminContentAttributeTemplate = {
  templatePublicId: string;
  templateCode: string;
  templateI18nKey: string;
  defaultLocale: string;
  defaultDisplayMode: "compact" | "large";
  pageNames: Record<string, string>;
  pageDescriptions: Record<string, string>;
  definition: ModContentTemplateDefinition;
  updatedAt: string;
};

export function loadAdminContentAttributeTemplates(token: string, query = "") {
  const parameters = new URLSearchParams();
  if (query.trim()) parameters.set("q", query.trim());
  const suffix = parameters.size ? `?${parameters}` : "";
  return apiRequest<{ items: AdminContentAttributeTemplate[] }>(`/api/v1/admin/mod-content-attribute-templates${suffix}`, {}, token)
    .then((result) => result.items);
}

export function saveAdminContentAttributeTemplate(
  templatePublicId: string,
  payload: { definition: ModContentTemplateDefinition; localizations: ModContentLocalization[] },
  token: string,
) {
  return apiRequest<Pick<AdminContentAttributeTemplate, "templatePublicId" | "definition" | "pageNames" | "pageDescriptions" | "updatedAt">>(
    `/api/v1/admin/mod-content-attribute-templates/${encodeURIComponent(templatePublicId)}`,
    { method: "PUT", body: JSON.stringify(payload) },
    token,
  );
}
