import { Inject, Injectable } from '@nestjs/common';
import type Docker from 'dockerode';
import type {
  PruneResultItem,
  SystemDiskUsage,
  SystemPruneResult,
} from '@dockerlocal/shared';
import { DOCKER_CLIENT } from '../docker/docker.provider';
import { PruneSystemBody } from './dto/prune-system.dto';

interface DfContainer {
  SizeRw?: number;
  State?: string;
}

interface DfImage {
  Size?: number;
  Containers?: number;
}

interface DfVolume {
  UsageData?: { Size?: number; RefCount?: number };
}

interface DfBuildCache {
  Size?: number;
  InUse?: boolean;
}

interface DfResult {
  Containers?: DfContainer[];
  Images?: DfImage[];
  Volumes?: DfVolume[];
  BuildCache?: DfBuildCache[];
}

/** `dockerode.df()` não tem tipo declarado — a API 1.55 devolve o shape de `/system/df`. */
interface BuildCachePruneRaw {
  CachesDeleted?: string[];
  SpaceReclaimed: number;
}

@Injectable()
export class SystemService {
  constructor(@Inject(DOCKER_CLIENT) private readonly docker: Docker) {}

  async diskUsage(): Promise<SystemDiskUsage> {
    const df = (await this.docker.df()) as DfResult;

    const containers = df.Containers ?? [];
    const images = df.Images ?? [];
    const volumes = df.Volumes ?? [];
    const buildCache = df.BuildCache ?? [];

    return {
      containers: {
        count: containers.length,
        active: containers.filter((c) => c.State === 'running').length,
        size: sum(containers.map((c) => c.SizeRw)),
        reclaimable: sum(
          containers
            .filter((c) => c.State !== 'running')
            .map((c) => c.SizeRw),
        ),
      },
      images: {
        count: images.length,
        active: images.filter((i) => (i.Containers ?? 0) > 0).length,
        size: sum(images.map((i) => i.Size)),
        reclaimable: sum(
          images.filter((i) => (i.Containers ?? 0) <= 0).map((i) => i.Size),
        ),
      },
      volumes: {
        count: volumes.length,
        active: volumes.filter((v) => (v.UsageData?.RefCount ?? 0) > 0)
          .length,
        size: sum(volumes.map((v) => v.UsageData?.Size)),
        reclaimable: sum(
          volumes
            .filter((v) => (v.UsageData?.RefCount ?? 0) === 0)
            .map((v) => v.UsageData?.Size),
        ),
      },
      buildCache: {
        count: buildCache.length,
        size: sum(buildCache.map((b) => b.Size)),
        reclaimable: sum(
          buildCache.filter((b) => !b.InUse).map((b) => b.Size),
        ),
      },
    };
  }

  async prune(body: PruneSystemBody): Promise<SystemPruneResult> {
    const results: PruneResultItem[] = [];

    if (body.targets.includes('containers')) {
      const r = await this.docker.pruneContainers();
      results.push({
        target: 'containers',
        itemsDeleted: r.ContainersDeleted?.length ?? 0,
        spaceReclaimed: r.SpaceReclaimed ?? 0,
      });
    }

    if (body.targets.includes('images')) {
      const filters = body.imagesAll ? {} : { dangling: ['true'] };
      const r = await this.docker.pruneImages({ filters });
      results.push({
        target: 'images',
        itemsDeleted: r.ImagesDeleted?.length ?? 0,
        spaceReclaimed: r.SpaceReclaimed ?? 0,
      });
    }

    if (body.targets.includes('volumes')) {
      const filters = body.volumesAll ? { all: ['true'] } : undefined;
      const r = await this.docker.pruneVolumes(
        filters ? { filters } : {},
      );
      results.push({
        target: 'volumes',
        itemsDeleted: r.VolumesDeleted?.length ?? 0,
        spaceReclaimed: r.SpaceReclaimed ?? 0,
      });
    }

    if (body.targets.includes('buildCache')) {
      const r = (await this.docker.pruneBuilder()) as BuildCachePruneRaw;
      results.push({
        target: 'buildCache',
        itemsDeleted: r.CachesDeleted?.length ?? 0,
        spaceReclaimed: r.SpaceReclaimed ?? 0,
      });
    }

    return {
      results,
      totalSpaceReclaimed: sum(results.map((r) => r.spaceReclaimed)),
    };
  }
}

function sum(values: Array<number | undefined>): number {
  return values.reduce<number>((acc, v) => acc + (v ?? 0), 0);
}
