#!/usr/bin/env node
// Empacota API + web num binário standalone por plataforma, via Node SEA
// (Single Executable Applications — nativo do Node, sem runtime extra pra
// quem RODA o binário). Só quem BUILDA precisa de Node/esbuild/postject,
// usados só aqui.
//
// Uso: node scripts/build-binary.mjs [--target=linux-x64,win-x64]
// Default: builda os dois. O binário linux é testável nesta máquina; o
// win-x64 é cross-build (baixa o node.exe oficial e injeta o blob) — não dá
// pra RODAR e confirmar num host Linux, só confirmar que o arquivo foi
// gerado. Valide num Windows de verdade antes de distribuir.
import { build as esbuildBuild } from 'esbuild';
import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { extname, join, relative } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const API_DIST_MAIN = join(ROOT, 'apps/api/dist/apps/api/src/main.js');
const WEB_ASSETS_STUB = join(
  ROOT,
  'apps/api/dist/apps/api/src/static/web-assets.generated.js',
);
const WEB_DIST = join(ROOT, 'apps/web/dist');
const CACHE_DIR = join(ROOT, '.cache/node-binaries');
const OUT_DIR = join(ROOT, 'dist-bin');
const PINNED_NODE = 'v24.19.0'; // docs/decisoes.md — mesma versão travada do resto do projeto

const SENTINEL_FUSE = 'NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2';

const TARGETS = {
  'linux-x64': {
    url: `https://nodejs.org/dist/${PINNED_NODE}/node-${PINNED_NODE}-linux-x64.tar.gz`,
    archive: 'tar.gz',
    outName: 'dockerlocal-linux-x64',
    posix: true,
  },
  'win-x64': {
    url: `https://nodejs.org/dist/${PINNED_NODE}/win-x64/node.exe`,
    archive: 'exe',
    outName: 'dockerlocal-win-x64.exe',
    posix: false,
  },
};

function run(cmd, args, opts = {}) {
  const result = spawnSync(cmd, args, { stdio: 'inherit', ...opts });
  if (result.status !== 0) {
    throw new Error(`"${cmd} ${args.join(' ')}" saiu com código ${result.status}`);
  }
}

function parseTargets() {
  const arg = process.argv.find((a) => a.startsWith('--target='));
  const names = arg ? arg.slice('--target='.length).split(',') : Object.keys(TARGETS);
  for (const name of names) {
    if (!TARGETS[name]) {
      throw new Error(`Target desconhecido: "${name}". Use: ${Object.keys(TARGETS).join(', ')}`);
    }
  }
  return names;
}

async function downloadNodeBinary(target) {
  const cfg = TARGETS[target];
  mkdirSync(CACHE_DIR, { recursive: true });

  if (cfg.archive === 'exe') {
    const dest = join(CACHE_DIR, `node-${target}.exe`);
    if (!existsSync(dest)) {
      console.log(`Baixando node.exe (${target})...`);
      const res = await fetch(cfg.url);
      if (!res.ok) throw new Error(`Falha ao baixar ${cfg.url}: ${res.status}`);
      writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
    }
    return dest;
  }

  // tar.gz: baixa e extrai só o binário `node` via `tar` do sistema — sem
  // dependência de lib de descompressão xz/tar em JS.
  const archivePath = join(CACHE_DIR, `node-${target}.tar.gz`);
  const extractDir = join(CACHE_DIR, `node-${target}`);
  const binPath = join(extractDir, `node-${PINNED_NODE}-${target}`, 'bin', 'node');

  if (!existsSync(binPath)) {
    if (!existsSync(archivePath)) {
      console.log(`Baixando node (${target})...`);
      const res = await fetch(cfg.url);
      if (!res.ok) throw new Error(`Falha ao baixar ${cfg.url}: ${res.status}`);
      writeFileSync(archivePath, Buffer.from(await res.arrayBuffer()));
    }
    mkdirSync(extractDir, { recursive: true });
    run('tar', ['-xzf', archivePath, '-C', extractDir]);
  }
  if (!existsSync(binPath)) {
    throw new Error(`Binário node não encontrado após extração em ${binPath}`);
  }
  return binPath;
}

// --- embute apps/web/dist no bundle, via plugin do esbuild ----------------

const CONTENT_EXTENSIONS = new Set([
  '.html', '.js', '.css', '.json', '.svg', '.png', '.ico', '.woff', '.woff2', '.txt', '.map',
]);

function walk(dir, base = dir) {
  const out = {};
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      Object.assign(out, walk(full, base));
    } else {
      const key = relative(base, full).split('\\').join('/'); // Windows-safe key
      out[key] = full;
    }
  }
  return out;
}

// Peer deps GENUINAMENTE opcionais — quem as requer já embrulha em
// try/catch, então nunca crasham em runtime mesmo ausentes (é o
// comportamento de hoje, fora do binário: nenhuma delas está instalada e
// o app funciona normal). SEA não faz fallback pro node_modules do disco
// pra um require não-bundlado — `external` sozinho vira
// ERR_UNKNOWN_BUILTIN_MODULE fatal em vez do MODULE_NOT_FOUND recuperável
// de sempre, então precisam virar um módulo stub que joga o MESMO tipo de
// erro que o try/catch de quem chama já sabe engolir.
//
// `ssh2` NÃO entra aqui — parece opcional (só serve pra Docker via
// `ssh://`, que este app nunca configura) mas `docker-modem` requer o
// arquivo que usa ssh2 incondicionalmente no próprio module-load (sem
// try/catch), então precisa ser bundlado de verdade. Só o binding nativo
// opcional DELE (`cpu-features`) é seguro de stubar — o próprio ssh2 já
// tem try/catch em volta desse require.
const OPTIONAL_PEER_DEPS = [
  '@nestjs/microservices',
  '@nestjs/microservices/microservices-module',
  '@nestjs/websockets',
  '@nestjs/websockets/socket-module',
  'class-validator',
  'class-transformer',
  'cpu-features',
];

