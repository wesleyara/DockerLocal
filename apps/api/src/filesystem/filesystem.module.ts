import { Module } from '@nestjs/common';
import { FilesystemController } from './filesystem.controller';
import { PathSafetyService } from './path-safety.service';
import { FileDetectService } from './file-detect.service';
import { FsConfigService } from './fs-config.service';

@Module({
  controllers: [FilesystemController],
  providers: [PathSafetyService, FileDetectService, FsConfigService],
  exports: [PathSafetyService],
})
export class FilesystemModule {}
