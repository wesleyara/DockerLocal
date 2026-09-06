export interface DiskUsageCategory {
  count: number;
  active: number;
  size: number;
  reclaimable: number;
}

export interface SystemDiskUsage {
  containers: DiskUsageCategory;
  images: DiskUsageCategory;
  volumes: DiskUsageCategory;
  buildCache: Omit<DiskUsageCategory, 'active'>;
}

export type PruneTarget = 'containers' | 'images' | 'volumes' | 'buildCache';

export interface PruneResultItem {
  target: PruneTarget;
  itemsDeleted: number;
  spaceReclaimed: number;
}

export interface SystemPruneResult {
  results: PruneResultItem[];
  totalSpaceReclaimed: number;
}