function stubOptionalPeerDepsPlugin() {
  return {
    name: 'stub-optional-peer-deps',
    setup(pluginBuild) {
      const filter = new RegExp(
        `^(${OPTIONAL_PEER_DEPS.map((p) => p.replace(/[/.]/g, '\\$&')).join('|')})$`,
      );
      pluginBuild.onResolve({ filter }, (args) => ({
        path: args.path,
        namespace: 'stub-optional-peer-dep',
      }));
      pluginBuild.onLoad({ filter: /.*/, namespace: 'stub-optional-peer-dep' }, (args) => ({
        contents: `throw new Error("Cannot find module '${args.path}'");`,
        loader: 'js',
      }));
    },
  };
}

function embedWebAssetsPlugin() {
  return {
    name: 'embed-web-assets',
    setup(pluginBuild) {
      pluginBuild.onLoad({ filter: /web-assets\.generated\.js$/ }, (args) => {
        if (args.path !== WEB_ASSETS_STUB) return undefined;

        if (!existsSync(join(WEB_DIST, 'index.html'))) {
          throw new Error(
            `apps/web/dist não encontrado (rode "pnpm --filter web build" antes) — esperado em ${WEB_DIST}`,
          );
        }

        const files = walk(WEB_DIST);
        const entries = Object.entries(files)
          .filter(([key]) => CONTENT_EXTENSIONS.has(extname(key)))
          .map(([key, full]) => {
            const base64 = readFileSync(full).toString('base64');
            return `${JSON.stringify(key)}: ${JSON.stringify(base64)}`;
          });

        const contents = `exports.WEB_ASSETS = {\n${entries.join(',\n')}\n};\n`;
        console.log(`Embutindo ${entries.length} arquivos de ${WEB_DIST}`);
        return { contents, loader: 'js' };
      });
    },
  };
}

async function bundleApi() {
  const outfile = join(OUT_DIR, 'bundle.cjs');
  mkdirSync(OUT_DIR, { recursive: true });

  await esbuildBuild({
    entryPoints: [API_DIST_MAIN],
    bundle: true,
    platform: 'node',
    target: 'node24',
    format: 'cjs',
    outfile,
    plugins: [stubOptionalPeerDepsPlugin(), embedWebAssetsPlugin()],
    logLevel: 'warning',
  });

  return outfile;
}

async function buildTarget(target, bundlePath) {
  const cfg = TARGETS[target];
  const baseBinary = await downloadNodeBinary(target);
  const outPath = join(OUT_DIR, cfg.outName);

  const blobPath = join(OUT_DIR, `sea-prep-${target}.blob`);
  const seaConfigPath = join(OUT_DIR, `sea-config-${target}.json`);
  writeFileSync(
    seaConfigPath,
    JSON.stringify({ main: bundlePath, output: blobPath, disableExperimentalSEAWarning: true }),
  );
  run('node', ['--experimental-sea-config', seaConfigPath]);

  if (existsSync(outPath)) rmSync(outPath);
  copyFileSync(baseBinary, outPath);

  const postjectArgs = [outPath, 'NODE_SEA_BLOB', blobPath, '--sentinel-fuse', SENTINEL_FUSE];
  run('node', [findPostjectCli(), ...postjectArgs]);

  if (cfg.posix) chmodSync(outPath, 0o755);

  const size = (statSync(outPath).size / (1024 * 1024)).toFixed(1);
  console.log(`✓ ${target}: ${outPath} (${size} MB)`);
}

function findPostjectCli() {
  // Resolve o CLI do postject a partir do próprio node_modules do
  // workspace — evita depender de PATH/pnpm exec dentro deste script.
  const path = new URL('../node_modules/postject/dist/cli.js', import.meta.url).pathname;
  if (!existsSync(path)) {
    throw new Error(`postject não encontrado em ${path} — rode "pnpm install" na raiz`);
  }
  return path;
}

async function main() {
  const targets = parseTargets();
  console.log(`Alvos: ${targets.join(', ')}`);

  run('pnpm', ['--filter', 'web', 'build'], { cwd: ROOT });
  run('pnpm', ['--filter', 'api', 'build'], { cwd: ROOT });

  const bundlePath = await bundleApi();

  for (const target of targets) {
    await buildTarget(target, bundlePath);
  }

  if (targets.includes('win-x64')) {
    console.log(
      '\nAviso: o binário win-x64 foi cross-buildado num host não-Windows — não foi executado ' +
        'aqui pra validar. Teste num Windows de verdade antes de distribuir.',
    );
  }
}

main().catch((err) => {
  console.error(`Erro: ${err instanceof Error ? err.message : String(err)}`);
  process.exitCode = 1;
});
