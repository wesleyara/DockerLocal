import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { access, constants } from 'node:fs/promises';
import type Docker from 'dockerode';
import type {
  ContainerSummary,
  StackDetail,
  StackService,
  StackStatus,
  StackSummary,
} from '@dockerlocal/shared';
import { DOCKER_CLIENT } from '../docker/docker.provider';
import { SelfDetectService } from '../docker/self-detect.service';
import { ContainersService } from '../containers/containers.service';
import { StackRegistryService } from './stack-registry.service';

const L = {
  project: 'com.docker.compose.project',
  service: 'com.docker.compose.service',
  workingDir: 'com.docker.compose.project.working_dir',
  configFiles: 'com.docker.compose.project.config_files',
  // 'True', com T maiúsculo — comparar com 'true' deixa containers de
  // `compose run` passarem como serviço normal da stack.
  oneoff: 'com.docker.compose.oneoff',
};

interface RawGroup {
  containers: Docker.ContainerInfo[];
  volumes: string[];
  networks: string[];
}

function splitConfigFiles(raw: string | undefined): string[] {
  return (raw ?? '').split(',').filter(Boolean);
}

@Injectable()
export class StackDiscoveryService {
  constructor(
    @Inject(DOCKER_CLIENT) private readonly docker: Docker,
    private readonly registry: StackRegistryService,
    private readonly containersService: ContainersService,
    private readonly selfDetect: SelfDetectService,
  ) {}

  /** Usado pelo controller pra bloquear down/stop/restart na própria stack. */
  async isSelfStack(project: string): Promise<boolean> {
    const groups = await this.rawGroups();
    const group = groups.get(project);
    return (group?.containers ?? []).some((c) =>
      this.selfDetect.isSelfContainer(c.Id),
    );
  }

  /** Acha o projeto/working_dir/config_files da stack que contém o próprio container — `null` fora de container. */
  async selfStackTarget(): Promise<{
    project: string;
    workingDir: string;
    configFiles: string[];
  } | null> {
    const groups = await this.rawGroups();
    for (const [project, group] of groups) {
      const first = group.containers.find((c) =>
        this.selfDetect.isSelfContainer(c.Id),
      );
      if (!first) continue;
      return {
        project,
        workingDir: first.Labels[L.workingDir] ?? '',
        configFiles: splitConfigFiles(first.Labels[L.configFiles]),
      };
    }
    return null;
  }

  async list(): Promise<StackSummary[]> {
    const groups = await this.rawGroups();
    this.selfHealRegistry(groups);

    const projects = new Set([
      ...groups.keys(),
      ...this.registry.list().map((e) => e.project),
    ]);

    const summaries = await Promise.all(
      [...projects].map((project) =>
        this.summarize(project, groups.get(project)),
      ),
    );
    return summaries.sort((a, b) => a.project.localeCompare(b.project));
  }

  async detail(project: string): Promise<StackDetail> {
    const groups = await this.rawGroups();
    const group = groups.get(project);

    if (!group && !this.registry.get(project)) {
      throw new NotFoundException(`Stack "${project}" não encontrada`);
    }
    this.selfHealRegistry(groups);

    const summary = await this.summarize(project, group);

    const allContainers = await this.containersService.list({
      all: true,
      project,
    });
    const containers = allContainers.filter(
      (c) => c.labels[L.oneoff] !== 'True',
    );

    const servicesMap = new Map<string, ContainerSummary[]>();
    for (const c of containers) {
      const name = c.compose?.service || '(sem serviço)';
      const arr = servicesMap.get(name) ?? [];
      arr.push(c);
      servicesMap.set(name, arr);
    }
    const services: StackService[] = [...servicesMap.entries()]
      .map(([name, items]) => ({ name, containers: items }))
      .sort((a, b) => a.name.localeCompare(b.name));

    return {
      ...summary,
      services,
      volumes: group?.volumes ?? [],
      networks: group?.networks ?? [],
    };
  }

