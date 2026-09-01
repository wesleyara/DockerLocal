# Decisões (ADRs)

Registro curto do que foi decidido e **por quê** — para não re-litigar mais tarde.

---

## ADR-01 — Monorepo pnpm workspaces

`apps/api`, `apps/web`, `packages/shared`.

`shared` existe para que os tipos de recurso (`ContainerSummary`, `StackSummary`, `Task`…) sejam escritos uma vez e consumidos pelos dois lados sem publicar pacote. Consumido via TS path (`"main": "./src/index.ts"`), sem etapa de build.

**Consequência:** um `pnpm dev` sobe os dois apps; renomear um campo quebra o build dos dois lados na hora, que é o comportamento desejado.

---

## ADR-02 — dockerode para Engine API, CLI para orquestração

| Vai por dockerode | Vai por `spawn` do CLI |
|---|---|
| list / inspect | `docker compose up/down/build/pull` |
| start / stop / restart / kill / pause | `docker build` (BuildKit) |
| remove / prune | |
| logs / stats / events | |

**Por quê:** a Engine API não tem nenhum conceito de "stack" — Compose é uma ferramenta cliente que cria recursos comuns e os marca com labels. E BuildKit via API exige uma sessão gRPC que o dockerode não implementa.

**Consequência:** o container do app precisa do CLI + plugins compose/buildx no PATH.

---

## ADR-03 — Build por `docker build` (BuildKit), dockerode como fallback

Testado nesta máquina em 2026-08-25:

```
$ DOCKER_BUILDKIT=0 docker build ...
DEPRECATED: The legacy builder is deprecated and will be removed in a future release.
```

O builder clássico — que é exatamente o `POST /build` usado por `dockerode.buildImage()` — ainda funciona no Docker 29.7.1, mas tem prazo de validade.

**Decisão:** `engine: 'cli'` é o padrão (`docker build --progress plain`). Usa BuildKit, respeita `.dockerignore` nativamente, cache moderno, mesma infra de Task do compose, e zero código de montagem de tar.

O caminho `engine: 'api'` (dockerode + `tar-fs`) fica como fallback, porque não depende do CLI e dá eventos JSON estruturados. Limitações aceitas: sem cache mount, sem multi-stage paralelo, sem `--secret`.

---

## ADR-04 — SSE, não WebSocket

Todo o streaming do MVP é unidirecional: logs, eventos do daemon, saída de build/compose, stats.

**A favor:** `EventSource` nativo traz reconnect e `Last-Event-ID` de graça; `@Sse()` é first-class no Nest; socket.io custaria ~40 KB e um protocolo próprio; SSE se depura com `curl -N`; passa por qualquer proxy sem configurar upgrade.

**Contra, e a mitigação:** HTTP/1.1 limita a 6 conexões por origem. O design fica em no máximo 3 SSE por aba, e logs de múltiplos containers são **agregados no servidor**.

`EventSource` também não aceita headers customizados — se `AUTH_TOKEN` for ativado, a autenticação nos endpoints SSE vai por cookie `HttpOnly; SameSite=Strict`.

**Revisitar quando:** entrar o terminal `exec` (fase 10). Aí sim socket.io num Gateway `/ws/exec`, que é o único caso bidirecional real.

---

## ADR-05 — TaskRegistry para jobs longos

POST inicia e responde `202 {taskId}`; a saída sai por `GET /api/tasks/:id/stream` (SSE), com replay do ring buffer via `Last-Event-ID`.

**Por quê:** um `compose up` de 3 minutos numa request síncrona morre no primeiro refresh, e o usuário fica sem saber se rodou. Com Task, a operação sobrevive ao browser e a saída pode ser reaberta depois.

**Consequência de ordem:** a fase 5 (Tasks) vem **antes** de compose (7) e build (8). Construir os dois sem essa infra obriga a reescrevê-los.

---

## ADR-06 — Discovery de stacks por label, com registry de apoio

Stacks são descobertas agrupando `listContainers({all:true})` por `com.docker.compose.project`, usando `.project.config_files` e `.project.working_dir`. Volumes e networks carregam o mesmo label, então a stack se monta mesmo com tudo parado.

**O buraco:** uma stack que sofreu `down` completo não deixa recurso nenhum — some da lista.

