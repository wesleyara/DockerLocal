import { posix } from 'node:path';
import { BadRequestException } from '@nestjs/common';

const HELPER_ROOT = '/v';

/**
 * Traduz um path "lógico" (o que a UI mostra, relativo à raiz do volume)
 * para o path real dentro do helper (`/v/...`). Isso NÃO é o
 * `PathSafetyService` da regra 4 — aquele protege o filesystem do HOST;
 * aqui o alvo é o rootfs descartável de um container helper, e a proteção
 * de verdade é o `realpath` feito DENTRO do helper (ver `volume-files.service.ts`),
 * que também pega symlink escapando do volume. Esta função só normaliza
 * a entrada e rejeita o óbvio antes de gastar um exec.
 */
export function toVolumePath(requested: string): string {
  if (typeof requested !== 'string' || requested.length === 0) {
    throw new BadRequestException('path é obrigatório');
  }
  if (requested.includes('\0')) {
    throw new BadRequestException('path inválido');
  }
  if (!requested.startsWith('/')) {
    throw new BadRequestException(
      'path precisa ser absoluto (relativo à raiz do volume)',
    );
  }

  const normalized = posix.normalize(requested);
  if (normalized === '/') {
    return HELPER_ROOT;
  }
  return `${HELPER_ROOT}${normalized}`;
}

/** Path lógico (relativo à raiz do volume) a partir de um path real `/v/...`. */
export function fromVolumePath(real: string): string {
  if (real === HELPER_ROOT) return '/';
  return real.slice(HELPER_ROOT.length) || '/';
}

export { HELPER_ROOT };
