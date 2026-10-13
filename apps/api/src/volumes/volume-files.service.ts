import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  PayloadTooLargeException,
} from '@nestjs/common';
import { posix } from 'node:path';
import type { Request, Response } from 'express';
import * as tar from 'tar-stream';
import type {
  VolumeFsEntry,
  VolumeFsListResult,
  VolumeFsReadResult,
} from '@dockerlocal/shared';
import { SelfDetectService } from '../docker/self-detect.service';
import { VolumeHelperService } from './volume-helper.service';
import { toVolumePath, fromVolumePath, HELPER_ROOT } from './volume-path';
import { parseStatLines, sortEntries } from './volume-stat-parser';

const MAX_ENTRIES = 5000;
const MAX_PREVIEW_BYTES = 512 * 1024;
const MAX_UPLOAD_BYTES = 1024 * 1024 * 1024; // 1 GiB

interface ArchiveStat {
  name: string;
  size: number;
  mode: number;
  mtime: string;
  linkTarget?: string;
}

// Script constante: o path do usuário vai como argumento ($1), nunca
// interpolado na string — mesma regra de "spawn com argv" da regra 4,
// só que aqui o "shell" é o do helper descartável, não o do host.
// Sem "--" antes de "$1": o `realpath` do busybox (ao contrário do
// coreutils) não reconhece "--" como fim de opções e tenta resolvê-lo como
// path literal, falhando sempre. Seguro sem ele porque $1 vem de
// \`toVolumePath()\`, que sempre prefixa "/v" — nunca começa com "-".
// `stat -c` do busybox (ao contrário do coreutils) não expande `\t` no
// format string — precisa ser um byte de tab de verdade já embutido aqui,
// daí o `${TAB}` interpolado via JS em vez de escapar dentro do template.
const TAB = '\t';
const LIST_SCRIPT = `
r=$(realpath "$1") || exit 2
case "$r" in
  ${HELPER_ROOT}) ;;
  ${HELPER_ROOT}/*) ;;
  *) exit 3 ;;
esac
[ -d "$r" ] || exit 4
find "$r" -mindepth 1 -maxdepth 1 -exec stat -c '%F${TAB}%s${TAB}%Y${TAB}%a${TAB}%u${TAB}%g${TAB}%n' {} \\;
`;

@Injectable()
export class VolumeFilesService {
  constructor(
    private readonly helper: VolumeHelperService,
    private readonly selfDetect: SelfDetectService,
  ) {}

  async list(volume: string, logicalPath: string): Promise<VolumeFsListResult> {
    const target = toVolumePath(logicalPath);
    const { code, stdout } = await this.helper.exec(volume, [
      'sh',
      '-c',
      LIST_SCRIPT,
      'sh',
      target,
    ]);

    if (code === 3) {
      throw new ForbiddenException(
        'Caminho fora do volume (symlink escapando da raiz?)',
      );
    }
    if (code === 2 || code === 4) {
      throw new NotFoundException('Diretório não encontrado');
    }
    if (code !== 0) {
      throw new BadRequestException(
        `Falha ao listar diretório (código ${code})`,
      );
    }

    const lines = stdout.split('\n').filter(Boolean);
    const truncated = lines.length > MAX_ENTRIES;
    const raw = parseStatLines(lines.slice(0, MAX_ENTRIES).join('\n'));
    const entries: VolumeFsEntry[] = sortEntries(
      raw.map((e) => ({ ...e, path: fromVolumePath(e.path) })),
    );

    const normalizedPath = fromVolumePath(target);
    return {
      volume,
      path: normalizedPath,
      parent: normalizedPath === '/' ? null : posix.dirname(normalizedPath),
      readOnly: this.selfDetect.isSelfVolume(volume),
      entries,
      truncated,
    };
  }

  async stat(volume: string, logicalPath: string): Promise<ArchiveStat | null> {
    const container = await this.helper.acquire(volume);
    try {
      const res = (await container.infoArchive({
        path: toVolumePath(logicalPath),
      })) as unknown as NodeJS.ReadableStream & {
        headers?: Record<string, string>;
      };
      res.resume?.();
      const header = res.headers?.['x-docker-container-path-stat'];
      if (!header) return null;
      return JSON.parse(
        Buffer.from(header, 'base64').toString('utf8'),
      ) as ArchiveStat;
    } catch (err) {
      if ((err as { statusCode?: number }).statusCode === 404) return null;
      throw err;
    }
  }

