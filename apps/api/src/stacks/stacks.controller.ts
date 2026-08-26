import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  MessageEvent,
  Param,
  Query,
  Post,
  Sse,
  UseGuards,
} from '@nestjs/common';
import { readFile } from 'node:fs/promises';
import { basename, dirname } from 'node:path';
import { EMPTY, Observable, concat, from, interval, merge, of } from 'rxjs';
import { bufferTime, filter, finalize, map, switchMap } from 'rxjs/operators';
import type { StackDetail, StackSummary } from '@dockerlocal/shared';
import { OriginGuard } from '../common/guards/origin.guard';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { PathSafetyService } from '../filesystem/path-safety.service';
import { TaskRegistryService } from '../tasks/task-registry.service';
import {
  LogSessionService,
  LogSession,
} from '../containers/log-session.service';
import { type LogQuery, logQuerySchema } from '../containers/dto/log-query.dto';
import { StackDiscoveryService } from './stack-discovery.service';
import { ComposeCliService, StartResult } from './compose-cli.service';
import { projectParamSchema, type ProjectParam } from './dto/project-param.dto';
import {
  composeUpBodySchema,
  composeBuildBodySchema,
  composeServicesBodySchema,
  type ComposeUpBody,
  type ComposeBuildBody,
  type ComposeServicesBody,
} from './dto/compose-up.dto';
import {
  composeDownBodySchema,
  type ComposeDownBody,
} from './dto/compose-down.dto';
import {
  createStackBodySchema,
  type CreateStackBody,
} from './dto/create-stack.dto';
import { sanitizeProjectName } from './project-name.util';
import { extractComposeExternalRefs } from './compose-external-refs.util';

const HEARTBEAT_MS = 20_000;

interface SubscribedService {
  service: string;
  session: LogSession;
  replay: ReturnType<LogSession['buffer']['toArray']>;
}

function respond({ taskId, started }: StartResult): { taskId: string } {
  if (!started) {
    throw new ConflictException({
      statusCode: 409,
      message: `Já existe uma operação em andamento nesta stack (task ${taskId})`,
      canForce: false,
      taskId,
    });
  }
  return { taskId };
}

@UseGuards(OriginGuard)
@Controller('stacks')
export class StacksController {
  constructor(
    private readonly discovery: StackDiscoveryService,
    private readonly composeCli: ComposeCliService,
    private readonly sessions: LogSessionService,
    private readonly pathSafety: PathSafetyService,
    private readonly tasks: TaskRegistryService,
  ) {}

  @Get()
  async list(): Promise<StackSummary[]> {
    return this.discovery.list();
  }

  /**
   * Sobe uma stack a partir de um compose file escolhido pelo file browser.
   * Registra no StackRegistry ANTES do `up` — se o `up` falhar, a stack
   * ainda aparece na aba (fase 6/7).
   */
  @Post('from-file')
  @HttpCode(202)
  async fromFile(
    @Body(new ZodValidationPipe(createStackBodySchema)) body: CreateStackBody,
  ): Promise<{ taskId: string }> {
    const composeFilePath = await this.pathSafety.resolveSafe(
      body.composeFilePath,
    );
    const workingDir = dirname(composeFilePath);
    const project = body.projectName
      ? body.projectName
      : sanitizeProjectName(basename(workingDir));

    let envFile: string | undefined;
    if (body.envFile) {
      envFile = await this.pathSafety.resolveSafe(body.envFile);
    }

    // `docker compose config` valida o arquivo e dá erro legível, em vez de
    // uma falha críptica no meio do `up`.
    try {
      await this.composeCli.config(workingDir, [composeFilePath]);
    } catch (err) {
      throw new BadRequestException(
        `Compose inválido: ${err instanceof Error ? err.message : 'erro desconhecido'}`,
      );
    }

    this.discovery.registerFromFile(project, workingDir, [composeFilePath]);

    const preflightWarnings = await this.detectExternalRefWarnings(
      composeFilePath,
      workingDir,
    );

    if (body.up === false) {
      const handle = this.tasks.create(
        'compose-register',
        `registrar ${project}`,
        {
          project,
        },
      );
      for (const warning of preflightWarnings) handle.emit('stderr', warning);
      handle.succeed({ project });
      return { taskId: handle.id };
    }

    const args = ['up', '-d', '--remove-orphans'];
    if (envFile) args.push('--env-file', envFile);

    return respond(
      this.composeCli.tryStart({
        project,
        kind: 'compose-up',
        label: `up ${project}`,
        workingDir,
        configFiles: [composeFilePath],
        args,
        preflightWarnings,
      }),
    );
  }

