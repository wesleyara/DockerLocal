import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  NotFoundException,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import type { AutostopLastRun, AutostopState } from '@dockerlocal/shared';
import { OriginGuard } from '../common/guards/origin.guard';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { AutostopConfigService } from './autostop-config.service';
import { AutostopService } from './autostop.service';
import { enabledBodySchema, nameBodySchema } from './dto/name.dto';
import type { EnabledBody, NameBody } from './dto/name.dto';

@UseGuards(OriginGuard)
@Controller('autostop')
export class AutostopController {
  constructor(
    private readonly config: AutostopConfigService,
    private readonly autostop: AutostopService,
  ) {}

  @Get()
  state(): AutostopState {
    return this.snapshot();
  }

  @Post('enabled')
  @HttpCode(200)
  setEnabled(
    @Body(new ZodValidationPipe(enabledBodySchema)) body: EnabledBody,
  ): AutostopState {
    this.config.setEnabled(body.enabled);
    return this.snapshot();
  }

  @Post('excluded')
  @HttpCode(201)
  add(
    @Body(new ZodValidationPipe(nameBodySchema)) body: NameBody,
  ): AutostopState {
    this.config.add(body.name);
    return this.snapshot();
  }

  @Delete('excluded')
  @HttpCode(200)
  remove(
    @Query(new ZodValidationPipe(nameBodySchema)) query: NameBody,
  ): AutostopState {
    if (!this.config.remove(query.name)) {
      throw new NotFoundException('Container não está na lista de exclusão');
    }
    return this.snapshot();
  }

  @Post('run')
  @HttpCode(200)
  run(): Promise<AutostopLastRun> {
    return this.autostop.runNow();
  }

  private snapshot(): AutostopState {
    return {
      enabled: this.config.enabled,
      excluded: this.config.excluded,
      lastRun: this.config.lastRun,
    };
  }
}