  async read(volume: string, logicalPath: string): Promise<VolumeFsReadResult> {
    const container = await this.helper.acquire(volume);
    const target = toVolumePath(logicalPath);
    const archiveStream = await container.getArchive({ path: target });

    return new Promise((resolve, reject) => {
      const extract = tar.extract();
      let settled = false;

      extract.on('entry', (header, entryStream, next) => {
        if (settled) {
          entryStream.resume();
          next();
          return;
        }
        if (header.type !== 'file') {
          settled = true;
          entryStream.resume();
          destroyStream(archiveStream);
          reject(new BadRequestException('Caminho não é um arquivo regular'));
          return;
        }

        const chunks: Buffer[] = [];
        let total = 0;
        let truncated = false;
        entryStream.on('data', (chunk: Buffer) => {
          if (truncated) return;
          total += chunk.length;
          if (total > MAX_PREVIEW_BYTES) {
            truncated = true;
            chunks.push(
              chunk.subarray(0, MAX_PREVIEW_BYTES - (total - chunk.length)),
            );
            return;
          }
          chunks.push(chunk);
        });
        entryStream.on('end', () => {
          settled = true;
          const buf = Buffer.concat(chunks);
          const binary = buf.subarray(0, 8192).includes(0);
          resolve({
            path: logicalPath,
            content: binary ? '' : buf.toString('utf8'),
            truncated,
            binary,
            size: header.size ?? buf.length,
            mtime: (header.mtime ?? new Date()).toISOString(),
          });
          next();
        });
        entryStream.resume();
      });

      extract.on('error', (err: unknown) => {
        if (!settled) {
          settled = true;
          reject(err instanceof Error ? err : new Error(String(err)));
        }
      });
      extract.on('finish', () => {
        if (!settled) {
          settled = true;
          reject(new NotFoundException('Arquivo não encontrado'));
        }
      });

      archiveStream.on('error', reject);
      archiveStream.pipe(extract);
    });
  }

  async download(
    volume: string,
    logicalPath: string,
    res: Response,
  ): Promise<void> {
    const container = await this.helper.acquire(volume);
    const target = toVolumePath(logicalPath);
    const info = await this.stat(volume, logicalPath);
    if (!info) throw new NotFoundException('Caminho não encontrado');

    const archiveStream = await container.getArchive({
      path: target,
    });
    // `mode` aqui é um os.FileMode do Go (não POSIX mode_t) — o bit de
    // diretório é o mais significativo (`os.ModeDir = 1<<31`), não a
    // máscara S_IFMT de 4 bits alta que `stat(2)` usa.
    const isDir = (info.mode & 0x80000000) !== 0;

    if (isDir) {
      res.setHeader('Content-Type', 'application/x-tar');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${encodeRFC5987(info.name || 'volume')}.tar"`,
      );
      res.on('close', () => destroyStream(archiveStream));
      archiveStream.pipe(res);
      return;
    }

