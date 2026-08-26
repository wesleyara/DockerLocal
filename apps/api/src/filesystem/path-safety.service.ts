import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { realpathSync } from 'node:fs';
import { realpath, stat } from 'node:fs/promises';
import { basename, isAbsolute, resolve, sep } from 'node:path';
import type { FsRoot } from '@dockerlocal/shared';
import { APP_CONFIG } from '../config/config.module';
import type { AppConfig } from '../config/configuration';
import { FsConfigService } from './fs-config.service';

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
  // Fixas, lidas de FS_ROOTS no boot — não mudam sem reiniciar o processo.
  private readonly envRoots: string[];

  constructor(
    @Inject(APP_CONFIG) config: AppConfig,
    private readonly fsConfig: FsConfigService,
  ) {
    // realpath no boot: se uma raiz configurada for ela mesma um symlink,
    // resolveSafe precisa comparar contra o destino, não contra o link.
    this.envRoots = config.fsRoots.map((root) => realpathSync(root));
  }

  /** Raízes do .env + as adicionadas pela UI (fase 9), já resolvidas. */
  listRoots(): FsRoot[] {
    return [
      ...this.envRoots.map((path) => this.toFsRoot(path, 'env' as const)),
      ...this.fsConfig
        .list()
        .map((path) => this.toFsRoot(path, 'runtime' as const)),
    ];
  }

  isRootPath(real: string): boolean {
    return this.allRoots().includes(real);
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
    const roots = this.allRoots();
    const inRoot = roots.some(
      (root) => real === root || real.startsWith(root + sep),
    );
    if (!inRoot) {
      throw new ForbiddenException('Caminho fora das raízes permitidas');
    }

    return real;
  }

  /**
   * Adiciona uma raiz em runtime (fase 9). Mesmas regras de segurança do
   * `resolveSafe` — path relativo ou inexistente é rejeitado antes de
   * qualquer coisa entrar em `FS_ROOTS` efetivo.
   */
  async addRoot(requested: string): Promise<FsRoot> {
    if (!requested || !isAbsolute(requested)) {
      throw new BadRequestException('A raiz precisa ser um path absoluto');
    }

    let real: string;
    try {
      real = await realpath(resolve(requested));
    } catch (err) {
      translateFsError(err);
    }

    const info = await stat(real).catch(translateFsError);
    if (!info.isDirectory()) {
      throw new BadRequestException('A raiz precisa ser um diretório');
    }

    if (this.allRoots().includes(real)) {
      return this.toFsRoot(
        real,
        this.envRoots.includes(real) ? 'env' : 'runtime',
      );
    }

    this.fsConfig.add(real);
    return this.toFsRoot(real, 'runtime');
  }

  /** Só remove raízes adicionadas em runtime — as de FS_ROOTS exigem editar o .env. */
  removeRoot(path: string): boolean {
    if (this.envRoots.includes(path)) {
      throw new ForbiddenException(
        'Esta raiz vem de FS_ROOTS no .env — edite o .env e reinicie para removê-la',
      );
    }
    return this.fsConfig.remove(path);
  }

  private allRoots(): string[] {
    return [...this.envRoots, ...this.fsConfig.list()];
  }

  private toFsRoot(path: string, source: 'env' | 'runtime'): FsRoot {
    return { label: basename(path) || path, path, source };
  }
}
