import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { realpathSync } from 'node:fs';
import { realpath } from 'node:fs/promises';
import { isAbsolute, resolve, sep } from 'node:path';
import { APP_CONFIG } from '../config/config.module';
import type { AppConfig } from '../config/configuration';

/** Traduz um erro de fs para a exceção HTTP correspondente. Sempre lança. */
export function translateFsError(err: unknown): never {
  const code = (err as NodeJS.ErrnoException)?.code;
  if (code === 'ENOENT') {
    throw new NotFoundException('Caminho não encontrado');
  }
  if (code === 'EACCES') {
    throw new ForbiddenException('Sem permissão para acessar este caminho');
  }
  throw err;
}

@Injectable()
export class PathSafetyService {
  private readonly roots: string[];

  constructor(@Inject(APP_CONFIG) config: AppConfig) {
    // realpath no boot: se uma raiz configurada for ela mesma um symlink,
    // resolveSafe precisa comparar contra o destino, não contra o link.
    this.roots = config.fsRoots.map((root) => realpathSync(root));
  }

  listRoots(): string[] {
    return this.roots;
  }

  /**
   * Resolve `requested` contra as raízes configuradas e devolve o path real
   * (pós-symlink). Lança 400/403/404 conforme a violação — nunca deixa um
   * path fora das raízes passar adiante.
   */
  async resolveSafe(requested: string): Promise<string> {
    if (!requested || !isAbsolute(requested)) {
      throw new BadRequestException('O path precisa ser absoluto');
    }

    const resolved = resolve(requested);

    let real: string;
    try {
      real = await realpath(resolved);
    } catch (err) {
      translateFsError(err);
    }

    // realpath ANTES da comparação: senão um symlink dentro da raiz
    // apontando para fora passa disfarçado de path "dentro" da raiz.
    const inRoot = this.roots.some(
      (root) => real === root || real.startsWith(root + sep),
    );
    if (!inRoot) {
      throw new ForbiddenException('Caminho fora das raízes permitidas');
    }

    return real;
  }
}
