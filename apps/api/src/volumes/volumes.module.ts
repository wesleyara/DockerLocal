import { Module } from '@nestjs/common';
import { VolumesController } from './volumes.controller';
import { VolumesService } from './volumes.service';
import { VolumeHelperService } from './volume-helper.service';
import { VolumeFilesService } from './volume-files.service';

@Module({
  controllers: [VolumesController],
  providers: [VolumesService, VolumeHelperService, VolumeFilesService],
  exports: [VolumeHelperService],
})
export class VolumesModule {}
