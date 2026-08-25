# Backlog

Trabalho organizado em fases numeradas. **Comece sempre pela fase não concluída de menor número.**

## Estado

| # | Fase | Entrega visível | Status |
|---|---|---|---|
| [00](fase-00-esqueleto.md) | Esqueleto | tela "Docker 29.7.1 conectado" | ☑ |
| [01](fase-01-containers.md) | Containers | listagem + start/stop/restart/remove | ☑ |
| [02](fase-02-logs.md) | Logs | log ao vivo com virtual scroll | ☑ |
| [03](fase-03-eventos.md) | Eventos | listas se atualizam sozinhas | ☑ |
| [04](fase-04-images-volumes.md) | Images e Volumes | duas abas completas | ☑ |
| [04.1](fase-04.1-design.md) | Design e UX | ícones (Iconify), visual limpo, feedback de ação | ☐ |
| [05](fase-05-tasks.md) | Tasks | `pull` com saída ao vivo, sobrevive a F5 | ☐ |
| [06](fase-06-file-browser.md) | File browser | navegar e escolher compose/Dockerfile | ☐ |
| [07](fase-07-stacks.md) | Stacks | `invest-broker` e `capp` com up/down | ☐ |
| [08](fase-08-criacao.md) | Criação | build e stack a partir de arquivo — **MVP fechado** | ☐ |
| [09](fase-09-empacotamento.md) | Empacotamento | o app rodando em container | ☐ |
| [10](fase-10-pos-mvp.md) | Pós-MVP | stats, exec, inspect, networks | ☐ |

Marque `☑` aqui ao concluir uma fase.

## Convenções

Cada arquivo de fase tem:

- **Objetivo** — a frase que descreve o que passa a funcionar
- **Tarefas** — checkboxes, na ordem de execução
- **Critério de aceite** — comandos concretos que provam que funcionou
- **Arquivos previstos** — o que deve existir ao final

Regras que valem para todas:

1. **Toda fase termina com algo visível funcionando.** Não construa infra em bloco antes de ver resultado na tela.
2. **Tarefa marcada só quando o critério de aceite passa** — não quando o código foi escrito.
3. **Consulte a skill indicada antes de começar.** As pegadinhas listadas nelas são erros silenciosos que custam horas quando descobertos na tela.
4. Riscos conhecidos aparecem como tarefa **na fase onde mordem**, não numa lista solta.

## Duas ordens que não são arbitrárias

**Fase 5 (Tasks) vem antes de 7 (Stacks) e 8 (Criação).** Construir compose e build sem a infra de Task obriga a reescrever os dois. Ver ADR-05.

**Fase 6 (File browser) vem antes de 8.** A criação depende de escolher arquivo, e os testes de path traversal precisam existir antes de o caminho ser usado para valer.

## Fixtures

A máquina já tem os casos difíceis — não invente containers de teste:

| Recurso | Serve para |
|---|---|
| `invest-broker` — rodando, 6 serviços | stack completa; `invest-broker-api` é verboso (volume de log, virtual scroll) |
| `capp` — parado, 4 containers | discovery por label sem nada rodando |

Para o caminho TTY do demux, suba algo com `-t`. Os dois lados precisam de teste.

## Referências

- `../arquitetura.md` — módulos e o porquê de cada um
- `../api-contrato.md` — endpoints e canais SSE
- `../decisoes.md` — ADRs e versões travadas
- `../../CLAUDE.md` — as quatro regras que governam o código
