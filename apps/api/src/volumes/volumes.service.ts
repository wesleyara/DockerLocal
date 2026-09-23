import { ForbiddenException, Inject, Injectable } from '@nestjs/common';
import type Docker from 'dockerode';
import type { VolumeSummary, VolumesListResult } from '@dockerlocal/shared';
import { DOCKER_CLIENT } from '../docker/docker.provider';
import { SelfDetectService } from '../docker/self-detect.service';
import { RemoveVolumeQuery } from './dto/remove-volume.dto';
import { CreateVolumeBody } from './dto/create-volume.dto';
import { PruneVolumesBody } from './dto/prune-volumes.dto';
import { HELPER_LABEL, VolumeHelperService } from './volume-helper.service';

const COMPOSE_PROJECT_LABEL = 'com.docker.compose.project';

/** `@types/dockerode` 4.0.1 não declara `CreatedAt`, mas a API 1.55 devolve. */
type VolumeInspectInfoRaw = Docker.VolumeInspectInfo & { CreatedAt?: string };

@Injectable()
export class VolumesService {
  constructor(
    @Inject(DOCKER_CLIENT) private readonly docker: Docker,
    private readonly selfDetect: SelfDetectService,
    private readonly helper: VolumeHelperService,
  ) {}

  async list(): Promise<VolumesListResult> {
    const [{ Volumes, Warnings }, containers] = await Promise.all([
      this.docker.listVolumes(),
      this.docker.listContainers({ all: true }),
    ]);

    const usedBy = new Map<string, string[]>();
    for (const c of containers) {
      // Helper de navegação de volume é interno — não deve fazer o volume
      // parecer "em uso" e bloquear a remoção dele.
      if (c.Labels?.[HELPER_LABEL]) continue;
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
    // Se o navegador de volume abriu um helper para este volume, ele
    // segura o volume "em uso" do ponto de vista do daemon — libera antes.
    await this.helper.release(name);
    await this.docker.getVolume(name).remove({ force: query.force ?? false });
  }

  async prune(body: PruneVolumesBody): Promise<Docker.PruneVolumesInfo> {
    await this.helper.releaseAll();
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
