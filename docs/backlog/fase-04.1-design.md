# Fase 04.1 — Design e UX

## Objetivo

O app funciona mas parece um protótipo: texto puro onde deveria haver ícone, tabelas cinzas sem hierarquia visual, feedback de ação limitado a um refetch silencioso. Esta fase não adiciona nenhum recurso novo — reformula a camada visual das quatro telas já existentes (Containers, Images, Volumes, Stacks) para o padrão de app atual (tipo Linear, Vercel, Railway): ícones consistentes, espaçamento generoso, feedback claro de cada ação, dark mode revisado.

Fase de baixo risco técnico, alto risco de gosto — trate como iterativa. Rode `pnpm dev` e compare visualmente a cada mudança em vez de aceitar às cegas.

## Decisão que importa aqui

**Iconify roda offline, sem chamada de rede.** O `<Icon>` padrão de `@iconify/vue` busca o SVG da API pública (`api.iconify.design`) em runtime — inaceitável num app cujo modelo de ameaça é "localhost, sem dependência externa" (ver `CLAUDE.md` → Segurança). Use `@iconify/vue` com `addCollection()` carregando o JSON de um único conjunto (`@iconify-json/lucide`) empacotado no bundle do Vite. Zero requisição de rede para ícone, funciona com o Docker Desktop do usuário desligado da internet.

Escolha **um conjunto de ícones só** (`lucide` recomendado — outline, consistente, cobre bem os casos daqui) e não misture com outro no meio do caminho.

**Tipografia também roda offline.** Mesma regra dos ícones: `IBM Plex Sans` (UI) e `IBM Plex Mono` (dados — IDs, portas, tamanhos, logs) via `@fontsource/ibm-plex-sans` e `@fontsource/ibm-plex-mono`, importados em `main.ts`. Nunca `<link>` pro Google Fonts na app de produção — isso é CDN externo, a mesma coisa que o Iconify resolve empacotando localmente.

**Sistema de cor:** neutros na escala `slate` do Tailwind (viés azul-ardósia, não cinza puro) + acento cobalto próprio (`--color-accent`, ver `style.css`) deliberadamente diferente do azul semântico do `StateBadge` — ação e estado não competem pelo mesmo tom. Guia completo (paleta, tipografia, espaçamento, componentes) no artefato publicado: https://claude.ai/code/artifact/a95b8782-16cd-494c-89c5-93c299abb9da

## Tarefas

### Fundação

- [ ] Instalar `@iconify/vue` e `@iconify-json/lucide` (dependência de build, não runtime)
- [ ] `src/icons.ts` — `addCollection(lucideIcons)` uma vez, importado em `main.ts`
- [ ] Confirmar na aba Network do devtools: nenhuma requisição para `api.iconify.design` depois de navegar pelas 4 abas

### Tokens de design

- [ ] Revisar `tailwind.config`/tema: escala de espaçamento e raio de borda consistentes (hoje cada componente escolhe `rounded`/`rounded-lg`/`rounded-full` ad-hoc)
- [ ] Paleta de acento única para ações primárias (hoje `blue-700`, `emerald-700` etc. se repetem soltos em cada componente) — considerar CSS custom properties para reduzir duplicação entre light/dark
- [ ] Hierarquia tipográfica: título de página, label de coluna, corpo — tamanhos e pesos consistentes entre `ContainersView`, `ImagesView`, `VolumesView`

### Layout

- [ ] `SideNav.vue` — ícone por rota (container/imagem/volume/stack) ao lado do label, estado ativo mais claro
- [ ] `StatusBar.vue` — ícone de conexão (plug/wifi) no lugar da bolinha colorida, mantendo o `title` com o texto para acessibilidade
- [ ] Revisar contraste do dark mode nas 4 views com a paleta nova

### Tabelas e ações

