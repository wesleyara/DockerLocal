# Fase 06 — File browser

## Objetivo

Navegar pelas pastas de projeto a partir da UI e escolher um `docker-compose.yml` ou `Dockerfile`.

Sozinha não entrega funcionalidade visível ao usuário final — é a peça que as fases 7 e 8 consomem. Vem antes delas porque **os testes de path traversal precisam existir antes de o caminho ser usado para valer**.

Este é o módulo mais sensível do app em termos de segurança.

## Tarefas

### Backend

- [ ] `FS_ROOTS` no `.env` (lista separada por `:`), passando por `realpath` no boot
- [ ] `PathSafetyService.resolveSafe(requested)`:
  - rejeitar path não absoluto
  - `path.resolve()` → mata `../..`
  - **`fs.realpath()` ANTES da comparação** → mata symlink apontando para fora
  - comparar com `real === root || real.startsWith(root + path.sep)`
- [ ] `GET /api/fs/roots` → `[{ label, path }]`
- [ ] `GET /api/fs/list?path=&showHidden=false` → `{ path, parent, entries[] }`; `parent: null` quando o path é uma raiz
- [ ] Marcar `isCompose` / `isDockerfile` em cada entry
- [ ] `GET /api/fs/detect?path=` → `{ kind, composeFiles[], dockerfiles[] }`
- [ ] `GET /api/fs/read?path=` — allowlist de nomes (`Dockerfile*`, `*.yml`, `*.yaml`), limite de 512 KB, `truncated: bool`
- [ ] **Bloquear leitura de `.env`, `*.pem`, `*.key`** — o browser precisa poder *selecionar* um `.env` como argumento do compose, mas nunca *exibir* o conteúdo
- [ ] Ordenar: diretórios primeiro, depois alfabético
- [ ] Tratar `EACCES` e `ENOENT` com mensagem clara em vez de 500

### Testes (escrever nesta fase, não depois)

- [ ] `../../../etc/passwd` → 403
- [ ] `/etc` (fora da raiz) → 403
- [ ] symlink dentro da raiz apontando para fora → 403
- [ ] `/home/wesley/Documents/development-secreto` **não** passa como filho de `/home/wesley/Documents/development` (o teste do `path.sep`)
- [ ] path relativo → 400
- [ ] `read` de um `.env` → 403
- [ ] arquivo acima de 512 KB → `truncated: true`

### Frontend

- [ ] `FileBrowserDialog.vue` com prop `mode: 'compose' | 'dockerfile' | 'dir'`
- [ ] `RootSelector.vue` no topo, `FileList.vue` com breadcrumb navegável
- [ ] Ícone distinto para compose e Dockerfile; botão "usar este arquivo" habilitado só quando o tipo casa com o `mode`
- [ ] Ao entrar num diretório, chamar `/api/fs/detect` e **destacar as sugestões** — economiza a maior parte dos cliques
- [ ] Não permitir navegar acima da raiz (`parent: null`)
- [ ] Preview do arquivo selecionado (via `/api/fs/read`)
- [ ] `SettingsView.vue` mostrando as raízes configuradas

## Critério de aceite

```bash
curl -s 'localhost:5100/api/fs/roots'
curl -s 'localhost:5100/api/fs/list?path=/home/wesley/Documents/development' | jq '.entries[].name'
curl -s 'localhost:5100/api/fs/detect?path=/home/wesley/Documents/development/invest-broker'
# deve achar docker-compose.yml

# Traversal — todos 403
curl -s -o /dev/null -w '%{http_code}\n' 'localhost:5100/api/fs/list?path=/etc'
curl -s -o /dev/null -w '%{http_code}\n' 'localhost:5100/api/fs/list?path=/home/wesley/Documents/development/../../../etc'
ln -s /etc /home/wesley/Documents/development/escape-test
curl -s -o /dev/null -w '%{http_code}\n' 'localhost:5100/api/fs/list?path=/home/wesley/Documents/development/escape-test'
rm /home/wesley/Documents/development/escape-test
```

- O dialog abre em `~/Documents/development`, lista os projetos, e entrar em `invest-broker` destaca o `docker-compose.yml`
- Breadcrumb não deixa subir além da raiz
- Todos os testes de traversal passam
- Tentar ler um `.env` → 403

## Arquivos previstos

```
apps/api/src/filesystem/{filesystem.module.ts,filesystem.controller.ts,path-safety.service.ts,file-detect.service.ts}
apps/api/src/filesystem/path-safety.service.spec.ts
packages/shared/src/fs.types.ts
apps/web/src/api/fs.api.ts
apps/web/src/components/fs/{FileBrowserDialog.vue,FileList.vue,RootSelector.vue}
apps/web/src/views/SettingsView.vue
```

## As duas armadilhas de segurança

**1. `realpath` tem que vir ANTES da comparação de prefixo.** Comparar a string crua deixa passar `/raiz/link-para-etc` — o path *parece* estar dentro da raiz, mas resolve para fora.

**2. `startsWith(root)` sem separador é falso positivo.** `/home/wesley/Documents/development-secreto` começa com `/home/wesley/Documents/development`. Compare com `root + path.sep`, ou trate igualdade exata separadamente.

## Configuração

`FS_ROOTS=/home/wesley/Documents/development`

Não use `/home/wesley` e muito menos `/`. A raiz define exatamente o que o app consegue enxergar — mantenha o mínimo que serve.
