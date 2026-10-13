import { Inject, Injectable } from '@nestjs/common';
import { spawn } from 'node:child_process';
import type Docker from 'dockerode';
import type {
  ImageScanPackage,
  ImageScanResult,
  ImageScanSummary,
  ImageVulnerability,
  VulnerabilitySeverity,
} from '@dockerlocal/shared';
import { DOCKER_CLIENT } from '../docker/docker.provider';
import { APP_CONFIG } from '../config/config.module';
import type { AppConfig } from '../config/configuration';
import { TaskHandle, TaskRegistryService } from '../tasks/task-registry.service';
import { LineSplitter } from '../common/utils/line-splitter';

const KILL_GRACE_MS = 10_000;
const SEVERITIES: VulnerabilitySeverity[] = [
  'CRITICAL',
  'HIGH',
  'MEDIUM',
  'LOW',
  'UNKNOWN',
];

/** Versão travada em docs/decisoes.md, mesmo padrão de Compose/Buildx. */
const TRIVY_IMAGE = 'aquasec/trivy:0.74.0';
const TRIVY_CACHE_VOLUME = 'dockerlocal_trivy_cache';

interface TrivyVulnerability {
  VulnerabilityID: string;
  PkgName: string;
  InstalledVersion: string;
  FixedVersion?: string;
  Severity: string;
  Title?: string;
  PrimaryURL?: string;
}

interface TrivyPackage {
  Name: string;
  Version: string;
}

interface TrivyResult {
  Target: string;
  Vulnerabilities?: TrivyVulnerability[];
  Packages?: TrivyPackage[];
}

interface TrivyReport {
  Trivy?: { Version: string };
  Metadata?: { OS?: { Family?: string; Name?: string } };
  Results?: TrivyResult[];
}

/**
 * Scan de vulnerabilidades via imagem oficial do Trivy, rodada como
 * container "sibling" no mesmo daemon (via `docker run` + socket montado) —
 * evita depender de um binário instalado no host ou embutido na imagem do
 * próprio app. `docker scan` foi descontinuado pela Docker Inc.; `docker
 * scout` exige plugin/login à parte. Ver ADR em docs/decisoes.md.
 */
@Injectable()
export class ImageScanService {
  constructor(
    @Inject(DOCKER_CLIENT) private readonly docker: Docker,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly tasks: TaskRegistryService,
  ) {}

  async start(id: string): Promise<string> {
    const info = await this.docker.getImage(id).inspect();
    const label =
      info.RepoTags?.find((t) => t !== '<none>:<none>') ??
      info.Id.replace(/^sha256:/, '').slice(0, 12);

    const handle = this.tasks.create('image-scan', `scan ${label}`, {
      imageRef: label,
    });

    this.run(handle, info.Id, label).catch(() => {
      // run() já resolve sucesso/falha via handle — chegar aqui é bug interno.
    });

    return handle.id;
  }

  private async run(
    handle: TaskHandle,
    imageId: string,
    label: string,
  ): Promise<void> {
    try {
      const { code, stdout } = await this.spawnScan(handle, imageId);
      if (code !== 0) {
        handle.fail(`trivy saiu com código ${code}`);
        return;
      }

      let report: TrivyReport;
      try {
        report = JSON.parse(stdout) as TrivyReport;
      } catch {
        handle.fail('Falha ao interpretar a saída do trivy');
        return;
      }

      const result = this.normalize(label, report);
      handle.emit(
        'stdout',
        `${result.vulnerabilities.length} vulnerabilidade(s) encontradas — ${result.cleanPackages.length} pacote(s) sem CVE conhecida.`,
      );
      handle.succeed({ scan: result });
    } catch (err) {
      handle.fail(
        err instanceof Error ? err.message : 'Falha ao executar scan',
      );
    }
  }

