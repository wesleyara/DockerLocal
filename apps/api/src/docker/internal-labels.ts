/**
 * Labels usadas para marcar recursos internos do próprio app (não criados
 * pelo usuário) — filtrados da UI, do `usedBy` e do stream de eventos.
 * Vive aqui (módulo `docker`, global) em vez de dentro de `volumes/` porque
 * `ContainersService` e `DockerEventsService` também precisam filtrar por
 * ela sem depender do módulo de volumes.
 */
export const HELPER_LABEL = 'com.dockerlocal.helper';