**Solução:** `StackRegistryService` persiste em `~/.dockerlocal/stacks.json` os compose files já vistos ou adicionados pelo file browser. A listagem é a união de `source: 'discovered'` e `source: 'registry'`. É o que o Docker Desktop faz.

---

## ADR-07 — Sem auth no MVP, com fail-safe

Para uso single-user local, login é fricção sem ganho — o Docker Desktop tem o mesmo modelo. O que **realmente** protege é `OriginGuard` (anti-CSRF/DNS-rebinding) + bind em loopback, porque a ameaça real é uma aba de browser em site malicioso fazendo POST para `localhost`, não um atacante na rede.

O gancho fica pronto: `AUTH_TOKEN` vazio desativa o `TokenGuard`; preenchido, exige `Bearer`.

**Fail-safe obrigatório:** se alguém setar `HOST=0.0.0.0` sem `AUTH_TOKEN`, o app **recusa subir** com mensagem explícita. Isso vale mais que um login opcional que ninguém liga.

**Exceção da fase 9:** dentro do próprio container do app, o processo precisa escutar em `0.0.0.0` — publicar porta (`docker run -p`/compose) encaminha tráfego pra interface do container, nunca pro loopback interno dele. A proteção nesse caso vem de fora: `docker-compose.yml` publica só em `127.0.0.1`. O escape hatch é a env `DOCKER_LOCAL_CONTAINER=1`, setada **só** no `Dockerfile` do próprio app (nunca à mão) — ver `env.schema.ts`.

---

## ADR-08 — Tailwind 4 + componentes próprios

As tabelas aqui têm requisitos específicos (ações por linha, estado de transição, seleção múltipla) e um `DataTable` de biblioteca costuma atrapalhar mais que ajudar. O visual "Docker Desktop" sai direto do Tailwind.

Alternativa se a prioridade virar velocidade sobre acabamento: PrimeVue em modo unstyled + Tailwind. **Não misturar dois sistemas de estilo.**

---

## ADR-09 — Auto-detecção do próprio container, sem depender de uma única fonte

Rodando empacotado, o DockerLocal aparece na própria lista de containers — sem tratamento especial, um `down` na própria stack (ou um `stop` clicado sem querer) derruba o app no meio do request.

`SelfDetectService` (`apps/api/src/docker/self-detect.service.ts`) tenta, nessa ordem: `/proc/self/cgroup` (funciona mesmo com `HOSTNAME` customizado) → `HOSTNAME` (Docker usa o id curto do container por padrão) → varredura pela label `com.dockerlocal.self=true` (cobre o caso de cgroup v2 sem o path esperado *e* hostname customizado ao mesmo tempo). Três fontes porque cada uma sozinha tem um jeito plausível de falhar; fora de container (dev nativo via `pnpm dev`), nenhuma bate e tudo segue funcionando normal, com `isSelf` sempre `false`.

**Consequência:** `stop`/`restart`/`kill`/`remove` de container, `down`/`stop`/`restart` de stack e `remove` de imagem checam `isSelf` e voltam **403** em vez de deixar o request derrubar o processo que está respondendo a ele. O front espelha isso desabilitando os botões, mas o 403 no backend é quem garante — nunca confie só na UI.

---

## ADR-10 — Raízes do file browser: `.env` fixo + camada editável em runtime

`FS_ROOTS` no `.env` só é lido no boot — trocar exige editar o arquivo e reiniciar o processo. Empacotado em container, isso é fricção real (editar `.env` e recriar o container só pra abrir uma pasta nova).

**Decisão:** duas camadas. `FS_ROOTS` continua a base fixa, resolvida uma vez no boot. Raízes adicionadas pela UI (`POST /api/fs/roots`) vão pro `FsConfigService`, que persiste em `~/.dockerlocal/config.json` — mesmo padrão do `StackRegistryService` da fase 7 — e o `PathSafetyService` lê as duas listas em toda validação de path, sem cache, então uma raiz nova vale imediatamente sem reiniciar nada. Só raízes da camada runtime podem ser removidas pela API; uma raiz de `FS_ROOTS` exige editar o `.env` mesmo, porque é o operador da máquina que decidiu ela, não o usuário da UI.

