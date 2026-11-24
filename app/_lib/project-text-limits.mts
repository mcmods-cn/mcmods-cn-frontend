// The default Mod localization supplies its secondary name and summary.
// Modpacks do not impose the same limit on their secondary name.
export function projectTextOverflow(project: { primaryName: string; summary: string }, defaultModName?: string) {
  if (Array.from(project.primaryName.trim()).length > 160) return { field: "primaryName", limit: 160 } as const;
  if (defaultModName && Array.from(defaultModName.trim()).length > 160) return { field: "secondaryName", limit: 160 } as const;
  if (Array.from(project.summary.trim()).length > 500) return { field: "summary", limit: 500 } as const;
  return null;
}
