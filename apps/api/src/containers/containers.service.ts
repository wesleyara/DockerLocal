import { ForbiddenException, Inject, Injectable } from '@nestjs/common';
import type Docker from 'dockerode';
import type { ContainerSummary, ContainerState } from '@dockerlocal/shared';
import { DOCKER_CLIENT } from '../docker/docker.provider';
import { SelfDetectService } from '../docker/self-detect.service';
import { ListContainersQuery } from './dto/list-containers.dto';
import {
  KillContainerBody,
  RenameContainerBody,
  RestartContainerBody,
  StopContainerBody,
} from './dto/container-actions.dto';
import { RemoveContainerQuery } from './dto/remove-container.dto';

const COMPOSE_PROJECT_LABEL = 'com.docker.compose.project';
const COMPOSE_SERVICE_LABEL = 'com.docker.compose.service';
const COMPOSE_NUMBER_LABEL = 'com.docker.compose.container-number';
const COMPOSE_CONFIG_FILES_LABEL = 'com.docker.compose.project.config_files';
const COMPOSE_WORKING_DIR_LABEL = 'com.docker.compose.project.working_dir';

@Injectable()
export class ContainersService {
  constructor(
    @Inject(DOCKER_CLIENT) private readonly docker: Docker,
    private readonly selfDetect: SelfDetectService,
  ) {}

  async list(query: ListContainersQuery): Promise<ContainerSummary[]> {
    const raw = await this.docker.listContainers({ all: query.all ?? false });

    let summaries = raw.map((c) => this.normalize(c));

    if (query.project) {
      summaries = summaries.filter((c) => c.compose?.project === query.project);
    }
    if (query.status) {
      summaries = summaries.filter((c) => c.state === query.status);
    }

    return summaries;
  }

  async inspect(id: string): Promise<Docker.ContainerInspectInfo> {
    return this.docker.getContainer(id).inspect();
  }

  async start(id: string): Promise<void> {
    await this.docker.getContainer(id).start();
  }

  async stop(id: string, body: StopContainerBody): Promise<void> {
    this.assertNotSelf(id, 'parar');
    await this.docker.getContainer(id).stop(body.t ? { t: body.t } : undefined);
  }

  async restart(id: string, body: RestartContainerBody): Promise<void> {
    this.assertNotSelf(id, 'reiniciar');
    await this.docker
      .getContainer(id)
      .restart(body.t ? { t: body.t } : undefined);
  }

  async kill(id: string, body: KillContainerBody): Promise<void> {
    this.assertNotSelf(id, 'matar');
    await this.docker.getContainer(id).kill({ signal: body.signal });
  }

  async pause(id: string): Promise<void> {
    await this.docker.getContainer(id).pause();
  }

  async unpause(id: string): Promise<void> {
    await this.docker.getContainer(id).unpause();
  }

  async rename(id: string, body: RenameContainerBody): Promise<void> {
    await this.docker.getContainer(id).rename({ name: body.name });
  }

  async remove(id: string, query: RemoveContainerQuery): Promise<void> {
    this.assertNotSelf(id, 'remover');
    await this.docker.getContainer(id).remove({
      force: query.force ?? false,
      v: query.v ?? false,
    });
  }

  async prune(): Promise<Docker.PruneContainersInfo> {
    return this.docker.pruneContainers();
  }

  private normalize(c: Docker.ContainerInfo): ContainerSummary {
    const labels = c.Labels ?? {};
    const project = labels[COMPOSE_PROJECT_LABEL];

    const compose = project
      ? {
          project,
          service: labels[COMPOSE_SERVICE_LABEL] ?? '',
          containerNumber: Number(labels[COMPOSE_NUMBER_LABEL] ?? '0'),
          configFiles: (labels[COMPOSE_CONFIG_FILES_LABEL] ?? '')
            .split(',')
            .filter(Boolean),
          workingDir: labels[COMPOSE_WORKING_DIR_LABEL] ?? '',
        }
      : undefined;

    return {
      id: c.Id,
      shortId: c.Id.slice(0, 12),
      name: (c.Names?.[0] ?? '').replace(/^\//, ''),
      names: (c.Names ?? []).map((n) => n.replace(/^\//, '')),
      image: c.Image,
      imageId: c.ImageID,
      command: c.Command,
      state: this.normalizeState(c.State),
      status: c.Status,
      createdAt: c.Created,
      ports: (c.Ports ?? []).map((p) => ({
        ip: p.IP,
        private: p.PrivatePort,
        public: p.PublicPort,
        type: p.Type,
      })),
      labels,
      compose,
      isSelf: this.selfDetect.isSelfContainer(c.Id),
    };
  }

  private normalizeState(state: string): ContainerState {
    const known: ContainerState[] = [
      'running',
      'exited',
      'created',
      'paused',
      'restarting',
      'dead',
    ];
    return known.includes(state as ContainerState)
      ? (state as ContainerState)
      : 'exited';
  }

  private assertNotSelf(id: string, action: string): void {
    if (this.selfDetect.isSelfContainer(id)) {
      throw new ForbiddenException(
        `Não é possível ${action} o próprio container do DockerLocal — isso derrubaria o app no meio do request. Pare-o por fora (ex.: dockerlocal stop) se precisar mesmo.`,
      );
    }
  }
}
