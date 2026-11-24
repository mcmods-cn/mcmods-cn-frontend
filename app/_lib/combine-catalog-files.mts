import type { CatalogImportSource } from "./mod-export-api";

export async function combineCatalogFiles(
  files: File[],
  source: CatalogImportSource,
  importer: string,
  t: (key: string, values?: Record<string, string | number>) => string,
  signal: AbortSignal,
) {
  if (files.length > 8) throw new Error(t("modContent.catalogImport.tooManyFiles", { importer }));
  const totalSize = files.reduce((sum, file) => sum + file.size, 0);
  if (totalSize > 128 * 1024 * 1024) throw new Error(t("modContent.catalogImport.filesTooLarge", { importer }));
  const batches: BlobPart[] = [];
  for (const file of files) {
    signal.throwIfAborted();
    const raw = (await file.text()).replace(/^\uFEFF/, "").trim();
    signal.throwIfAborted();
    if (!raw) continue;
    const rows: string[] = [];
    if (raw.startsWith("[")) {
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) throw new Error(t("modContent.catalogImport.notArray", { file: file.name }));
      for (const entry of parsed) rows.push(JSON.stringify(entry));
    } else {
      for (const [index, line] of raw.split(/\r?\n/).entries()) {
        if (!line.trim()) continue;
        try {
          rows.push(JSON.stringify(JSON.parse(line)));
        } catch {
          throw new Error(t("modContent.catalogImport.invalidLine", { file: file.name, line: index + 1 }));
        }
      }
    }
    if (rows.length) {
      if (batches.length) batches.push("\n");
      batches.push(new Blob([rows.join("\n")]));
    }
  }
  if (!batches.length) throw new Error(t("modContent.catalogImport.empty", { importer }));
  return new File(batches, `${source}-catalog-${Date.now()}.json`, { type: "application/x-ndjson" });
}
