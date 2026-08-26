import { Module } from '@nestjs/common';
import { TasksModule } from '../tasks/tasks.module';
import { FilesystemModule } from '../filesystem/filesystem.module';
import { ContainersModule } from '../containers/containers.module';
import { StacksController } from './stacks.controller';
import { StackDiscoveryService } from './stack-discovery.service';
import { StackRegistryService } from './stack-registry.service';
import { ComposeCliService } from './compose-cli.service';

@Module({
  imports: [TasksModule, FilesystemModule, ContainersModule],
  controllers: [StacksController],
  providers: [StackDiscoveryService, StackRegistryService, ComposeCliService],
})
export class StacksModule {}
