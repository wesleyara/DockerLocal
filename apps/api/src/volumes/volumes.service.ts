import { ForbiddenException, Inject, Injectable } from '@nestjs/common';
import type Docker from 'dockerode';
import type { VolumeSummary, VolumesListResult } from '@dockerlocal/shared';
import { DOCKER_CLIENT } from '../docker/docker.provider';
import { SelfDetectService } from '../docker/self-detect.service';
import { RemoveVolumeQuery } from './dto/remove-volume.dto';
import { CreateVolumeBody } from './dto/create-volume.dto';
import { PruneVolumesBody } from './dto/prune-volumes.dto';

const COMPOSE_PROJECT_LABEL = 'com.docker.compose.project';

/** `@types/dockerode` 4.0.1 não declara `CreatedAt`, mas a API 1.55 devolve. */
type VolumeInspectInfoRaw = Docker.VolumeInspectInfo & { CreatedAt?: string };

@Injectable()
export class VolumesService {
  constructor(
    @Inject(DOCKER_CLIENT) private readonly docker: Docker,
    private readonly selfDetect: SelfDetectService,
  ) {}

  async list(): Promise<VolumesListResult> {
    const [{ Volumes, Warnings }, containers] = await Promise.all([
      this.docker.listVolumes(),
      this.docker.listContainers({ all: true }),
    ]);

    const usedBy = new Map<string, string[]>();
    for (const c of containers) {
      for (const mount of c.Mounts ?? []) {
        if (mount.Type !== 'volume' || !mount.Name) continue;
        const names = usedBy.get(mount.Name) ?? [];
        names.push((c.Names?.[0] ?? '').replace(/^\//, ''));
        usedBy.set(mount.Name, names);
      }
    }

    return {
      volumes: (Volumes ?? []).map((v) =>
        this.normalize(v as VolumeInspectInfoRaw, usedBy.get(v.Name) ?? []),
      ),
      warnings: Warnings ?? [],
    };
  }

  async inspect(name: string): Promise<Docker.VolumeInspectInfo> {
    return this.docker.getVolume(name).inspect();
  }

  async create(body: CreateVolumeBody): Promise<Docker.VolumeCreateResponse> {
    return this.docker.createVolume({
      Name: body.name,
      Driver: body.driver,
      Labels: body.labels,
    });
  }

  async remove(name: string, query: RemoveVolumeQuery): Promise<void> {
    if (this.selfDetect.isSelfVolume(name)) {
      throw new ForbiddenException(
        'Não é possível remover um volume usado pelo próprio container do DockerLocal.',
      );
    }
    await this.docker.getVolume(name).remove({ force: query.force ?? false });
  }

  async prune(body: PruneVolumesBody): Promise<Docker.PruneVolumesInfo> {
    const filters = body.all ? { all: ['true'] } : undefined;
    return this.docker.pruneVolumes(filters ? { filters } : {});
  }

  private normalize(v: VolumeInspectInfoRaw, usedBy: string[]): VolumeSummary {
    const labels = v.Labels ?? {};

    return {
      name: v.Name,
      driver: v.Driver,
      mountpoint: v.Mountpoint,
      createdAt: v.CreatedAt,
      labels,
      project: labels[COMPOSE_PROJECT_LABEL],
      usedBy,
      size: v.UsageData?.Size,
      isSelf: this.selfDetect.isSelfVolume(v.Name),
    };
  }
}
