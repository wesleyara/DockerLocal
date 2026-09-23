import { BadRequestException } from '@nestjs/common';
import { fromVolumePath, toVolumePath } from './volume-path';

describe('toVolumePath', () => {
  it('mapeia a raiz e subcaminhos para dentro de /v', () => {
    expect(toVolumePath('/')).toBe('/v');
    expect(toVolumePath('/a/b')).toBe('/v/a/b');
  });

  it('normaliza segmentos "." e ".." dentro do path', () => {
    // path.posix.normalize resolve isso ANTES do realpath dentro do helper
    // dar a palavra final — mas não custa nada já não devolver algo torto.
    expect(toVolumePath('/a/./b')).toBe('/v/a/b');
    expect(toVolumePath('/a/../b')).toBe('/v/b');
  });

  it('rejeita path vazio', () => {
    expect(() => toVolumePath('')).toThrow(BadRequestException);
  });

  it('rejeita path não absoluto', () => {
    expect(() => toVolumePath('a/b')).toThrow(BadRequestException);
  });

  it('rejeita NUL byte', () => {
    expect(() => toVolumePath('/a\0b')).toThrow(BadRequestException);
  });
});

describe('fromVolumePath', () => {
  it('inverte toVolumePath', () => {
    expect(fromVolumePath('/v')).toBe('/');
    expect(fromVolumePath('/v/a/b')).toBe('/a/b');
  });
});
