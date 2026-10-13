import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ForbiddenException } from '@nestjs/common';
import type { AppConfig } from '../config/configuration';
import { FileDetectService } from './file-detect.service';
import { FilesystemController } from './filesystem.controller';
import { PathSafetyService } from './path-safety.service';
import type { FsConfigService } from './fs-config.service';

function configFor(roots: string[]): AppConfig {
  return { fsRoots: roots } as AppConfig;
}

function noRuntimeRoots(): FsConfigService {
  return {
    list: () => [],
    add: () => undefined,
    remove: () => false,
  } as unknown as FsConfigService;
}

describe('FilesystemController', () => {
  let base: string;
  let root: string;
  let controller: FilesystemController;

  beforeEach(() => {
    base = mkdtempSync(join(tmpdir(), 'dockerlocal-fs-ctrl-'));
    root = join(base, 'development');
    mkdirSync(join(root, 'invest-broker'), { recursive: true });
    writeFileSync(
      join(root, 'invest-broker', 'docker-compose.yml'),
      'services: {}',
    );
    writeFileSync(join(root, 'invest-broker', '.env'), 'SECRET=1');
    writeFileSync(join(root, 'invest-broker', 'Dockerfile'), 'FROM node');
    mkdirSync(join(root, '.hidden'), { recursive: true });

    const pathSafety = new PathSafetyService(
      configFor([root]),
      noRuntimeRoots(),
    );
    const fileDetect = new FileDetectService(pathSafety);
    controller = new FilesystemController(pathSafety, fileDetect);
  });

  afterEach(() => {
    rmSync(base, { recursive: true, force: true });
  });

  it('lista raízes com label derivado do basename', () => {
    expect(controller.roots()).toEqual([
      { label: 'development', path: root, source: 'env' },
    ]);
  });

  it('lista diretórios antes de arquivos, ordenados, e esconde ocultos por padrão', async () => {
    const result = await controller.list({ path: root, showHidden: false });
    expect(result.parent).toBeNull();
    expect(result.entries.map((e) => e.name)).toEqual(['invest-broker']);
  });

  it('mostra ocultos quando showHidden=true', async () => {
    const result = await controller.list({ path: root, showHidden: true });
    expect(result.entries.map((e) => e.name)).toEqual([
      '.hidden',
      'invest-broker',
    ]);
  });

  it('marca isCompose e isDockerfile corretamente', async () => {
    const result = await controller.list({
      path: join(root, 'invest-broker'),
      showHidden: false,
    });
    const compose = result.entries.find((e) => e.name === 'docker-compose.yml');
    const dockerfile = result.entries.find((e) => e.name === 'Dockerfile');
    expect(compose?.isCompose).toBe(true);
    expect(dockerfile?.isDockerfile).toBe(true);
  });

  it('detect encontra o docker-compose.yml do projeto', async () => {
    const result = await controller.detect({
      path: join(root, 'invest-broker'),
    });
    expect(result.kind).toBe('compose');
    expect(result.composeFiles).toEqual(['docker-compose.yml']);
  });

  it('bloqueia leitura de .env com 403', async () => {
    await expect(
      controller.read({ path: join(root, 'invest-broker', '.env') }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('lê um docker-compose.yml normalmente', async () => {
    const result = await controller.read({
      path: join(root, 'invest-broker', 'docker-compose.yml'),
    });
    expect(result.content).toBe('services: {}');
    expect(result.truncated).toBe(false);
  });

  it('trunca arquivo acima de 512 KB', async () => {
    const bigFile = join(root, 'big-compose.yml');
    writeFileSync(bigFile, 'a'.repeat(512 * 1024 + 10));
    const result = await controller.read({ path: bigFile });
    expect(result.truncated).toBe(true);
    expect(result.content.length).toBe(512 * 1024);
  });
});
