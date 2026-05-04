import { Injectable, ServiceUnavailableException } from "@nestjs/common"

type PrometheusQueryResponse = {
  status: string
  data?: {
    resultType: string
    result: Array<{
      value?: [number | string, string]
    }>
  }
}

type PrometheusRangeResponse = {
  status: string
  data?: {
    resultType: string
    result: Array<{
      values?: Array<[number | string, string]>
    }>
  }
}

type HistoryPoint = {
  timestamp: string
  cpu: number
  memory: number
  disk: number
  rxRate: number
  txRate: number
  memoryUsedBytes: number
  memoryTotalBytes: number
  diskUsedBytes: number
  diskTotalBytes: number
}

@Injectable()
export class SystemService {
  async getStats() {
    const [cpuPercent, memoryTotal, memoryAvailable, diskTotal, diskAvailable, uptimeSeconds, rxBytes, txBytes] = await Promise.all([
      this.queryScalar('100 - (avg(irate(node_cpu_seconds_total{mode="idle"}[2m])) * 100)'),
      this.queryScalar("node_memory_MemTotal_bytes"),
      this.queryScalar("node_memory_MemAvailable_bytes"),
      this.queryScalar('sum(max by (instance, device, fstype) (node_filesystem_size_bytes{job="node",fstype!~"tmpfs|overlay|squashfs|nsfs|proc|sysfs|cgroup2?"}))'),
      this.queryScalar('sum(max by (instance, device, fstype) (node_filesystem_avail_bytes{job="node",fstype!~"tmpfs|overlay|squashfs|nsfs|proc|sysfs|cgroup2?"}))'),
      this.queryScalar("time() - node_boot_time_seconds"),
      this.queryScalar('sum(node_network_receive_bytes_total{device!~"lo"})'),
      this.queryScalar('sum(node_network_transmit_bytes_total{device!~"lo"})'),
    ])

    const memoryUsed = Math.max(0, memoryTotal - memoryAvailable)
    const diskUsed = Math.max(0, diskTotal - diskAvailable)

    return {
      cpu: {
        usagePercent: Number(cpuPercent.toFixed(2)),
      },
      memory: {
        total: memoryTotal,
        used: memoryUsed,
        usagePercent: memoryTotal ? Number(((memoryUsed / memoryTotal) * 100).toFixed(2)) : 0,
      },
      disk: {
        total: diskTotal,
        used: diskUsed,
        usagePercent: diskTotal ? Number(((diskUsed / diskTotal) * 100).toFixed(2)) : 0,
      },
      uptimeSeconds: Math.max(0, Math.floor(uptimeSeconds)),
      network: {
        rxBytes,
        txBytes,
      },
      checkedAt: new Date().toISOString(),
    }
  }

  async getHistory(range = "1h", step?: string) {
    const normalizedRange = this.normalizeRange(range)
    const resolvedStep = step ? this.normalizeStep(step) : this.getAdaptiveStep(normalizedRange)
    const end = Math.floor(Date.now() / 1000)
    const start = end - this.parseRangeToSeconds(normalizedRange)
    const stepSeconds = this.parseStepToSeconds(resolvedStep)

    const [cpu, memory, disk, rxRate, txRate, memoryUsedBytes, memoryTotalBytes, diskUsedBytes, diskTotalBytes] = await Promise.all([
      this.queryRange('100 - (avg(irate(node_cpu_seconds_total{mode="idle"}[2m])) * 100)', start, end, stepSeconds),
      this.queryRange('(1 - (node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes)) * 100', start, end, stepSeconds),
      this.queryRange(
        '(1 - (sum(max by (instance, device, fstype) (node_filesystem_avail_bytes{job="node",fstype!~"tmpfs|overlay|squashfs|nsfs|proc|sysfs|cgroup2?"})) / sum(max by (instance, device, fstype) (node_filesystem_size_bytes{job="node",fstype!~"tmpfs|overlay|squashfs|nsfs|proc|sysfs|cgroup2?"})))) * 100',
        start,
        end,
        stepSeconds,
      ),
      this.queryRange('sum(irate(node_network_receive_bytes_total{device!~"lo"}[2m]))', start, end, stepSeconds),
      this.queryRange('sum(irate(node_network_transmit_bytes_total{device!~"lo"}[2m]))', start, end, stepSeconds),
      this.queryRange('sum(node_memory_MemTotal_bytes - node_memory_MemAvailable_bytes)', start, end, stepSeconds),
      this.queryRange('sum(node_memory_MemTotal_bytes)', start, end, stepSeconds),
      this.queryRange(
        'sum(max by (instance, device, fstype) (node_filesystem_size_bytes{job="node",fstype!~"tmpfs|overlay|squashfs|nsfs|proc|sysfs|cgroup2?"} - node_filesystem_avail_bytes{job="node",fstype!~"tmpfs|overlay|squashfs|nsfs|proc|sysfs|cgroup2?"}))',
        start,
        end,
        stepSeconds,
      ),
      this.queryRange(
        'sum(max by (instance, device, fstype) (node_filesystem_size_bytes{job="node",fstype!~"tmpfs|overlay|squashfs|nsfs|proc|sysfs|cgroup2?"}))',
        start,
        end,
        stepSeconds,
      ),
    ])

    const points = this.mergeSeries([cpu, memory, disk, rxRate, txRate, memoryUsedBytes, memoryTotalBytes, diskUsedBytes, diskTotalBytes])

    return {
      range: normalizedRange,
      step: resolvedStep,
      resolvedStep,
      points,
    }
  }

