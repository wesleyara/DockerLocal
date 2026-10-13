/**
 * Fica vazio no repo — em dev (`pnpm dev`), no Docker empacotado e no
 * pacote npm, `setupStatic()` (main.ts) serve `apps/web/dist` do disco.
 *
 * Só o binário standalone (`scripts/build-binary.mjs`) preenche isso: um
 * plugin do esbuild intercepta o import deste módulo durante o bundle e
 * substitui o conteúdo pelo build inteiro de `apps/web/dist` embutido como
 * base64, pra o executável final não depender de nenhum arquivo externo.
 */
// Chave = path relativo a apps/web/dist ("index.html", "assets/index.js"),
// valor = conteúdo em base64. Content-Type é resolvido pela extensão em
// `setupStatic()`, não guardado aqui, pra não duplicar o mapeamento.
export const WEB_ASSETS: Record<string, string> = {};
