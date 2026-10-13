import { Transform, TransformCallback } from 'node:stream';

/**
 * Divide um stream de texto em linhas. Guarda a linha parcial entre chunks
 * e emite o resto pendente no `_flush` — sem isso a última linha (sem \n
 * final) some quando o stream termina.
 */
export class LineSplitter extends Transform {
  private partial = '';

  constructor() {
    super({ readableObjectMode: true, decodeStrings: false });
  }

  _transform(
    chunk: string | Buffer,
    _encoding: BufferEncoding,
    callback: TransformCallback,
  ): void {
    const data = this.partial + chunk.toString();
    const lines = data.split('\n');
    this.partial = lines.pop() ?? '';
    for (const line of lines) {
      this.push(line);
    }
    callback();
  }

  _flush(callback: TransformCallback): void {
    if (this.partial.length > 0) {
      this.push(this.partial);
      this.partial = '';
    }
    callback();
  }
}
