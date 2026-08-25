---
name: compose-cli
description: Como executar docker compose e docker build via child_process com streaming, mutex e cancelamento — flags obrigatórias, progresso que sai no stderr, segurança do spawn e discovery de stacks por label. Use ao mexer em compose-cli.service.ts, image-build-cli.service.ts, stack-discovery.service.ts ou stack-registry.service.ts.
---

# Compose e build via CLI

A Engine API não tem nenhum conceito de "stack" — Compose é uma ferramenta **cliente** que cria recursos comuns e os marca com labels. BuildKit também não é exposto pela API (exige sessão gRPC que o dockerode não implementa). Por isso essas duas operações vão por `spawn`.

Isso divide o trabalho em duas metades independentes: **leitura** por dockerode (barata, sem side effect) e **escrita** por CLI.

## 1. Leitura — discovery por label

```ts
const [containers, volumes, networks] = await Promise.all([
  this.docker.listContainers({ all: true }),
  this.docker.listVolumes(),
  this.docker.listNetworks(),
]);

const L = 'com.docker.compose.';
for (const c of containers) {
  const project = c.Labels[`${L}project`];
  if (!project) continue;
  const workingDir  = c.Labels[`${L}project.working_dir`];
  const configFiles = (c.Labels[`${L}project.config_files`] ?? '').split(',').filter(Boolean);
  const service     = c.Labels[`${L}service`];
  const oneoff      = c.Labels[`${L}oneoff`] === 'True';   // T MAIÚSCULO
}
```

**`oneoff` é `'True'` com T maiúsculo.** Comparar com `'true'` faz containers de `docker compose run` aparecerem como serviços normais e poluir a stack.

Volumes e networks carregam o mesmo label `project`, então a stack se monta mesmo com todos os containers parados.

**O buraco do discovery:** uma stack que sofreu `down` completo não deixa recurso nenhum — some da lista. Por isso o `StackRegistryService` persiste em `~/.dockerlocal/stacks.json` os compose files já vistos. A listagem final é a união de `source: 'discovered'` + `source: 'registry'`. Valide com `fs.access` na listagem → `fileExists: false` vira badge "arquivo não encontrado".

## 2. Escrita — o spawn

```ts
const child = spawn('docker', [
  'compose',
  '--progress', 'plain',      // sem isso a saída vem cheia de \x1b[1A\x1b[2K
  '--ansi', 'never',
  '-p', project,
  ...configFiles.flatMap(f => ['-f', f]),
  ...args,                    // ex.: ['up','-d','--remove-orphans']
], {
  cwd: workingDir,
  shell: false,               // NUNCA true
  env: { ...process.env, DOCKER_BUILDKIT: '1', BUILDKIT_PROGRESS: 'plain', NO_COLOR: '1' },
  stdio: ['ignore', 'pipe', 'pipe'],
});

child.stdout.setEncoding('utf8');
child.stderr.setEncoding('utf8');
child.stdout.pipe(new LineSplitter()).on('data', t => emit({ s: 'stdout', text: t }));
child.stderr.pipe(new LineSplitter()).on('data', t => emit({ s: 'stderr', text: t }));

signal.addEventListener('abort', () => {
  child.kill('SIGINT');                                    // compose faz cleanup gracioso
  setTimeout(() => child.killed || child.kill('SIGKILL'), 10_000).unref();
});

return new Promise<number>(res => child.on('close', c => res(c ?? -1)));
```

### As três coisas que sempre pegam

**O progresso sai no `stderr`, não no stdout.** Se você só ler stdout, a UI fica muda durante um `up` inteiro. Mostre os dois canais, `stderr` em cor diferente — mas **não trate como erro**. Só o exit code decide sucesso ou falha.

**`--progress plain` é obrigatório.** O modo padrão emite sequências de reposicionamento de cursor para desenhar o TUI de barras. Num `<div>` isso vira sopa ilegível.

**`shell: false` com array, sempre.** `project` e paths vêm do usuário. Valide `project` com `/^[a-z0-9][a-z0-9_-]*$/` (máx. 63 chars) e tags de imagem contra o formato de referência antes de virarem argumento.

## 3. Comandos por ação

| Ação | Args |
|---|---|
| up | `['up','-d','--remove-orphans']` + `'--build'`, `'--force-recreate'`, `'--pull','always'`, serviços |
| down | `['down','--remove-orphans']` + `'-v'`, `'--rmi','local'` |
| restart | `['restart', ...services]` |
| build | `['build','--progress','plain']` + `'--no-cache'`, serviços |
| pull | `['pull']` |
| config | `['config','--format','json']` — buffer, não é Task |

## 4. `down` com arquivo ausente

Se o compose file foi movido ou renomeado, `-f` falha. Fallback: `docker compose -p <project> down` **sem** `-f` — o Compose v2+ derruba pelos labels dos recursos na maioria dos casos. Implemente como retry automático e teste explicitamente.

## 5. Mutex por projeto

Dois `up` simultâneos, ou `up` durante `down`, corrompem estado. Lock por nome de projeto (`common/utils/mutex.ts`); operação numa stack ocupada → **409 com o `taskId` em andamento**, para o front poder abrir a saída da operação que já está rodando.

## 6. Build de imagem — mesmo padrão

```ts
spawn('docker', ['build', '--progress','plain', '-f', dockerfileAbs,
                 ...tags.flatMap(t => ['-t', t]),
                 ...Object.entries(buildArgs).flatMap(([k,v]) => ['--build-arg', `${k}=${v}`]),
                 ...(noCache ? ['--no-cache'] : []), contextPath],
      { cwd: contextPath, shell: false, env: { ...process.env, BUILDKIT_PROGRESS: 'plain' } });
```

Este é o caminho **padrão** (`engine: 'cli'`): BuildKit, `.dockerignore` nativo, cache moderno, zero código de tar. O `dockerode.buildImage()` usa o builder clássico, deprecado no Docker 29 — fica como fallback (ver skill `dockerode-streams`).

## 7. Toda execução vira Task

O `emit` acima é o do `TaskRegistry`. O POST responde `202 {taskId}` na hora; o front abre `GET /api/tasks/:id/stream`. É isso que faz um `up` de 5 minutos sobreviver a um F5 e permite reabrir a saída depois.

Ring buffer com cap (~5.000 linhas): um `compose build --no-cache` de monorepo gera dezenas de milhares.

## 8. Dentro de container

O app precisa do **CLI + plugins** no PATH (não do daemon — tudo passa pelo socket montado):

```dockerfile
COPY --from=docker:29-cli            /usr/local/bin/docker /usr/local/bin/docker
COPY --from=docker/compose-bin:v5    /docker-compose  /usr/local/libexec/docker/cli-plugins/docker-compose
COPY --from=docker/buildx-bin:latest /buildx          /usr/local/libexec/docker/cli-plugins/docker-buildx
RUN docker compose version    # falha cedo se a tag mudar de layout
```

O compose file da stack alvo é lido no path do container. Como o bind é **espelhado**, `working_dir` e `config_files` batem, e bind mounts relativos (`./src:/app/src`) resolvem para um path que existe **no host** — que é o que importa, já que quem monta é o daemon do host. Esse é o motivo inteiro do espelhamento.

Limite conhecido: compose alvo usando `~` ou `${HOME}` resolve errado dentro do container. Mitigue com `HOME=/home/wesley` no environment, e detecte `include:`/`extends:` apontando para fora da raiz espelhada no `compose config`, mostrando aviso claro em vez de erro críptico.