  private async detectExternalRefWarnings(
    composeFilePath: string,
    workingDir: string,
  ): Promise<string[]> {
    const raw = await readFile(composeFilePath, 'utf8').catch(() => '');
    const candidates = extractComposeExternalRefs(raw, workingDir);

    const warnings: string[] = [];
    for (const candidate of candidates) {
      try {
        await this.pathSafety.resolveSafe(candidate);
      } catch (err) {
        if (err instanceof ForbiddenException) {
          warnings.push(
            `Aviso: "${candidate}" (include/extends) está fora da raiz espelhada — pode quebrar quando o app roda em container.`,
          );
        }
      }
    }
    return warnings;
  }

  @Get(':project')
  async detail(
    @Param(new ZodValidationPipe(projectParamSchema)) params: ProjectParam,
  ): Promise<StackDetail> {
    return this.discovery.detail(params.project);
  }

  @Get(':project/config')
  async config(
    @Param(new ZodValidationPipe(projectParamSchema)) params: ProjectParam,
  ): Promise<unknown> {
    const target = await this.discovery.resolveTarget(params.project);
    return this.composeCli.config(target.workingDir, target.configFiles);
  }

  @Post(':project/up')
  @HttpCode(202)
  async up(
    @Param(new ZodValidationPipe(projectParamSchema)) params: ProjectParam,
    @Body(new ZodValidationPipe(composeUpBodySchema)) body: ComposeUpBody,
  ): Promise<{ taskId: string }> {
    const target = await this.discovery.resolveTarget(params.project);
    const args = ['up', '-d', '--remove-orphans'];
    if (body.build) args.push('--build');
    if (body.forceRecreate) args.push('--force-recreate');
    if (body.pull) args.push('--pull', body.pull);
    if (body.services?.length) args.push(...body.services);

    return respond(
      this.composeCli.tryStart({
        project: params.project,
        kind: 'compose-up',
        label: `up ${params.project}`,
        workingDir: target.workingDir,
        configFiles: target.configFiles,
        args,
      }),
    );
  }

  @Post(':project/down')
  @HttpCode(202)
  async down(
    @Param(new ZodValidationPipe(projectParamSchema)) params: ProjectParam,
    @Body(new ZodValidationPipe(composeDownBodySchema)) body: ComposeDownBody,
  ): Promise<{ taskId: string }> {
    await this.assertNotSelfStack(params.project, 'derrubar');
    const target = await this.discovery.resolveTarget(params.project);
    const args = ['down', '--remove-orphans'];
    if (body.volumes) args.push('-v');
    if (body.rmi) args.push('--rmi', body.rmi);

    return respond(
      this.composeCli.tryStart({
        project: params.project,
        kind: 'compose-down',
        label: `down ${params.project}`,
        workingDir: target.workingDir,
        configFiles: target.configFiles,
        args,
        fallbackOnMissingFiles: true,
      }),
    );
  }

  @Post(':project/start')
  @HttpCode(202)
  async start(
    @Param(new ZodValidationPipe(projectParamSchema)) params: ProjectParam,
    @Body(new ZodValidationPipe(composeServicesBodySchema))
    body: ComposeServicesBody,
  ): Promise<{ taskId: string }> {
    return this.simple(params.project, 'compose-start', 'start', body.services);
  }

  @Post(':project/stop')
  @HttpCode(202)
  async stop(
    @Param(new ZodValidationPipe(projectParamSchema)) params: ProjectParam,
    @Body(new ZodValidationPipe(composeServicesBodySchema))
    body: ComposeServicesBody,
  ): Promise<{ taskId: string }> {
    return this.simple(params.project, 'compose-stop', 'stop', body.services);
  }

  @Post(':project/restart')
  @HttpCode(202)
  async restart(
    @Param(new ZodValidationPipe(projectParamSchema)) params: ProjectParam,
    @Body(new ZodValidationPipe(composeServicesBodySchema))
    body: ComposeServicesBody,
  ): Promise<{ taskId: string }> {
    return this.simple(
      params.project,
      'compose-restart',
      'restart',
      body.services,
    );
  }

  @Post(':project/pull')
  @HttpCode(202)
  async pull(
    @Param(new ZodValidationPipe(projectParamSchema)) params: ProjectParam,
    @Body(new ZodValidationPipe(composeServicesBodySchema))
    body: ComposeServicesBody,
  ): Promise<{ taskId: string }> {
    return this.simple(params.project, 'compose-pull', 'pull', body.services);
  }

