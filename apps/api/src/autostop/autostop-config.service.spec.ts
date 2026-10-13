import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AutostopConfigService } from './autostop-config.service';

describe('AutostopConfigService', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'autostop-'));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('persiste e recarrega lista, enabled e bootId', () => {
    const a = new AutostopConfigService({ dataDir: dir });
    a.add('/db');
    a.add('db');
    a.setEnabled(false);
    a.setLastBootId('x');
    const b = new AutostopConfigService({ dataDir: dir });
    expect(b.excluded).toEqual(['db']);
    expect(b.enabled).toBe(false);
    expect(b.lastBootId).toBe('x');
    expect(b.isExcluded('/db')).toBe(true);
  });

  it('remove devolve false quando não existe', () => {
    const a = new AutostopConfigService({ dataDir: dir });
    expect(a.remove('nada')).toBe(false);
    a.add('x');
    expect(a.remove('x')).toBe(true);
  });

  it('padrão: ligado e vazio', () => {
    const a = new AutostopConfigService({ dataDir: dir });
    expect(a.enabled).toBe(true);
    expect(a.excluded).toEqual([]);
  });
});
