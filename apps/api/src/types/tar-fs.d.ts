declare module 'tar-fs' {
  export interface PackOptions {
    ignore?: (name: string) => boolean;
    dereference?: boolean;
  }

  export function pack(cwd: string, opts?: PackOptions): NodeJS.ReadableStream;

  const tarFs: { pack: typeof pack };
  export default tarFs;
}
