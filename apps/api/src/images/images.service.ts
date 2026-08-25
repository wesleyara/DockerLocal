import { Inject, Injectable } from '@nestjs/common';
import type Docker from 'dockerode';
import type { ImageSummary } from '@dockerlocal/shared';
import { DOCKER_CLIENT } from '../docker/docker.provider';
import { ListImagesQuery } from './dto/list-images.dto';
import { RemoveImageQuery } from './dto/remove-image.dto';
import { TagImageBody } from './dto/tag-image.dto';
import { PruneImagesBody } from './dto/prune-images.dto';

@Injectable()
export class ImagesService {
  constructor(@Inject(DOCKER_CLIENT) private readonly docker: Docker) {}

  async list(query: ListImagesQuery): Promise<ImageSummary[]> {
    const [images, containers] = await Promise.all([
      this.docker.listImages({ all: query.all ?? false }),
      this.docker.listContainers({ all: true }),
    ]);

    const usedBy = new Map<string, string[]>();
    for (const c of containers) {
      const names = usedBy.get(c.ImageID) ?? [];
      names.push((c.Names?.[0] ?? '').replace(/^\//, ''));
      usedBy.set(c.ImageID, names);
    }

    let summaries = images.map((img) =>
      this.normalize(img, usedBy.get(img.Id) ?? []),
    );

    if (query.dangling) {
      summaries = summaries.filter((s) => s.dangling);
    }

    return summaries;
  }

  async inspect(id: string): Promise<Docker.ImageInspectInfo> {
    return this.docker.getImage(id).inspect();
  }

  async history(id: string): Promise<unknown> {
    return this.docker.getImage(id).history();
  }

  async tag(id: string, body: TagImageBody): Promise<void> {
    await this.docker.getImage(id).tag({ repo: body.repo, tag: body.tag });
  }

  async remove(id: string, query: RemoveImageQuery): Promise<unknown> {
    return this.docker.getImage(id).remove({
      force: query.force ?? false,
      noprune: query.noprune ?? false,
    });
  }

  async prune(body: PruneImagesBody): Promise<Docker.PruneImagesInfo> {
    const filters = body.danglingOnly ? { dangling: ['true'] } : {};
    return this.docker.pruneImages({ filters });
  }

  private normalize(img: Docker.ImageInfo, usedBy: string[]): ImageSummary {
    const tags = (img.RepoTags ?? []).filter((t) => t !== '<none>:<none>');
    const dangling = tags.length === 0;

    return {
      id: img.Id,
      shortId: img.Id.replace(/^sha256:/, '').slice(0, 12),
      parentId: img.ParentId,
      repoTags: dangling ? ['<none>:<none>'] : tags,
      dangling,
      size: img.Size,
      createdAt: img.Created,
      labels: img.Labels ?? {},
      containers: img.Containers,
      usedBy,
    };
  }
}