    const extract = tar.extract();
    let sent = false;
    extract.on('entry', (header, entryStream, next) => {
      if (sent || header.type !== 'file') {
        entryStream.resume();
        next();
        return;
      }
      sent = true;
      res.setHeader('Content-Type', 'application/octet-stream');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${encodeRFC5987(header.name)}"`,
      );
      if (header.size !== undefined)
        res.setHeader('Content-Length', String(header.size));
      res.on('close', () => entryStream.destroy());
      entryStream.pipe(res);
      entryStream.on('end', next);
    });
    extract.on('error', () => res.destroy());
    archiveStream.on('error', () => res.destroy());
    archiveStream.pipe(extract);
  }

  async upload(
    volume: string,
    logicalPath: string,
    req: Request,
    opts: { overwrite: boolean; expectedMtime?: string },
  ): Promise<void> {
    this.assertWritable(volume);

    const contentLength = Number(req.headers['content-length']);
    if (!contentLength || Number.isNaN(contentLength)) {
      throw new BadRequestException('Content-Length é obrigatório');
    }
    if (contentLength > MAX_UPLOAD_BYTES) {
      throw new PayloadTooLargeException('Arquivo maior que o limite de 1 GiB');
    }

    const existing = await this.stat(volume, logicalPath);
    if (existing) {
      if (!opts.overwrite) {
        throw new ConflictException({
          statusCode: 409,
          message: `"${posix.basename(logicalPath)}" já existe`,
          canForce: true,
        });
      }
      // Comparação por instante, não por string: `read()` deriva o mtime do
      // header do tar (`toISOString()`, UTC com ms) e `stat()`/infoArchive
      // devolve outro formato (offset local, sem ms) — o mesmo segundo em
      // representações diferentes, então `!==` bruto conflitava sempre.
      if (
        opts.expectedMtime &&
        new Date(existing.mtime).getTime() !== new Date(opts.expectedMtime).getTime()
      ) {
        throw new ConflictException({
          statusCode: 409,
          message: 'O arquivo foi alterado desde que você abriu a prévia',
          conflict: 'modified',
        });
      }
    }

    const parentLogical = posix.dirname(logicalPath) || '/';
    const owner = (await this.ownerOf(volume, parentLogical)) ?? {
      uid: 0,
      gid: 0,
    };

    const container = await this.helper.acquire(volume);
    const pack = tar.pack();
    const entryName = toVolumePath(logicalPath).slice(HELPER_ROOT.length + 1);

    // tar-stream emite 'error' (ex.: "Size mismatch" quando o cliente manda
    // menos/mais bytes do que o `Content-Length` declarado) tanto no
    // `entry` quanto no `pack` — sem um listener em CADA um dos dois,
    // vira exceção não capturada e derruba o processo Node inteiro. O
    // callback do 2º argumento de `pack.entry()` só cobre sucesso.
    const bodyError = new Promise<never>((_, reject) => {
      pack.on('error', reject);
    });

    const entry = pack.entry(
      {
        name: entryName,
        size: contentLength,
        mode: existing ? existing.mode & 0o777 : 0o644,
        uid: owner.uid,
        gid: owner.gid,
      },
      (err) => {
        if (err) return; // já tratado via 'error' acima
        pack.finalize();
      },
    );
    entry.on('error', () => {
      /* também tratado via 'error' do pack — evita segundo crash aqui */
    });
    req.on('error', (err) => entry.destroy(err));

    req.pipe(entry);

    try {
      await Promise.race([
        container.putArchive(pack, {
          path: HELPER_ROOT,
          noOverwriteDirNonDir: true,
        }),
        bodyError,
      ]);
    } catch (err) {
      throw new BadRequestException(
        err instanceof Error
          ? `Falha no upload: ${err.message}`
          : 'Falha no upload',
      );
    }
  }

  async mkdir(volume: string, logicalPath: string): Promise<void> {
    this.assertWritable(volume);
    const target = toVolumePath(logicalPath);
    const { code, stderr } = await this.helper.exec(volume, [
      'mkdir',
      '--',
      target,
    ]);
    if (code !== 0) {
      throw new BadRequestException(
        stderr || `Falha ao criar pasta (código ${code})`,
      );
    }
    const owner = await this.ownerOf(volume, posix.dirname(logicalPath) || '/');
    if (owner) {
      await this.helper.exec(volume, [
        'chown',
        `${owner.uid}:${owner.gid}`,
        '--',
        target,
      ]);
    }
  }

  /** uid/gid de um path existente, via `stat -c` no helper — a Archive API não expõe dono. */
  private async ownerOf(
    volume: string,
    logicalPath: string,
  ): Promise<{ uid: number; gid: number } | null> {
    const { code, stdout } = await this.helper.exec(volume, [
      'stat',
      '-c',
      '%u %g',
      '--',
      toVolumePath(logicalPath),
    ]);
    if (code !== 0) return null;
    const [uid, gid] = stdout.trim().split(/\s+/).map(Number);
    if (Number.isNaN(uid) || Number.isNaN(gid)) return null;
    return { uid, gid };
  }

  async rename(volume: string, from: string, to: string): Promise<void> {
    this.assertWritable(volume);
    const dest = await this.stat(volume, to);
    if (dest) {
      throw new ConflictException(`"${posix.basename(to)}" já existe`);
    }
    const { code, stderr } = await this.helper.exec(volume, [
      'mv',
      '-n',
      '--',
      toVolumePath(from),
      toVolumePath(to),
    ]);
    if (code !== 0) {
      throw new BadRequestException(
        stderr || `Falha ao renomear (código ${code})`,
      );
    }
  }

  async remove(volume: string, logicalPath: string): Promise<void> {
    this.assertWritable(volume);
    const target = toVolumePath(logicalPath);
    if (target === HELPER_ROOT) {
      throw new ForbiddenException('Não é possível apagar a raiz do volume');
    }
    const { code, stderr } = await this.helper.exec(volume, [
      'rm',
      '-rf',
      '--',
      target,
    ]);
    if (code !== 0) {
      throw new BadRequestException(
        stderr || `Falha ao apagar (código ${code})`,
      );
    }
  }

  private assertWritable(volume: string): void {
    if (this.selfDetect.isSelfVolume(volume)) {
      throw new ForbiddenException(
        'Não é possível alterar o volume usado pelo próprio container do DockerLocal.',
      );
    }
  }
}

function encodeRFC5987(str: string): string {
  return encodeURIComponent(str)
    .replace(/['()]/g, escape)
    .replace(/\*/g, '%2A');
}

function destroyStream(stream: NodeJS.ReadableStream): void {
  (stream as NodeJS.ReadableStream & { destroy?: () => void }).destroy?.();
}
