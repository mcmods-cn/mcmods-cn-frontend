import { apiRequest } from "./api";

export type ContentLanguageSettings = {
  primaryLocale: string;
  secondaryLocale: string;
  editableLocales: string[];
};

export function loadContentLanguageSettings(token: string) {
  return apiRequest<ContentLanguageSettings>("/api/v1/users/me/content-languages", {}, token);
}

export function saveContentLanguageSettings(primaryLocale: string, secondaryLocale: string, token: string) {
  return apiRequest<ContentLanguageSettings>(
    "/api/v1/users/me/content-languages",
    {
      method: "PUT",
      body: JSON.stringify({ primaryLocale, secondaryLocale }),
    },
    token,
  );
}