  @Post(':project/build')
  @HttpCode(202)
  async build(
    @Param(new ZodValidationPipe(projectParamSchema)) params: ProjectParam,
    @Body(new ZodValidationPipe(composeBuildBodySchema)) body: ComposeBuildBody,
  ): Promise<{ taskId: string }> {
    const target = await this.discovery.resolveTarget(params.project);
    const args = ['build', '--progress', 'plain'];
    if (body.noCache) args.push('--no-cache');
    if (body.services?.length) args.push(...body.services);

    return respond(
      this.composeCli.tryStart({
        project: params.project,
        kind: 'compose-build',
        label: `build ${params.project}`,
        workingDir: target.workingDir,
        configFiles: target.configFiles,
        args,
      }),
    );
  }

  @Delete(':project/registry')
  removeFromRegistry(
    @Param(new ZodValidationPipe(projectParamSchema)) params: ProjectParam,
  ): { ok: boolean } {
    return { ok: this.discovery.removeFromRegistry(params.project) };
  }

  /**
   * SSE agregado dos serviços da stack — um único EventSource, campo
   * `service` por linha. Nunca N conexões (teto de 3 SSE por aba).
   */
  @Sse(':project/logs/stream')
  logsStream(
    @Param(new ZodValidationPipe(projectParamSchema)) params: ProjectParam,
    @Query(new ZodValidationPipe(logQuerySchema)) query: LogQuery,
  ): Observable<MessageEvent> {
    const tail = query.tail ?? 100;

    return from(this.discovery.detail(params.project)).pipe(
      switchMap((detail) => {
        const targets = detail.services.flatMap((service) =>
          service.containers.map((c) => ({ service: service.name, id: c.id })),
        );

        return from(
          Promise.allSettled(
            targets.map((t): Promise<SubscribedService> =>
              this.sessions
                .subscribe(t.id, tail)
                .then(({ session, replay }) => ({
                  service: t.service,
                  session,
                  replay,
                })),
            ),
          ),
        ).pipe(
          switchMap((settled) => {
            const ok = settled
              .filter(
                (r): r is PromiseFulfilledResult<SubscribedService> =>
                  r.status === 'fulfilled',
              )
              .map((r) => r.value);

            const replayLines = ok
              .flatMap((r) =>
                r.replay.map((line) => ({
                  ...line,
                  service: r.service,
                  containerId: r.session.containerId,
                })),
              )
              .sort(
                (a, b) =>
                  (a.timestamp ?? '').localeCompare(b.timestamp ?? '') ||
                  a.seq - b.seq,
              );

            const replay$ = of<MessageEvent>({
              type: 'logs',
              data: { lines: replayLines, dropped: 0 },
            });

            const live$ = ok.length
              ? merge(
                  ...ok.map((r) =>
                    r.session.lines$.pipe(
                      map((line) => ({
                        ...line,
                        service: r.service,
                        containerId: r.session.containerId,
                      })),
                    ),
                  ),
                ).pipe(
                  bufferTime(100),
                  filter((lines) => lines.length > 0),
                  map((lines) => ({
                    type: 'logs',
                    data: { lines, dropped: 0 },
                  })),
                )
              : EMPTY;

            const heartbeat$ = interval(HEARTBEAT_MS).pipe(
              map(() => ({ type: 'ping', data: {} })),
            );

            return concat(replay$, merge(live$, heartbeat$)).pipe(
              finalize(() => {
                for (const r of ok)
                  this.sessions.release(r.session.containerId);
              }),
            );
          }),
        );
      }),
    );
  }

  private async simple(
    project: string,
    kind: string,
    action: 'start' | 'stop' | 'restart' | 'pull',
    services: string[] | undefined,
  ): Promise<{ taskId: string }> {
    if (action === 'stop' || action === 'restart') {
      await this.assertNotSelfStack(
        project,
        action === 'stop' ? 'parar' : 'reiniciar',
      );
    }
    const target = await this.discovery.resolveTarget(project);
    return respond(
      this.composeCli.tryStart({
        project,
        kind,
        label: `${action} ${project}`,
        workingDir: target.workingDir,
        configFiles: target.configFiles,
        args: [action, ...(services ?? [])],
      }),
    );
  }

  private async assertNotSelfStack(
    project: string,
    action: string,
  ): Promise<void> {
    if (await this.discovery.isSelfStack(project)) {
      throw new ForbiddenException(
        `Não é possível ${action} a própria stack do DockerLocal — isso derrubaria o app no meio do request.`,
      );
    }
  }
}
