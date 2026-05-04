import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common"
import { ConfigService } from "@nestjs/config"
import Docker from "dockerode"

@Injectable()
export class DockerService {
  private readonly docker = new Docker({ socketPath: "/var/run/docker.sock" })

  constructor(private readonly configService: ConfigService) {}

  private getCpuPercent(stats?: Docker.ContainerStats) {
    const cpuDelta =
      (stats?.cpu_stats?.cpu_usage?.total_usage ?? 0) -
      (stats?.precpu_stats?.cpu_usage?.total_usage ?? 0)
    const systemDelta =
      (stats?.cpu_stats?.system_cpu_usage ?? 0) - (stats?.precpu_stats?.system_cpu_usage ?? 0)
    const onlineCpus = stats?.cpu_stats?.online_cpus || 1
    return cpuDelta > 0 && systemDelta > 0 ? Number(((cpuDelta / systemDelta) * onlineCpus * 100).toFixed(2)) : 0
  }

  private mapContainer(base: Docker.ContainerInfo, stats?: Docker.ContainerStats) {
    const usedMemory = stats?.memory_stats?.usage ?? 0
    const limitMemory = stats?.memory_stats?.limit ?? 0

    return {
      id: base.Id,
      name: base.Names[0]?.replace(/^\//, "") || base.Id,
      image: base.Image,
      state: base.State,
      status: base.Status,
      cpuPercent: this.getCpuPercent(stats),
      memoryBytes: usedMemory,
      memoryLimitBytes: limitMemory,
    }
  }

  async listContainers() {
    const containers: Docker.ContainerInfo[] = await this.docker.listContainers({ all: true })
    const result = await Promise.all(
      containers.map(async (container: Docker.ContainerInfo) => {
        try {
          const stats = await this.docker.getContainer(container.Id).stats({ stream: false })
          return this.mapContainer(container, stats)
        } catch {
          return this.mapContainer(container)
        }
      }),
    )

    return { data: result }
  }

  async getContainer(id: string) {
    try {
      const container = this.docker.getContainer(id)
      const [inspect, stats] = await Promise.all([
        container.inspect(),
        container.stats({ stream: false }).catch(() => undefined),
      ])

      return {
        id: inspect.Id,
        name: inspect.Name.replace(/^\//, ""),
        image: inspect.Config.Image,
        state: {
          status: inspect.State.Status,
          running: inspect.State.Running,
          startedAt: inspect.State.StartedAt,
          finishedAt: inspect.State.FinishedAt,
          restartCount: inspect.RestartCount,
        },
        uptimeSeconds: this.getUptimeSeconds(inspect.State.StartedAt, inspect.State.Running),
        ports: this.getPortMappings(inspect),
        stats: stats
          ? {
              cpuPercent: this.getCpuPercent(stats),
              memoryBytes: stats.memory_stats?.usage ?? 0,
              memoryLimitBytes: stats.memory_stats?.limit ?? 0,
            }
          : null,
      }
    } catch {
      throw new NotFoundException("Container not found")
    }
  }

  async getContainerLogs(id: string, tail?: string) {
    try {
      const container = this.docker.getContainer(id)
      const tailValue = Number(tail)
      const normalizedTail = Number.isFinite(tailValue) && tailValue > 0 ? Math.min(Math.floor(tailValue), 1000) : 200
      const logs = await container.logs({
        stdout: true,
        stderr: true,
        timestamps: true,
        tail: normalizedTail,
      })

      return {
        data: Buffer.isBuffer(logs) ? logs.toString("utf8") : String(logs ?? ""),
        tail: normalizedTail,
      }
    } catch {
      throw new NotFoundException("Container not found")
    }
  }

  private getUptimeSeconds(startedAt?: string, running?: boolean) {
    if (!startedAt || !running) {
      return null
    }

    const startedMs = new Date(startedAt).getTime()
    if (!Number.isFinite(startedMs)) {
      return null
    }

    return Math.max(0, Math.floor((Date.now() - startedMs) / 1000))
  }

  private getPortMappings(inspect: Docker.ContainerInspectInfo) {
    const ports = inspect.NetworkSettings?.Ports ?? {}
    const mappings: Array<{ containerPort: string; hostIp: string; hostPort: string }> = []

    Object.entries(ports).forEach(([containerPort, hostBindings]) => {
      if (!hostBindings || hostBindings.length === 0) {
        mappings.push({ containerPort, hostIp: "-", hostPort: "-" })
        return
      }

      hostBindings.forEach((binding) => {
        mappings.push({
          containerPort,
          hostIp: binding.HostIp || "0.0.0.0",
          hostPort: binding.HostPort || "-",
        })
      })
    })

    return mappings
  }

  private assertControlEnabled() {
    const enabled = this.configService.get<string>("DOCKER_CONTROL_ENABLED") === "true"
    if (!enabled) {
      throw new ForbiddenException("Container controls are disabled")
    }
  }

  async startContainer(id: string) {
    this.assertControlEnabled()
    const container = this.docker.getContainer(id)
    await container.start()
    return { ok: true }
  }

  async stopContainer(id: string) {
    this.assertControlEnabled()
    const container = this.docker.getContainer(id)
    await container.stop()
    return { ok: true }
  }
}
