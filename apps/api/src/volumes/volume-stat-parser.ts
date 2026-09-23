import { posix } from 'node:path';
import type { VolumeFsEntry, VolumeFsEntryType } from '@dockerlocal/shared';

/**
 * Uma linha de saída de
 * `stat -c '%F\t%s\t%Y\t%a\t%u\t%g\t%n'` (busybox), uma por entrada.
 * `%n` é o path completo (o argumento passado ao `stat`), então split
 * simples nos 6 primeiros tabs preserva um `%n` que por acaso contenha tab.
 */
export function parseStatLines(output: string): VolumeFsEntry[] {
  const lines = output.split('\n').filter((l) => l.length > 0);
  const entries: VolumeFsEntry[] = [];

  for (const line of lines) {
    const parts = line.split('\t');
    if (parts.length < 7) continue;
    const [rawType, rawSize, rawMtime, rawMode, rawUid, rawGid, ...nameParts] =
      parts;
    const fullPath = nameParts.join('\t');
    const name = posix.basename(fullPath);

    entries.push({
      name,
      path: fullPath,
      type: mapType(rawType),
      size: Number(rawSize) || 0,
      modifiedAt: new Date(Number(rawMtime) * 1000).toISOString(),
      mode: rawMode,
      uid: Number(rawUid) || 0,
      gid: Number(rawGid) || 0,
    });
  }

  return entries;
}

function mapType(statF: string): VolumeFsEntryType {
  if (statF.startsWith('directory')) return 'directory';
  if (statF.startsWith('symbolic link')) return 'symlink';
  if (statF.startsWith('regular')) return 'file';
  return 'other';
}

/** Ordena diretórios primeiro, depois alfabético — mesmo critério do file browser do host. */
export function sortEntries(entries: VolumeFsEntry[]): VolumeFsEntry[] {
  return [...entries].sort((a, b) => {
    if (a.type === 'directory' && b.type !== 'directory') return -1;
    if (a.type !== 'directory' && b.type === 'directory') return 1;
    return a.name.localeCompare(b.name);
  });
}
