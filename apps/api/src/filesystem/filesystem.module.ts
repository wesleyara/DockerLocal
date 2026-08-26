import { Module } from '@nestjs/common';
import { FilesystemController } from './filesystem.controller';
import { PathSafetyService } from './path-safety.service';
import { FileDetectService } from './file-detect.service';

@Module({
  controllers: [FilesystemController],
  providers: [PathSafetyService, FileDetectService],
  exports: [PathSafetyService],
})
export class FilesystemModule {}
