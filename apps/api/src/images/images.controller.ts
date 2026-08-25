import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import type { ImageSummary } from '@dockerlocal/shared';
import { OriginGuard } from '../common/guards/origin.guard';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { ImagesService } from './images.service';
import { ImagePullService } from './image-pull.service';
import { listImagesQuerySchema } from './dto/list-images.dto';
import { removeImageQuerySchema } from './dto/remove-image.dto';
import { tagImageBodySchema } from './dto/tag-image.dto';
import { pruneImagesBodySchema } from './dto/prune-images.dto';
import { pullImageBodySchema, type PullImageBody } from './dto/pull-image.dto';

@UseGuards(OriginGuard)
@Controller('images')
export class ImagesController {
  constructor(
    private readonly imagesService: ImagesService,
    private readonly imagePull: ImagePullService,
  ) {}

  @Post('pull')
  @HttpCode(202)
  pull(@Body(new ZodValidationPipe(pullImageBodySchema)) body: unknown): {
    taskId: string;
  } {
    const { ref } = body as PullImageBody;
    return { taskId: this.imagePull.start(ref) };
  }

  @Get()
  async list(
    @Query(new ZodValidationPipe(listImagesQuerySchema)) query: unknown,
  ): Promise<ImageSummary[]> {
    return this.imagesService.list(query as never);
  }

  @Get(':id/history')
  async history(@Param('id') id: string) {
    return this.imagesService.history(id);
  }

  @Get(':id')
  async inspect(@Param('id') id: string) {
    return this.imagesService.inspect(id);
  }

  @Post(':id/tag')
  @HttpCode(200)
  async tag(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(tagImageBodySchema)) body: unknown,
  ) {
    await this.imagesService.tag(id, body as never);
    return { ok: true };
  }

  @Delete(':id')
  async remove(
    @Param('id') id: string,
    @Query(new ZodValidationPipe(removeImageQuerySchema)) query: unknown,
  ) {
    return this.imagesService.remove(id, query as never);
  }

  @Post('prune')
  @HttpCode(200)
  async prune(
    @Body(new ZodValidationPipe(pruneImagesBodySchema)) body: unknown,
  ) {
    return this.imagesService.prune(body as never);
  }
}
