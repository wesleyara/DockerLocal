import { Subject } from 'rxjs';
import type { DaemonEvent } from '@dockerlocal/shared';
import { AutostopService } from './autostop.service';
import type { AutostopConfigService } from './autostop-config.service';
import type { SelfDetectService } from '../docker/self-detect.service';
import type { DockerEventsService } from '../docker/docker-events.service';

interface FakeC {
  Id: string;
  Names: string[];
  Labels: Record<string, string>;
}

function build(opts: {
  running: FakeC[];
  excluded?: string[];
  lastBootId?: string;
  bootId?: string | null;
  failIds?: string[];
  enabled?: boolean;
}) {
  const stopped: string[] = [];
  const events$ = new Subject<DaemonEvent>();
  const store = { lastBootId: opts.lastBootId, lastRun: null as unknown };
  const docker = {
    listContainers: () => Promise.resolve(opts.running),
    getContainer: (id: string) => ({
      stop: () => {
        if (opts.failIds?.includes(id))
          return Promise.reject(new Error('boom'));
        stopped.push(id);
        return Promise.resolve();
      },
      inspect: () => {
        const c = opts.running.find((r) => r.Id === id)!;
        return Promise.resolve({
          Id: c.Id,
          Name: c.Names[0],
          State: { Running: true },
          Config: { Labels: c.Labels },
        });
      },
    }),
  };
  const selfDetect = {
    selfContainerId: 'self1',
    isSelfContainer: (ref: string) => ref === 'self1',
  } as unknown as SelfDetectService;
  const config = {
    get enabled() {
      return opts.enabled ?? true;
    },
    get lastBootId() {
      return store.lastBootId;
    },
    isExcluded: (n: string) =>
      (opts.excluded ?? []).includes(n.replace(/^\//, '')),
    setLastBootId: (id: string) => {
      store.lastBootId = id;
    },
    setLastRun: (r: unknown) => {
      store.lastRun = r;
    },
  } as unknown as AutostopConfigService;
  const svc = new AutostopService(
    docker as never,
    selfDetect,
    { events$ } as unknown as DockerEventsService,
    config,
  );
  svc.bootIdReader = () => (opts.bootId === undefined ? 'boot-2' : opts.bootId);
  return { svc, stopped, events$, store };
}

const c = (
  id: string,
  name: string,
  labels: Record<string, string> = {},
): FakeC => ({
  Id: id,
  Names: [`/${name}`],
  Labels: labels,
});

describe('AutostopService', () => {
  afterEach(() => jest.useRealTimers());

  it('boot novo: para tudo, menos self, helper e excluídos', async () => {
    const { svc, stopped, store } = build({
      running: [
        c('self1', 'dockerlocal'),
        c('a', 'api'),
        c('b', 'db'),
        c('h', 'helper', { 'com.dockerlocal.helper': '1' }),
      ],
      excluded: ['db'],
      lastBootId: 'boot-1',
    });
    expect(await svc.runIfNewBoot()).toBe(true);
    expect(stopped).toEqual(['a']);
    expect(store.lastBootId).toBe('boot-2');
    svc.onModuleDestroy();
  });

  it('mesmo boot_id: não faz nada (restart manual do app)', async () => {
    const { svc, stopped } = build({
      running: [c('a', 'api')],
      lastBootId: 'boot-2',
    });
    expect(await svc.runIfNewBoot()).toBe(false);
    expect(stopped).toEqual([]);
  });

  it('desligado ou sem boot_id: não faz nada', async () => {
    const off = build({ running: [c('a', 'api')], enabled: false });
    expect(await off.svc.runIfNewBoot()).toBe(false);
    const noId = build({ running: [c('a', 'api')], bootId: null });
    expect(await noId.svc.runIfNewBoot()).toBe(false);
    expect(off.stopped.concat(noId.stopped)).toEqual([]);
  });

  it('falha em um container não aborta os outros', async () => {
    const { svc, stopped } = build({
      running: [c('a', 'api'), c('b', 'web')],
      failIds: ['a'],
    });
    await svc.runIfNewBoot();
    expect(stopped).toEqual(['b']);
    svc.onModuleDestroy();
  });

  it('janela de boot: para containers que sobem depois, respeitando exclusões', async () => {
    const { svc, stopped, events$ } = build({
      running: [c('late', 'late'), c('keep', 'keep')],
      excluded: ['keep'],
    });
    (svc as unknown as { sweep: () => Promise<void> }).sweep = async () => {};
    await svc.runIfNewBoot();
    const ev = (id: string, name: string): DaemonEvent => ({
      type: 'container',
      action: 'start',
      id,
      name,
      time: Date.now(),
    });
    events$.next(ev('late', 'late'));
    events$.next(ev('keep', 'keep'));
    await new Promise((r) => setImmediate(r));
    await new Promise((r) => setImmediate(r));
    expect(stopped).toEqual(['late']);
    svc.onModuleDestroy();
  });

  it('runNow devolve o resultado', async () => {
    const { svc } = build({ running: [c('a', 'api')] });
    const run = await svc.runNow();
    expect(run.trigger).toBe('manual');
    expect(run.stopped).toEqual([{ name: 'api', ok: true }]);
  });
});
