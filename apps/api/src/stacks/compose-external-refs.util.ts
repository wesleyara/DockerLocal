import { isAbsolute, join } from 'node:path';

const INCLUDE_ITEM_RE = /^\s*-\s*(?:path:\s*)?['"]?([^'"#\s]+)['"]?\s*$/;
const EXTENDS_FILE_RE = /^\s*file:\s*['"]?([^'"#\s]+)['"]?\s*$/;

/**
 * Extração heurística (linha a linha, sem parser YAML) de paths referenciados
 * por `include:`/`extends:` num compose file. Usada só para avisar sobre
 * referências fora da raiz espelhada (quebra em container, fase 9) — não
 * precisa ser um parser completo.
 */
export function extractComposeExternalRefs(
  raw: string,
  workingDir: string,
): string[] {
  const lines = raw.split('\n');
  const candidates: string[] = [];
  let inInclude = false;

  for (const line of lines) {
    if (/^include:\s*$/.test(line)) {
      inInclude = true;
      continue;
    }
    if (inInclude) {
      const item = line.match(INCLUDE_ITEM_RE);
      if (item) {
        candidates.push(item[1]);
        continue;
      }
      if (/^\S/.test(line)) inInclude = false;
    }

    const extendsFile = line.match(EXTENDS_FILE_RE);
    if (extendsFile) candidates.push(extendsFile[1]);
  }

  return candidates.map((p) => (isAbsolute(p) ? p : join(workingDir, p)));
}