Qualquer código que escreva em `~/.dockerlocal/config.json` precisa ler-modificar-escrever, nunca sobrescrever o objeto inteiro — é a mesma regra que valeu enquanto a CLI (ver ADR-11) também guardava sua própria chave ali.

---

## ADR-11 — Binário standalone via Node SEA, CLI `dockerlocal` removida

A fase 9 original previa uma CLI própria (`dockerlocal up/down/status/...`, estilo `kind`) só pra tirar a fricção de decorar flags de `docker compose`. Ela chegou a existir (`apps/cli`), mas dependia de Node instalado pra RODAR — o que contradizia a razão de ser dela: reduzir fricção, não trocar "decore as flags do compose" por "instale Node pra instalar uma CLI que chama o compose pra você".

**Decisão:** trocar a CLI por um binário standalone via [Node SEA](https://nodejs.org/api/single-executable-applications.html) que embute a API + o build do web inteiros — não só um wrapper fino de `docker compose`, o app inteiro roda nele, sem precisar de container nem de Node instalado. A CLI foi removida (`apps/cli` não existe mais); quem quer container usa `docker compose` direto (documentado no README), quem quer zero-instalação usa o binário.

**Como funciona** (`scripts/build-binary.mjs`, na raiz — não em `apps/api` nem `apps/web`, porque cruza os dois):
1. `pnpm --filter web build` e `pnpm --filter api build` (tsc) normalmente — nada muda nesses dois passos.
2. `esbuild` bundla o `main.js` **já compilado pelo tsc** (não o `.ts` fonte) num único CJS. Bundlar a partir do JS já compilado, não do TS, evita de vez a pergunta "o esbuild emite `emitDecoratorMetadata` certo pro DI do Nest?" — decorators já viraram chamadas de `Reflect.metadata(...)` antes do esbuild tocar no código.
3. Um plugin do esbuild intercepta o import de `apps/api/src/static/web-assets.generated.ts` (um stub vazio no repo) e o substitui pelo conteúdo inteiro de `apps/web/dist`, cada arquivo em base64 — só nesse bundle. Fora dele (dev, Docker, npm), o stub fica vazio e `setupStatic()` (`main.ts`) cai pro `apps/web/dist` do disco, sem nenhuma mudança de comportamento.
4. Baixa o `node` oficial de nodejs.org (versão travada abaixo) por plataforma — não usa o `node` do host que builda, pra o binário final não depender de coincidência de versão/arquitetura entre quem builda e o alvo.
5. `node --experimental-sea-config` gera o blob; `postject` injeta esse blob no binário do Node baixado.

**A pegadinha que custou a maior parte do tempo:** peer deps opcionais do Nest/dockerode (`class-validator`, `class-transformer`, `@nestjs/websockets`, `@nestjs/microservices`, `cpu-features`) não estão instaladas — hoje isso já é normal, o Nest embrulha esses `require()` em try/catch (`loadPackage`) e segue sem eles. Mas **dentro de um binário SEA, `require()` de qualquer coisa não-embutida e não-builtin do Node não cai no `node_modules` do disco como um require normal — ele lança `ERR_UNKNOWN_BUILTIN_MODULE` direto**, sem chance de try/catch a montante pegar do jeito que pegaria fora do SEA. `external: [...]` no esbuild não resolve isso (só empurra o problema pra esse mesmo erro em runtime); a saída foi um plugin que troca essas specific imports por um módulo stub que **lança um `Error` comum** — aí sim o try/catch de quem chama funciona igual sempre funcionou. `ssh2` quase entrou nessa lista por engano: parece opcional (só serve pra Docker via `ssh://`), mas o `docker-modem` o exige incondicionalmente no próprio module-load, sem try/catch — teve que ser bundlado de verdade. Só o binding nativo dele (`cpu-features`) é seguro de stubar.

**Windows:** cross-build a partir de Linux funciona (baixa o `node.exe` oficial, injeta o mesmo jeito) mas nunca é executado neste projeto pra validar — sem uma VM/CI Windows, é builda-e-confia. A assinatura Authenticode do `node.exe` original é invalidada pela injeção (documentado como esperado pelo próprio Node); pode gerar aviso do SmartScreen.

---

## ADR-12 — Scan de vulnerabilidades: Trivy como container sibling, não `docker scan`

`docker scan` (plugin da Snyk) foi descontinuado pela Docker Inc. e não existe mais no CLI a partir do Docker 25 — não é uma opção viável, mesmo sendo o que o usuário pediu por analogia ao Docker Desktop. `docker scout` é o substituto oficial, mas é plugin à parte, normalmente pede login/conta Docker Hub para o uso completo e também não vem instalado.

**Decisão:** usar a imagem oficial `aquasec/trivy` (versão travada abaixo), executada como container "sibling" via `docker run` com o mesmo socket que o app já usa — nunca instalada como binário no host nem embutida na imagem do próprio app.

**Por quê esse formato:** o app já tem o `docker` CLI no PATH (dev local) e no `Dockerfile` (runtime em container) para compose/build — reaproveitar isso pra rodar o scanner via `docker run` evita adicionar mais um binário para gerenciar/atualizar/pinar, e funciona igual nos dois ambientes sem tocar no `Dockerfile`.

**A pegadinha do path do socket:** como quem resolve os bind mounts do `docker run` é sempre o daemon do HOST (mesmo quando o comando é disparado de dentro do container do app, via socket montado — o clássico "Docker-outside-of-Docker"), o volume de cache do Trivy (`/root/.cache/`, onde fica o DB de CVEs, dezenas de MB) **precisa ser um volume nomeado** (`dockerlocal_trivy_cache`), nunca um bind mount por path — um bind mount aqui exigiria o mesmo espelhamento de path host/container que `PROJECTS_ROOT` usa (ADR de compose), o que não vale a pena só pra um diretório de cache. Volume nomeado é criado automaticamente no primeiro `docker run -v nome:path` e funciona igual em dev e em container.

**Consequência:** a primeira execução baixa a imagem do Trivy (~170 MB) e o DB de CVEs — pode levar minutos e aparece como progresso no `stderr` da Task, igual ao aviso de contexto de build grande. Scans seguintes reaproveitam o volume de cache e ficam na casa de segundos.

**Escopo do MVP:** só `--scanners vuln` (CVEs de pacotes de SO e de lockfiles) — sem secret scanning nem misconfig do Trivy, que são scanners separados e mais lentos.

**Pacotes sem CVE:** `--list-all-pkgs` traz o SBOM inteiro (SO + lockfiles), não só o que tem vulnerabilidade — cruzado em `normalize()` com a lista de vulnerabilidades por `target` pra render a aba "Sem CVE" da UI. Sem isso o trivy só devolve os pacotes vulneráveis, e a pergunta "essa imagem tem X sem CVE conhecida?" ficava sem resposta. Dedup por `target+nome+versão`: o mesmo pacote npm aparece várias vezes em instalações vendorizadas (ex.: `node_modules` aninhado por pnpm).

---

## Versões travadas

Verificadas no registry em 2026-08-25.

| Pacote | Versão |
|---|---|
| `dockerode` | 5.0.1 |
| `@types/dockerode` | 4.0.1 |
| `@nestjs/*` | 11.2.3 |
| `vue` | 3.5.41 |
| `vite` | 8.2.2 |
| `pinia` | 3.0.5 |
| `vue-router` | 5.2.0 |
| `tailwindcss` | 4.3.3 |
| `@tanstack/vue-virtual` | 3.13.36 |
| `zod` | 4.4.3 |
| `tar-fs` | 3.1.3 |
| `ignore` | 7.0.6 |
| `@xterm/xterm` | 6.0.0 (fase 10) |
| `socket.io` | 4.8.3 (fase 10) |
| `aquasec/trivy` (imagem Docker) | 0.74.0 |

**Aviso sobre `@types/dockerode`:** a tipagem não cobre tudo da API 1.55 e mente em pontos importantes — `container.logs()` devolve `Readable` com `follow:true` e `Buffer` sem, mas o tipo não distingue. Trate dockerode como fonte não tipada na fronteira do service e normalize para os tipos de `packages/shared`. **Nunca vaze `Dockerode.ContainerInfo` para o frontend.**

## Ambiente de referência

Docker Engine 29.7.1 (API 1.55) · Compose v5.4.0 · Buildx v0.36.0 · Node v24.19.0 · pnpm 11.23.0
Socket `/var/run/docker.sock` (`root:docker`, `660`), grupo `docker` = GID **973** nesta máquina.