  /** Resolve working_dir/config_files para uso pelo ComposeCliService. */
  async resolveTarget(
    project: string,
  ): Promise<{ workingDir: string; configFiles: string[] }> {
    const groups = await this.rawGroups();
    const group = groups.get(project);
    if (group?.containers.length) {
      const first = group.containers[0];
      return {
        workingDir: first.Labels[L.workingDir] ?? '',
        configFiles: splitConfigFiles(first.Labels[L.configFiles]),
      };
    }

    const entry = this.registry.get(project);
    if (entry) {
      return { workingDir: entry.workingDir, configFiles: entry.configFiles };
    }
    throw new NotFoundException(`Stack "${project}" não encontrada`);
  }

  removeFromRegistry(project: string): boolean {
    return this.registry.remove(project);
  }

  /** Registra a stack antes do `up`, para ela aparecer mesmo se o `up` falhar. */
  registerFromFile(
    project: string,
    workingDir: string,
    configFiles: string[],
  ): void {
    this.registry.upsert({ project, workingDir, configFiles });
  }

  private async rawGroups(): Promise<Map<string, RawGroup>> {
    const [containers, volumesResp, networks] = await Promise.all([
      this.docker.listContainers({ all: true }),
      this.docker.listVolumes(),
      this.docker.listNetworks(),
    ]);

    const groups = new Map<string, RawGroup>();
    const ensure = (project: string): RawGroup => {
      let group = groups.get(project);
      if (!group) {
        group = { containers: [], volumes: [], networks: [] };
        groups.set(project, group);
      }
      return group;
    };

    for (const c of containers) {
      const labels = c.Labels ?? {};
      const project = labels[L.project];
      if (!project) continue;
      if (labels[L.oneoff] === 'True') continue;
      ensure(project).containers.push(c);
    }
    for (const v of volumesResp.Volumes ?? []) {
      const project = v.Labels?.[L.project];
      if (project) ensure(project).volumes.push(v.Name);
    }
    for (const n of networks) {
      const project = n.Labels?.[L.project];
      if (project) ensure(project).networks.push(n.Name);
    }

    return groups;
  }

  /** Aprende compose files de qualquer stack viva — é o que sobrevive a um `down` completo. */
  private selfHealRegistry(groups: Map<string, RawGroup>): void {
    for (const [project, group] of groups) {
      if (group.containers.length === 0) continue;
      const first = group.containers[0];
      this.registry.upsert({
        project,
        workingDir: first.Labels[L.workingDir] ?? '',
        configFiles: splitConfigFiles(first.Labels[L.configFiles]),
      });
    }
  }

  private async summarize(
    project: string,
    group: RawGroup | undefined,
  ): Promise<StackSummary> {
    const entry = this.registry.get(project);
    const containers = group?.containers ?? [];
    const first = containers[0];

    const workingDir = first?.Labels[L.workingDir] ?? entry?.workingDir ?? '';
    const configFiles = first
      ? splitConfigFiles(first.Labels[L.configFiles])
      : (entry?.configFiles ?? []);

    const runningCount = containers.filter((c) => c.State === 'running').length;
    const status: StackStatus =
      containers.length === 0 || runningCount === 0
        ? 'stopped'
        : runningCount === containers.length
          ? 'running'
          : 'partial';

    const serviceNames = new Set(
      containers.map((c) => c.Labels[L.service]).filter(Boolean),
    );

    const fileExists =
      configFiles.length > 0 &&
      (await Promise.all(configFiles.map((f) => this.exists(f)))).every(
        Boolean,
      );

    const hasDiscoveredResources =
      !!group &&
      (group.containers.length > 0 ||
        group.volumes.length > 0 ||
        group.networks.length > 0);

    return {
      project,
      status,
      source: hasDiscoveredResources ? 'discovered' : 'registry',
      workingDir,
      configFiles,
      fileExists,
      serviceCount: serviceNames.size,
      containerCount: containers.length,
      runningCount,
      isSelf: containers.some((c) => this.selfDetect.isSelfContainer(c.Id)),
    };
  }

  private async exists(path: string): Promise<boolean> {
    try {
      await access(path, constants.F_OK);
      return true;
    } catch {
      return false;
    }
  }
}