- [ ] `ActionButtons` (containers/images/volumes) — ícone + label ou ícone com `title`/tooltip, no lugar de botão só-texto; manter a mesma lógica de `pending`/força
- [ ] Tooltip nas ações destrutivas/ambíguas onde só o ícone não deixa claro o efeito (remover com força, parar vs. matar, remover volume/imagem em uso) — reforça o `title`/tooltip acima com uma explicação curta de uma linha, não só o nome da ação
- [ ] `ConfirmDialog` de remoção de volume — remover a exigência de digitar o nome (`requireTypedName` em `VolumesView.vue`/`volumes/ActionButtons.vue`); usar diálogo simples com nome do volume na mensagem + ícone de alerta quando houver uso ativo (mesmo padrão de containers/images)
- [ ] `StateBadge` — ícone pequeno (play/square/pause) junto da cor, não só a cor
- [ ] `EmptyState.vue` — aceitar um ícone (prop ou slot) grande acima da mensagem, no lugar do texto sozinho
- [ ] Skeleton de carregamento (linhas cinza-claro pulsando) em vez de tabela vazia enquanto `loading === true` e ainda não há `items`
- [ ] Ordenação client-side por coluna (nome, ID, tamanho, data de criação/status) nas tabelas de Containers/Images/Volumes — clique no header alterna asc/desc, seta indica direção e coluna ativa; sem chamada nova à API, ordena o array já carregado na store

### Feedback de ação

- [ ] Componente de toast (`components/common/Toast.vue` + composable `useToast()`, mesmo padrão singleton de `useConfirm`) para sucesso/erro de ação — hoje um 409 sem `canForce` estoura sem feedback visual nenhum na tabela
- [ ] `ConfirmDialog.vue` — ícone de alerta (▲) quando a ação é destrutiva
- [ ] Ligar erros não tratados das actions (`store.act`/`store.remove`) ao toast em vez de silenciarem

## Critério de aceite

- Abrir as 4 abas com o devtools Network aberto: nenhuma requisição a `api.iconify.design` ou qualquer host externo de ícone
- Comparar screenshot antes/depois lado a lado — a diferença deve ser óbvia sem precisar apontar
- Remover um container com sucesso → toast de confirmação aparece e some sozinho
- Tentar remover um recurso em uso (409) → toast ou diálogo explica o motivo, não fica em silêncio
- Dark mode: nenhum texto com contraste baixo (checar manualmente as 4 views)
- Clicar no header de nome/ID/tamanho de uma tabela ordena a lista; clicar de novo inverte a direção
- Passar o mouse sobre uma ação destrutiva/ambígua mostra o efeito em uma linha, sem precisar clicar
- Remover um volume não pede mais para digitar o nome — diálogo simples de confirmar/cancelar
- `pnpm build` sem novos erros de tipo

## Arquivos previstos

```
apps/web/src/icons.ts
apps/web/src/composables/useToast.ts
apps/web/src/components/common/Toast.vue
apps/web/src/components/common/EmptyState.vue        (alterado — prop de ícone)
apps/web/src/components/common/StateBadge.vue        (alterado — ícone)
apps/web/src/components/common/ConfirmDialog.vue     (alterado — ícone de alerta)
apps/web/src/components/layout/{SideNav.vue,StatusBar.vue}   (alterados)
apps/web/src/components/{containers,images,volumes}/ActionButtons.vue   (alterados)
apps/web/src/composables/useSortableTable.ts
```

## Notas

**Não é refatoração de arquitetura.** Loja/store, rotas e contrato de API não mudam nesta fase — é só a camada visual dos componentes já existentes. Se durante o trabalho aparecer vontade de mudar dado ou fluxo, isso é outra fase.

**Toast é novo, mas seguindo o padrão que já existe.** `useConfirm.ts` já resolve esse problema pra diálogo modal com um singleton reativo fora do `defineStore` — `useToast.ts` é o mesmo desenho (estado module-level + fila), montado uma vez em `AppShell.vue` do jeito que `ConfirmDialog` já é.