  private spawnScan(
    handle: TaskHandle,
    imageId: string,
  ): Promise<{ code: number; stdout: string }> {
    return new Promise((resolvePromise) => {
      const socket = this.config.dockerSocket;
      const args = [
        'run',
        '--rm',
        '-v',
        `${socket}:${socket}`,
        '-v',
        `${TRIVY_CACHE_VOLUME}:/root/.cache/`,
        TRIVY_IMAGE,
        'image',
        '--format',
        'json',
        '--quiet',
        '--scanners',
        'vuln',
        '--list-all-pkgs',
        imageId,
      ];

      const child = spawn('docker', args, {
        shell: false,
        env: { ...process.env, NO_COLOR: '1' },
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      const stdoutChunks: Buffer[] = [];
      child.stdout.on('data', (chunk: Buffer) => stdoutChunks.push(chunk));

      // Primeira execução baixa a imagem do trivy e o DB de CVEs — pode
      // demorar minutos. Esse progresso sai no stderr; não é erro.
      child.stderr.setEncoding('utf8');
      child.stderr
        .pipe(new LineSplitter())
        .on('data', (t: string) => handle.emit('stderr', t));

      const onAbort = () => {
        child.kill('SIGINT');
        const killTimer = setTimeout(() => {
          if (!child.killed) child.kill('SIGKILL');
        }, KILL_GRACE_MS);
        killTimer.unref?.();
      };
      handle.signal.addEventListener('abort', onAbort);

      child.on('close', (code) => {
        handle.signal.removeEventListener('abort', onAbort);
        resolvePromise({
          code: code ?? -1,
          stdout: Buffer.concat(stdoutChunks).toString('utf8'),
        });
      });
      child.on('error', (err) => {
        handle.emit('stderr', err.message);
        resolvePromise({ code: -1, stdout: '' });
      });
    });
  }

  private normalize(imageRef: string, report: TrivyReport): ImageScanResult {
    const summary: ImageScanSummary = {
      CRITICAL: 0,
      HIGH: 0,
      MEDIUM: 0,
      LOW: 0,
      UNKNOWN: 0,
    };
    const vulnerabilities: ImageVulnerability[] = [];
    const vulnerablePkgsByTarget = new Map<string, Set<string>>();

    for (const result of report.Results ?? []) {
      const vulnerablePkgs = new Set<string>();
      for (const v of result.Vulnerabilities ?? []) {
        const severity: VulnerabilitySeverity = SEVERITIES.includes(
          v.Severity as VulnerabilitySeverity,
        )
          ? (v.Severity as VulnerabilitySeverity)
          : 'UNKNOWN';
        summary[severity]++;
        vulnerabilities.push({
          id: v.VulnerabilityID,
          pkgName: v.PkgName,
          installedVersion: v.InstalledVersion,
          fixedVersion: v.FixedVersion,
          severity,
          title: v.Title,
          primaryUrl: v.PrimaryURL,
          target: result.Target,
        });
        vulnerablePkgs.add(v.PkgName);
      }
      vulnerablePkgsByTarget.set(result.Target, vulnerablePkgs);
    }

    vulnerabilities.sort(
      (a, b) => SEVERITIES.indexOf(a.severity) - SEVERITIES.indexOf(b.severity),
    );

    // `--list-all-pkgs` traz o SBOM inteiro (SO + lockfiles) — cruzamos com
    // os pacotes vulneráveis do mesmo target pra sobrar só os "limpos".
    // Dedup por target+nome+versão: o mesmo pacote pode aparecer em vários
    // arquivos vendorizados (ex.: node_modules aninhado por pnpm).
    const cleanPackages: ImageScanPackage[] = [];
    const seenClean = new Set<string>();
    for (const result of report.Results ?? []) {
      const vulnerablePkgs = vulnerablePkgsByTarget.get(result.Target);
      for (const p of result.Packages ?? []) {
        if (vulnerablePkgs?.has(p.Name)) continue;
        const key = `${result.Target}|${p.Name}|${p.Version}`;
        if (seenClean.has(key)) continue;
        seenClean.add(key);
        cleanPackages.push({
          name: p.Name,
          version: p.Version,
          target: result.Target,
        });
      }
    }
    cleanPackages.sort((a, b) => a.name.localeCompare(b.name));

    const os = report.Metadata?.OS
      ? `${report.Metadata.OS.Family ?? ''} ${report.Metadata.OS.Name ?? ''}`.trim()
      : undefined;

    return {
      imageRef,
      scannedAt: Date.now(),
      os: os || undefined,
      trivyVersion: report.Trivy?.Version ?? 'unknown',
      summary,
      vulnerabilities,
      cleanPackages,
    };
  }
}
