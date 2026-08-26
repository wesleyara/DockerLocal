import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import type { AppConfig } from '../config/configuration';
import { PathSafetyService } from './path-safety.service';

function configFor(roots: string[]): AppConfig {
  return { fsRoots: roots } as AppConfig;
}

describe('PathSafetyService', () => {
  let base: string;
  let root: string;
  let outside: string;

  beforeEach(() => {
    base = mkdtempSync(join(tmpdir(), 'dockerlocal-fs-'));
    root = join(base, 'development');
    outside = join(base, 'etc-fake');
    mkdirSync(join(root, 'invest-broker'), { recursive: true });
    mkdirSync(outside, { recursive: true });
    writeFileSync(join(outside, 'passwd'), 'root:x:0:0');
  });

  afterEach(() => {
    rmSync(base, { recursive: true, force: true });
  });

  it('aceita a própria raiz e subdiretórios, devolvendo o path real', async () => {
    const svc = new PathSafetyService(configFor([root]));
    await expect(svc.resolveSafe(root)).resolves.toBe(root);
    await expect(svc.resolveSafe(join(root, 'invest-broker'))).resolves.toBe(
      join(root, 'invest-broker'),
    );
  });

  it('rejeita path relativo com 400', async () => {
    const svc = new PathSafetyService(configFor([root]));
    await expect(svc.resolveSafe('invest-broker')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('rejeita traversal (../../../etc) com 403', async () => {
    const svc = new PathSafetyService(configFor([root]));
    // string crua e não normalizada, como chegaria via querystring — não
    // usa path.join, que colapsaria o ".." antes mesmo de chegar ao service.
    const traversal = `${root}/../../../etc`;
    await expect(svc.resolveSafe(traversal)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('rejeita path fora da raiz com 403', async () => {
    const svc = new PathSafetyService(configFor([root]));
    await expect(svc.resolveSafe(outside)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('rejeita symlink dentro da raiz apontando para fora com 403', async () => {
    const link = join(root, 'escape');
    symlinkSync(outside, link);
    const svc = new PathSafetyService(configFor([root]));
    await expect(svc.resolveSafe(link)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('não deixa um diretório irmão com o mesmo prefixo passar como filho', async () => {
    const siblingWithPrefix = `${root}-secreto`;
    mkdirSync(siblingWithPrefix, { recursive: true });
    const svc = new PathSafetyService(configFor([root]));
    await expect(svc.resolveSafe(siblingWithPrefix)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('devolve 404 para path inexistente dentro da raiz', async () => {
    const svc = new PathSafetyService(configFor([root]));
    await expect(
      svc.resolveSafe(join(root, 'nao-existe')),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
