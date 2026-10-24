import { inflateSync } from "fflate";

const maximumManifestBytes = 4 * 1024 * 1024;
const maximumDirectoryBytes = 8 * 1024 * 1024;

// Read only the ZIP directory and a bounded manifest before asking for an OSS
// ticket. This is an early usability check; the server remains the authority
// for ZIP validity, format, ownership, hashes, Minecraft and loader checks.
// Unreadable/ZIP64 inputs continue to server validation rather than losing
// support merely because the browser cannot inspect their directory.
export async function readExporterManifest(file: Blob): Promise<Record<string, unknown> | undefined> {
  try {
    const tail = new Uint8Array(await file.slice(Math.max(0, file.size - 65_557)).arrayBuffer());
    const trailer = new DataView(tail.buffer, tail.byteOffset, tail.byteLength);
    let end = tail.length - 22;
    for (; end >= 0; end--) if (trailer.getUint32(end, true) === 0x06054b50 && end + 22 + trailer.getUint16(end + 20, true) === tail.length) break;
    if (end < 0 || trailer.getUint16(end + 4, true) || trailer.getUint16(end + 6, true)) return;
    const count = trailer.getUint16(end + 10, true);
    const directorySize = trailer.getUint32(end + 12, true);
    const directoryOffset = trailer.getUint32(end + 16, true);
    if (count === 0xffff || directorySize > maximumDirectoryBytes || directoryOffset + directorySize > file.size) return;
    const raw = new Uint8Array(await file.slice(directoryOffset, directoryOffset + directorySize).arrayBuffer());
    const view = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);
    let found: { offset: number; compressed: number; size: number; method: number } | undefined;
    let position = 0;
    for (let index = 0; index < count; index++) {
      if (position + 46 > raw.length || view.getUint32(position, true) !== 0x02014b50) return;
      const nameLength = view.getUint16(position + 28, true);
      const entryLength = 46 + nameLength + view.getUint16(position + 30, true) + view.getUint16(position + 32, true);
      if (position + entryLength > raw.length) return;
      const name = new TextDecoder().decode(raw.subarray(position + 46, position + 46 + nameLength));
      if (name.toLowerCase() === "manifest.json") {
        if (found || view.getUint16(position + 8, true) & 1) return;
        found = { offset: view.getUint32(position + 42, true), compressed: view.getUint32(position + 20, true), size: view.getUint32(position + 24, true), method: view.getUint16(position + 10, true) };
      }
      position += entryLength;
    }
    if (!found || found.size > maximumManifestBytes || found.compressed > maximumManifestBytes || found.offset + 30 > file.size) return;
    const local = new DataView(await file.slice(found.offset, found.offset + 30).arrayBuffer());
    if (local.getUint32(0, true) !== 0x04034b50) return;
    const start = found.offset + 30 + local.getUint16(26, true) + local.getUint16(28, true);
    if (start + found.compressed > file.size) return;
    const bytes = new Uint8Array(await file.slice(start, start + found.compressed).arrayBuffer());
    const decoded = found.method === 0 ? bytes : found.method === 8 ? inflateSync(bytes, { out: new Uint8Array(found.size) }) : undefined;
    if (!decoded || decoded.length !== found.size) return;
    const manifest: unknown = JSON.parse(new TextDecoder().decode(decoded));
    return manifest && typeof manifest === "object" && !Array.isArray(manifest) ? manifest as Record<string, unknown> : undefined;
  } catch { return; }
}

export function isAllNamespacesExport(manifest: Record<string, unknown> | undefined) {
  const configuration = manifest?.configuration;
  return Boolean(configuration && typeof configuration === "object" && "all_namespaces" in configuration && configuration.all_namespaces === true);
}