  private async queryScalar(query: string): Promise<number> {
    const baseUrl = process.env.PROMETHEUS_BASE_URL

    if (!baseUrl) {
      throw new ServiceUnavailableException("PROMETHEUS_BASE_URL is not configured")
    }

    const timeoutMs = Number(process.env.PROMETHEUS_TIMEOUT_MS || 5000)
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)

    try {
      const url = `${baseUrl.replace(/\/$/, "")}/api/v1/query?query=${encodeURIComponent(query)}`
      const response = await fetch(url, { signal: controller.signal })

      if (!response.ok) {
        throw new ServiceUnavailableException(`Prometheus query failed with status ${response.status}`)
      }

      const payload = (await response.json()) as PrometheusQueryResponse
      const rawValue = payload.data?.result?.[0]?.value?.[1]
      const parsed = rawValue ? Number(rawValue) : Number.NaN

      if (!Number.isFinite(parsed)) {
        throw new ServiceUnavailableException(`Prometheus returned empty/invalid result for query: ${query}`)
      }

      return parsed
    } catch (error) {
      if (error instanceof ServiceUnavailableException) {
        throw error
      }

      throw new ServiceUnavailableException("Unable to read metrics from Prometheus")
    } finally {
      clearTimeout(timer)
    }
  }

  private async queryRange(query: string, start: number, end: number, stepSeconds: number): Promise<Map<number, number>> {
    const baseUrl = process.env.PROMETHEUS_BASE_URL

    if (!baseUrl) {
      throw new ServiceUnavailableException("PROMETHEUS_BASE_URL is not configured")
    }

    const timeoutMs = Number(process.env.PROMETHEUS_TIMEOUT_MS || 5000)
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)

    try {
      const trimmedBaseUrl = baseUrl.replace(/\/$/, "")
      const url = `${trimmedBaseUrl}/api/v1/query_range?query=${encodeURIComponent(query)}&start=${start}&end=${end}&step=${stepSeconds}`
      const response = await fetch(url, { signal: controller.signal })

      if (!response.ok) {
        throw new ServiceUnavailableException(`Prometheus range query failed with status ${response.status}`)
      }

      const payload = (await response.json()) as PrometheusRangeResponse
      const values = payload.data?.result?.[0]?.values

      if (!values?.length) {
        throw new ServiceUnavailableException(`Prometheus returned empty/invalid result for query: ${query}`)
      }

      const series = new Map<number, number>()
      for (const [timestamp, rawValue] of values) {
        const parsedTimestamp = Number(timestamp)
        const parsedValue = Number(rawValue)

        if (!Number.isFinite(parsedTimestamp) || !Number.isFinite(parsedValue)) {
          continue
        }

        series.set(parsedTimestamp, parsedValue)
      }

      if (!series.size) {
        throw new ServiceUnavailableException(`Prometheus returned empty/invalid result for query: ${query}`)
      }

      return series
    } catch (error) {
      if (error instanceof ServiceUnavailableException) {
        throw error
      }

      throw new ServiceUnavailableException("Unable to read metrics history from Prometheus")
    } finally {
      clearTimeout(timer)
    }
  }

  private mergeSeries(series: Array<Map<number, number>>): HistoryPoint[] {
    const [cpu, memory, disk, rxRate, txRate, memoryUsedBytes, memoryTotalBytes, diskUsedBytes, diskTotalBytes] = series
    const timestamps = [...cpu.keys()].sort((a, b) => a - b)

    return timestamps.map((timestamp) => ({
      timestamp: new Date(timestamp * 1000).toISOString(),
      cpu: this.roundTo2(cpu.get(timestamp) ?? 0),
      memory: this.roundTo2(memory.get(timestamp) ?? 0),
      disk: this.roundTo2(disk.get(timestamp) ?? 0),
      rxRate: Math.max(0, rxRate.get(timestamp) ?? 0),
      txRate: Math.max(0, txRate.get(timestamp) ?? 0),
      memoryUsedBytes: Math.max(0, memoryUsedBytes.get(timestamp) ?? 0),
      memoryTotalBytes: Math.max(0, memoryTotalBytes.get(timestamp) ?? 0),
      diskUsedBytes: Math.max(0, diskUsedBytes.get(timestamp) ?? 0),
      diskTotalBytes: Math.max(0, diskTotalBytes.get(timestamp) ?? 0),
    }))
  }

  private normalizeRange(range: string): string {
    if (["1h", "8h", "1d", "7d"].includes(range)) {
      return range
    }

    return "1h"
  }

  private getAdaptiveStep(range: string): string {
    if (range === "1h") return "30s"
    if (range === "8h") return "2m"
    if (range === "1d") return "5m"
    return "30m"
  }

  private normalizeStep(step: string): string {
    const match = /^([1-9][0-9]*)(s|m)$/.exec(step)
    if (!match) {
      return "30s"
    }

    return `${match[1]}${match[2]}`
  }

  private parseRangeToSeconds(range: string): number {
    const match = /^([1-9][0-9]*)([mhd])$/.exec(range)
    if (!match) {
      return 3600
    }

    const value = Number(match[1])
    const unit = match[2]

    if (unit === "m") {
      return value * 60
    }

    if (unit === "h") {
      return value * 3600
    }

    return value * 86400
  }

  private parseStepToSeconds(step: string): number {
    const match = /^([1-9][0-9]*)(s|m)$/.exec(step)
    if (!match) {
      return 30
    }

    const value = Number(match[1])
    const unit = match[2]
    return unit === "m" ? value * 60 : value
  }

  private roundTo2(value: number): number {
    return Number(value.toFixed(2))
  }
}
