import { parseStatLines, sortEntries } from './volume-stat-parser';

describe('parseStatLines', () => {
  it('parseia uma linha regular', () => {
    const out = 'regular file\t123\t1700000000\t644\t1000\t1000\t/v/a/b.txt\n';
    const [entry] = parseStatLines(out);
    expect(entry).toMatchObject({
      name: 'b.txt',
      path: '/v/a/b.txt',
      type: 'file',
      size: 123,
      mode: '644',
      uid: 1000,
      gid: 1000,
    });
    expect(entry.modifiedAt).toBe(new Date(1700000000 * 1000).toISOString());
  });

  it('reconhece diretório e symlink', () => {
    const out = [
      'directory\t4096\t1700000000\t755\t0\t0\t/v/dir',
      'symbolic link\t5\t1700000000\t777\t0\t0\t/v/link',
    ].join('\n');
    const entries = parseStatLines(out);
    expect(entries[0].type).toBe('directory');
    expect(entries[1].type).toBe('symlink');
  });

  it('preserva um nome de arquivo que contém tab, juntando o resto da linha', () => {
    const out = 'regular file\t1\t0\t644\t0\t0\t/v/weird\tname.txt';
    const [entry] = parseStatLines(out);
    expect(entry.path).toBe('/v/weird\tname.txt');
    expect(entry.name).toBe('weird\tname.txt');
  });

  it('ignora linhas vazias e malformadas', () => {
    expect(
      parseStatLines('\n\nregular file\t1\t0\t644\t0\t0\t/v/x\n'),
    ).toHaveLength(1);
    expect(parseStatLines('lixo sem tabs suficientes')).toHaveLength(0);
  });
});

describe('sortEntries', () => {
  it('coloca diretórios primeiro e depois ordena alfabeticamente', () => {
    const mk = (name: string, type: 'file' | 'directory') => ({
      name,
      path: `/v/${name}`,
      type,
      size: 0,
      modifiedAt: '',
      mode: '644',
      uid: 0,
      gid: 0,
    });
    const sorted = sortEntries([
      mk('z.txt', 'file'),
      mk('b-dir', 'directory'),
      mk('a.txt', 'file'),
    ]);
    expect(sorted.map((e) => e.name)).toEqual(['b-dir', 'a.txt', 'z.txt']);
  });
});
