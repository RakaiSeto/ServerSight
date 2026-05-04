import { BadRequestException, Injectable, Logger, NotFoundException, OnModuleDestroy, OnModuleInit } from "@nestjs/common"
import { ConfigService } from "@nestjs/config"
import { Cron } from "@nestjs/schedule"
import { HttpMethod, WebsiteStatus } from "@prisma/client"
import { PrismaService } from "../prisma/prisma.service"
import { CreateComponentDto } from "./dto/create-component.dto"
import { CreateWebsiteDto } from "./dto/create-website.dto"
import { UpdateComponentDto } from "./dto/update-component.dto"
import { UpdateWebsiteDto } from "./dto/update-website.dto"

type HourState = "green" | "yellow" | "red" | "gray"

@Injectable()
export class HealthService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(HealthService.name)
  private intervalRef?: NodeJS.Timeout

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  async onModuleInit() {
    await this.ensureDefaultComponents()
    const interval = Number(this.configService.get<string>("HEALTH_CHECK_INTERVAL_MS") || 60000)
    this.intervalRef = setInterval(() => {
      void this.runChecks()
    }, interval)
    void this.runChecks()
  }

  onModuleDestroy() {
    if (this.intervalRef) {
      clearInterval(this.intervalRef)
    }
  }

  @Cron("0 0 * * *", { timeZone: "Asia/Jakarta" })
  async cleanupOldChecks() {
    const retentionDays = Number(this.configService.get<string>("HEALTH_RETENTION_DAYS") || 7)
    const safeRetentionDays = Number.isFinite(retentionDays) && retentionDays > 0 ? Math.floor(retentionDays) : 7
    const cutoff = new Date(Date.now() - safeRetentionDays * 24 * 60 * 60 * 1000)

    try {
      const [componentResult, websiteResult] = await Promise.all([
        this.prisma.websiteComponentCheck.deleteMany({ where: { checkedAt: { lt: cutoff } } }),
        this.prisma.websiteCheck.deleteMany({ where: { checkedAt: { lt: cutoff } } }),
      ])

      this.logger.log(
        `Retention cleanup done (Asia/Jakarta 00:00). cutoff=${cutoff.toISOString()} componentChecks=${componentResult.count} websiteChecks=${websiteResult.count}`,
      )
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown retention cleanup error"
      this.logger.error(`Retention cleanup failed: ${message}`)
    }
  }

  private async ensureDefaultComponents() {
    const websites = await this.prisma.website.findMany({
      where: { deletedAt: null },
      include: { components: true },
    })

    await Promise.all(
      websites
        .filter((website) => website.components.length === 0)
        .map((website) =>
          this.prisma.websiteComponent.create({
            data: {
              websiteId: website.id,
              label: "Main",
              targetUrl: website.url,
              enabled: website.enabled,
            },
          }),
        ),
    )
  }

  async listPublic() {
    const websites = await this.prisma.website.findMany({
      where: { enabled: true, deletedAt: null },
      orderBy: { name: "asc" },
      include: {
        components: {
          where: { enabled: true },
          orderBy: { createdAt: "asc" },
        },
      },
    })

    const componentIds = websites.flatMap((website) => website.components.map((component) => component.id))
    const latestChecks = await this.getLatestComponentCheckMap(componentIds)

    return {
      data: websites.map((website) => {
        const components = website.components.map((component) => {
          const latest = latestChecks.get(component.id)
          return {
            id: component.id,
            label: component.label,
            status: latest?.status ?? "DOWN",
            responseMs: latest?.responseMs ?? null,
            checkedAt: latest?.checkedAt ?? null,
          }
        })

        const downCount = components.filter((component) => component.status === "DOWN").length
        return {
          id: website.id,
          name: website.name,
          status: downCount > 0 ? "DOWN" : "UP",
          components,
        }
      }),
    }
  }

  async listAdmin() {
    const websites = await this.prisma.website.findMany({
      where: { deletedAt: null },
      orderBy: { createdAt: "desc" },
      include: {
        components: {
          orderBy: { createdAt: "asc" },
        },
      },
    })

    return { data: websites }
  }

  async listPublicHourly(hours = 168) {
    const windowHours = this.normalizeHours(hours)
    const websites = await this.prisma.website.findMany({
      where: { enabled: true, deletedAt: null },
      orderBy: { name: "asc" },
      include: {
        components: {
          where: { enabled: true },
          orderBy: { createdAt: "asc" },
        },
      },
    })

    const timeline = this.createHourlyTimeline(windowHours)
    const checks = await this.prisma.websiteComponentCheck.findMany({
      where: {
        checkedAt: { gte: timeline.start },
        component: {
          website: {
            enabled: true,
            deletedAt: null,
          },
          enabled: true,
        },
      },
      orderBy: { checkedAt: "asc" },
      select: {
        componentId: true,
        status: true,
        checkedAt: true,
      },
    })

    const hourBuckets = this.buildComponentHourBuckets(checks)

    return {
      hours: windowHours,
      data: websites.map((website) => {
        const components = website.components.map((component) => {
          const hourly = timeline.slots.map((hourStart) => {
            const bucket = hourBuckets.get(component.id)?.get(hourStart)
            const totalChecks = bucket?.totalChecks ?? 0
            const downChecks = bucket?.downChecks ?? 0
            const downRatio = totalChecks ? downChecks / totalChecks : 0
            return {
              hourStart: new Date(hourStart).toISOString(),
              state: this.computeWebsiteHourState(totalChecks, downRatio),
              totalChecks,
              downChecks,
              downRatio,
            }
          })

          return {
            id: component.id,
            label: component.label,
            hourly,
          }
        })

        const hourly = timeline.slots.map((hourStart, index) => {
          let totalComponents = 0
          let downComponents = 0
          let totalChecks = 0
          let downChecks = 0

          for (const component of components) {
            const slot = component.hourly[index]
            if (slot.totalChecks > 0) {
              totalComponents += 1
              totalChecks += slot.totalChecks
              downChecks += slot.downChecks
              if (slot.state === "red") {
                downComponents += 1
              }
            }
          }

          const downRatio = totalChecks ? downChecks / totalChecks : 0
          return {
            hourStart: new Date(hourStart).toISOString(),
            state: this.computeWebsiteHourState(totalChecks, downRatio),
            totalComponents,
            downComponents,
            totalChecks,
            downChecks,
            downRatio,
          }
        })

        const websiteComponentIds = new Set(website.components.map((component) => component.id))
        let totalChecks = 0
        let upChecks = 0
        for (const check of checks) {
          if (!websiteComponentIds.has(check.componentId)) {
            continue
          }
          totalChecks += 1
          if (check.status === "UP") {
            upChecks += 1
          }
        }

        const uptimePercent = totalChecks > 0 ? Number(((upChecks / totalChecks) * 100).toFixed(2)) : null

        return {
          id: website.id,
          name: website.name,
          uptimePercent,
          hourly,
          components: components.map((component) => ({
            id: component.id,
            label: component.label,
            hourly: component.hourly,
          })),
        }
      }),
    }
  }

  create(dto: CreateWebsiteDto) {
    return this.prisma.website.create({
      data: {
        name: dto.name,
        url: dto.url,
        enabled: dto.enabled ?? true,
        components: {
          create: {
            label: "Main",
            targetUrl: dto.url,
            enabled: dto.enabled ?? true,
          },
        },
      },
    })
  }

  async update(id: string, dto: UpdateWebsiteDto) {
    const website = await this.prisma.website.findFirst({ where: { id, deletedAt: null } })
    if (!website) {
      throw new NotFoundException("Website not found")
    }

    const updated = await this.prisma.website.update({
      where: { id },
      data: dto,
    })

    if (dto.url) {
      const main = await this.prisma.websiteComponent.findFirst({
        where: { websiteId: id, label: "Main" },
        orderBy: { createdAt: "asc" },
      })
      if (main) {
        await this.prisma.websiteComponent.update({
          where: { id: main.id },
          data: { targetUrl: dto.url },
        })
      }
    }

    return updated
  }

  async softDelete(id: string) {
    const website = await this.prisma.website.findFirst({ where: { id, deletedAt: null } })
    if (!website) {
      throw new NotFoundException("Website not found")
    }

    return this.prisma.website.update({
      where: { id },
      data: { deletedAt: new Date() },
    })
  }

  async createComponent(websiteId: string, dto: CreateComponentDto) {
    const website = await this.prisma.website.findFirst({ where: { id: websiteId, deletedAt: null } })
    if (!website) {
      throw new NotFoundException("Website not found")
    }

    const requestPayload = this.validateAndNormalizePayload(dto.requestPayload)

    return this.prisma.websiteComponent.create({
      data: {
        websiteId,
        label: dto.label,
        targetUrl: dto.targetUrl,
        enabled: dto.enabled ?? true,
        requestMethod: dto.requestMethod ?? "GET",
        requestPayload,
      },
    })
  }

  async updateComponent(componentId: string, dto: UpdateComponentDto) {
    const component = await this.prisma.websiteComponent.findFirst({
      where: {
        id: componentId,
        website: { deletedAt: null },
      },
    })

    if (!component) {
      throw new NotFoundException("Component not found")
    }

    const data: {
      label?: string
      targetUrl?: string
      enabled?: boolean
      requestMethod?: HttpMethod
      requestPayload?: string | null
    } = {}

    if (dto.label !== undefined) data.label = dto.label
    if (dto.targetUrl !== undefined) data.targetUrl = dto.targetUrl
    if (dto.enabled !== undefined) data.enabled = dto.enabled
    if (dto.requestMethod !== undefined) data.requestMethod = dto.requestMethod
    if (dto.requestPayload !== undefined) data.requestPayload = this.validateAndNormalizePayload(dto.requestPayload)

    return this.prisma.websiteComponent.update({
      where: { id: componentId },
      data,
    })
  }

  async deleteComponent(componentId: string) {
    const component = await this.prisma.websiteComponent.findFirst({
      where: {
        id: componentId,
        website: { deletedAt: null },
      },
    })

    if (!component) {
      throw new NotFoundException("Component not found")
    }

    return this.prisma.websiteComponent.delete({ where: { id: componentId } })
  }

  async runChecks() {
    await this.ensureDefaultComponents()

    const components = await this.prisma.websiteComponent.findMany({
      where: {
        enabled: true,
        website: {
          enabled: true,
          deletedAt: null,
        },
      },
      select: { id: true, targetUrl: true, requestMethod: true, requestPayload: true },
    })

    await Promise.all(
      components.map((component) =>
        this.runSingleCheck(component.id, component.targetUrl, component.requestMethod, component.requestPayload),
      ),
    )
  }

  private async runSingleCheck(componentId: string, targetUrl: string, requestMethod: HttpMethod, requestPayload: string | null) {
    const timeoutMs = Number(this.configService.get<string>("HEALTH_REQUEST_TIMEOUT_MS") || 5000)
    const startedAt = Date.now()

    try {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), timeoutMs)
      const method = requestMethod ?? "GET"
      const init: RequestInit = { method, signal: controller.signal }

      if (method !== "GET" && requestPayload) {
        init.headers = { "Content-Type": "application/json" }
        init.body = requestPayload
      }

      const response = await fetch(targetUrl, init)
      clearTimeout(timeout)

      const isUp = response.ok

      await this.prisma.websiteComponentCheck.create({
        data: {
          componentId,
          status: isUp ? WebsiteStatus.UP : WebsiteStatus.DOWN,
          statusCode: response.status,
          responseMs: Date.now() - startedAt,
          errorText: isUp ? null : `HTTP ${response.status}`,
        },
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown check error"
      await this.prisma.websiteComponentCheck.create({
        data: {
          componentId,
          status: WebsiteStatus.DOWN,
          responseMs: Date.now() - startedAt,
          errorText: message,
        },
      })
    }
  }

  private async getLatestComponentCheckMap(componentIds: string[]) {
    const latestChecks = await Promise.all(
      componentIds.map((componentId) =>
        this.prisma.websiteComponentCheck.findFirst({
          where: { componentId },
          orderBy: { checkedAt: "desc" },
        }),
      ),
    )

    return new Map(componentIds.map((id, idx) => [id, latestChecks[idx]]))
  }

  private normalizeHours(hours: number) {
    if (!Number.isFinite(hours) || hours <= 0) {
      return 168
    }
    return Math.min(24 * 30, Math.max(24, Math.floor(hours)))
  }

  private createHourlyTimeline(hours: number) {
    const now = new Date()
    const end = new Date(now)
    end.setMinutes(0, 0, 0)

    const slots: number[] = []
    for (let i = hours - 1; i >= 0; i -= 1) {
      slots.push(end.getTime() - i * 60 * 60 * 1000)
    }

    return {
      start: new Date(slots[0]),
      slots,
    }
  }

  private buildComponentHourBuckets(checks: Array<{ componentId: string; status: WebsiteStatus; checkedAt: Date }>) {
    const map = new Map<string, Map<number, { totalChecks: number; downChecks: number }>>()

    for (const check of checks) {
      const hourStart = new Date(check.checkedAt)
      hourStart.setMinutes(0, 0, 0)
      const hourKey = hourStart.getTime()

      if (!map.has(check.componentId)) {
        map.set(check.componentId, new Map())
      }

      const byHour = map.get(check.componentId)!
      const bucket = byHour.get(hourKey) ?? { totalChecks: 0, downChecks: 0 }
      bucket.totalChecks += 1
      if (check.status === "DOWN") {
        bucket.downChecks += 1
      }
      byHour.set(hourKey, bucket)
    }

    return map
  }

  private computeWebsiteHourState(totalChecks: number, downRatio: number): HourState {
    if (totalChecks === 0) {
      return "gray"
    }
    if (downRatio === 0) {
      return "green"
    }
    if (downRatio < 0.5) {
      return "yellow"
    }
    return "red"
  }

  private validateAndNormalizePayload(payload?: string) {
    if (payload === undefined) {
      return undefined
    }

    const trimmed = payload.trim()
    if (!trimmed) {
      return null
    }

    try {
      const parsed = JSON.parse(trimmed)
      return JSON.stringify(parsed)
    } catch {
      throw new BadRequestException("requestPayload must be valid JSON")
    }
  }
}
