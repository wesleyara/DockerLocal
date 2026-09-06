import { BadRequestException, Inject, Injectable, Logger } from '@nestjs/common';
import type Docker from 'dockerode';
import { DOCKER_CLIENT } from '../docker/docker.provider';
import { SelfDetectService } from '../docker/self-detect.service';
import { TaskRegistryService } from '../tasks/task-registry.service';
import { StackDiscoveryService } from './stack-discovery.service';
import { ComposeCliService } from './compose-cli.service';

/**
 * Rebuilda a própria imagem e troca o próprio container.
 *
 * O `docker compose build` roda normal, como task, dentro do processo atual
 * — seguro, não mexe no container rodando. Já o `up --force-recreate` mata
 * o container que o está executando: se rodasse como processo filho daqui,
 * o `docker stop` do próprio container mataria o `docker compose up` no
 * meio da troca, sem nunca criar o container novo. Por isso essa parte sobe
 * como um container "sibling" descartável (mesma imagem, socket e bind
 * espelhado do container atual, `AutoRemove: true`) — ele sobrevive à morte
 * deste processo e termina a troca sozinho.
 */
@Injectable()
export class SelfUpdateService {
  private readonly logger = new Logger(SelfUpdateService.name);

  constructor(
    @Inject(DOCKER_CLIENT) private readonly docker: Docker,
    private readonly selfDetect: SelfDetectService,
    private readonly discovery: StackDiscoveryService,
    private readonly composeCli: ComposeCliService,
    private readonly tasks: TaskRegistryService,
  ) {}

  async rebuild(): Promise<{ taskId: string }> {
    const selfId = this.selfDetect.selfContainerId;
    if (!selfId) {
      throw new BadRequestException(
        'Rebuild automático só está disponível quando o DockerLocal está rodando no próprio container (veja docker-compose.yml).',
      );
    }

    const target = await this.discovery.selfStackTarget();
    if (!target || !target.configFiles.length) {
      throw new BadRequestException(
        'Não foi possível identificar o compose file do próprio DockerLocal.',
      );
    }

    const { taskId, started } = this.composeCli.tryStart({
      project: target.project,
      kind: 'compose-build',
      label: `build ${target.project} (self)`,
      workingDir: target.workingDir,
      configFiles: target.configFiles,
      args: ['build', '--progress', 'plain'],
    });

    if (started) {
      this.tasks
        .get(taskId)
        ?.done$.subscribe((task) => {
          if (task.status !== 'succeeded') return;
          this.swap(selfId, target).catch((err) => {
            this.logger.error(
              `Falha ao trocar o próprio container: ${(err as Error).message}`,
            );
          });
        });
    }

    return { taskId };
  }

  private async swap(
    selfId: string,
    target: { project: string; workingDir: string; configFiles: string[] },
  ): Promise<void> {
    const info = await this.docker.getContainer(selfId).inspect();

    this.logger.log(
      `Build concluído — subindo o container "updater" para trocar ${info.Name}.`,
    );

    const updater = await this.docker.createContainer({
      Image: info.Config.Image,
      Cmd: [
        'docker',
        'compose',
        '-p',
        target.project,
        ...target.configFiles.flatMap((f) => ['-f', f]),
        'up',
        '-d',
        '--force-recreate',
        '--remove-orphans',
      ],
      WorkingDir: target.workingDir,
      User: info.Config.User,
      Env: info.Config.Env,
      Labels: { 'com.dockerlocal.self-updater': 'true' },
      HostConfig: {
        Binds: info.HostConfig.Binds,
        GroupAdd: info.HostConfig.GroupAdd,
        AutoRemove: true,
      },
    });

    await updater.start();
  }
}
