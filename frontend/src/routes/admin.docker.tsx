import { createFileRoute, Link, redirect, useNavigate } from "@tanstack/react-router"
import { useQuery } from "@tanstack/react-query"
import { useEffect, useMemo, useState } from "react"
import { api } from "@/lib/api"
import { clearToken, isAuthenticated } from "@/lib/auth"

type DockerContainer = {
  id: string
  name: string
  image: string
  state: string
  status: string
  cpuPercent: number
  memoryBytes: number
  memoryLimitBytes: number
}

type DockerContainerDetail = {
  id: string
  name: string
  image: string
  state: {
    status: string
    running: boolean
    startedAt: string
    finishedAt: string
    restartCount: number
  }
  uptimeSeconds: number | null
  ports: Array<{ containerPort: string; hostIp: string; hostPort: string }>
  stats: {
    cpuPercent: number
    memoryBytes: number
    memoryLimitBytes: number
  } | null
}

type DockerLogsResponse = {
  data: string
  tail: number
}

export const Route = createFileRoute("/admin/docker")({
  beforeLoad: () => {
    if (!isAuthenticated()) {
      throw redirect({ to: "/login" })
    }
  },
  component: AdminDockerPage,
})

function AdminDockerPage() {
  const navigate = useNavigate()
  const [selectedContainerId, setSelectedContainerId] = useState<string | null>(null)
  const [currentPage, setCurrentPage] = useState(1)
  const pageSize = 10
  const query = useQuery({
    queryKey: ["docker-containers"],
    queryFn: async () => (await api.get("/docker/containers")).data as { data: DockerContainer[] },
    refetchInterval: 15000,
  })
  const selectedContainer = useMemo(
    () => query.data?.data.find((item) => item.id === selectedContainerId) ?? null,
    [query.data?.data, selectedContainerId],
  )
  const detailQuery = useQuery({
    queryKey: ["docker-container", selectedContainerId],
    queryFn: async () => (await api.get(`/docker/containers/${selectedContainerId}`)).data as DockerContainerDetail,
    enabled: Boolean(selectedContainerId),
    refetchInterval: selectedContainerId ? 15000 : false,
  })
  const logsQuery = useQuery({
    queryKey: ["docker-container-logs", selectedContainerId],
    queryFn: async () => (await api.get(`/docker/containers/${selectedContainerId}/logs`, { params: { tail: 200 } })).data as DockerLogsResponse,
    enabled: Boolean(selectedContainerId),
    refetchInterval: selectedContainerId ? 15000 : false,
  })
  const containers = query.data?.data ?? []
  const totalItems = containers.length
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize))

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages)
    }
  }, [currentPage, totalPages])

  const startIndex = (currentPage - 1) * pageSize
  const paginatedContainers = containers.slice(startIndex, startIndex + pageSize)
  const showingStart = totalItems === 0 ? 0 : startIndex + 1
  const showingEnd = Math.min(startIndex + pageSize, totalItems)

  const onSignOut = () => {
    clearToken()
    void navigate({ to: "/login", replace: true })
  }

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <header className="flex items-center rounded-xl border px-4 py-3" style={{ backgroundColor: "var(--bg-panel)", borderColor: "var(--border-soft)" }}>
        <nav className="flex w-full items-center justify-center gap-7">
          <Link to="/admin/system" className="pb-1 text-sm font-medium transition-colors" style={{ color: "var(--text-muted)" }}>System</Link>
          <Link to="/admin/docker" className="border-b border-current pb-1 text-sm font-medium" style={{ color: "var(--accent-memory)" }}>Docker</Link>
          <Link to="/admin/health" className="pb-1 text-sm font-medium transition-colors" style={{ color: "var(--text-muted)" }}>Websites</Link>
        </nav>
        <button onClick={onSignOut} className="ml-4 shrink-0 text-sm font-medium" style={{ color: "var(--text-main)" }}>Sign out</button>
      </header>
      <div className="mt-6 flex items-center gap-3">
        <h1 className="text-2xl font-semibold" style={{ color: "var(--text-main)" }}>Docker Overview</h1>
        <p className="text-xs" style={{ color: "var(--text-muted)" }}>Auto refresh every 15s</p>
        <button type="button" onClick={() => void query.refetch()} className="ml-auto rounded border px-3 py-1.5 text-xs" style={{ borderColor: "var(--accent-primary)", backgroundColor: "var(--accent-primary-soft)", color: "var(--accent-memory)" }}>
          Refresh
        </button>
      </div>

      {query.isLoading ? <p className="mt-5 text-sm" style={{ color: "var(--text-muted)" }}>Loading containers...</p> : null}
      {query.isError ? (
        <section className="mt-5 rounded-xl border p-4" style={{ borderColor: "var(--border-soft)", backgroundColor: "var(--bg-panel)" }}>
          <p className="text-sm font-medium" style={{ color: "var(--text-main)" }}>Container data unavailable</p>
          <button type="button" onClick={() => void query.refetch()} className="mt-3 rounded border px-3 py-1.5 text-xs" style={{ borderColor: "var(--accent-primary)", backgroundColor: "var(--accent-primary-soft)", color: "var(--accent-memory)" }}>
            Retry
          </button>
        </section>
      ) : null}

      {!query.isLoading && !query.isError && !query.data?.data.length ? (
        <section className="mt-5 rounded-xl border p-4" style={{ borderColor: "var(--border-soft)", backgroundColor: "var(--bg-panel)" }}>
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>No containers found.</p>
        </section>
      ) : null}

      {containers.length ? (
        <div className="mt-5 overflow-hidden rounded-xl border" style={{ borderColor: "var(--border-soft)", backgroundColor: "var(--bg-panel)" }}>
          <table className="w-full text-left text-sm">
            <thead style={{ backgroundColor: "rgba(148, 163, 184, 0.08)", color: "var(--text-muted)" }}>
              <tr>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">State</th>
                <th className="px-4 py-3">CPU</th>
                <th className="px-4 py-3">Memory</th>
              </tr>
            </thead>
            <tbody>
              {paginatedContainers.map((container) => {
                const isRunning = container.state.toLowerCase() === "running"
                return (
                  <tr
                    key={container.id}
                    onClick={() => setSelectedContainerId(container.id)}
                    className="cursor-pointer border-t transition-colors"
                    style={{ borderColor: "rgba(148, 163, 184, 0.18)", color: "var(--text-main)", backgroundColor: selectedContainerId === container.id ? "var(--accent-primary-soft)" : "transparent" }}
                  >
                    <td className="px-4 py-3">
                      <p className="font-medium">{container.name}</p>
                      <p className="text-xs" style={{ color: "var(--text-muted)" }}>{container.image}</p>
                    </td>
                    <td className="px-4 py-3">
                      <span className="rounded-md border px-2 py-1 text-xs" style={{ borderColor: isRunning ? "rgba(15, 118, 110, 0.35)" : "var(--border-soft)", color: isRunning ? "var(--accent-memory)" : "var(--text-muted)", backgroundColor: isRunning ? "rgba(15, 118, 110, 0.12)" : "var(--bg-panel-strong)" }}>
                        {container.state}
                      </span>
                    </td>
                    <td className="px-4 py-3">{container.cpuPercent.toFixed(2)}%</td>
                    <td className="px-4 py-3">{formatBytes(container.memoryBytes)}{container.memoryLimitBytes ? ` / ${formatBytes(container.memoryLimitBytes)}` : ""}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          <div className="flex flex-wrap items-center gap-2 border-t px-4 py-3" style={{ borderColor: "var(--border-soft)" }}>
            <p className="text-xs" style={{ color: "var(--text-muted)" }}>
              Showing {showingStart}-{showingEnd} of {totalItems}
            </p>
            <div className="ml-auto flex items-center gap-2">
              <button
                type="button"
                onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                disabled={currentPage === 1}
                className="rounded border px-3 py-1.5 text-xs disabled:cursor-not-allowed disabled:opacity-50"
                style={{ borderColor: "var(--border-soft)", color: "var(--text-main)", backgroundColor: "var(--bg-panel-strong)" }}
              >
                Prev
              </button>
              <p className="text-xs" style={{ color: "var(--text-muted)" }}>Page {currentPage} of {totalPages}</p>
              <button
                type="button"
                onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
                disabled={currentPage === totalPages}
                className="rounded border px-3 py-1.5 text-xs disabled:cursor-not-allowed disabled:opacity-50"
                style={{ borderColor: "var(--border-soft)", color: "var(--text-main)", backgroundColor: "var(--bg-panel-strong)" }}
              >
                Next
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {selectedContainerId ? (
        <>
          <div className="fixed inset-0 z-40 bg-slate-900/40" onClick={() => setSelectedContainerId(null)} />
          <aside className="fixed right-0 top-0 z-50 h-full w-full max-w-2xl overflow-y-auto border-l p-5" style={{ borderColor: "var(--border-soft)", backgroundColor: "var(--bg-panel)" }}>
            <div className="flex items-start gap-3">
              <div>
                <p className="text-lg font-semibold" style={{ color: "var(--text-main)" }}>{selectedContainer?.name ?? "Container"}</p>
                <p className="text-xs" style={{ color: "var(--text-muted)" }}>{selectedContainer?.image ?? ""}</p>
              </div>
              <button type="button" onClick={() => setSelectedContainerId(null)} className="ml-auto rounded border px-2 py-1 text-xs" style={{ borderColor: "var(--border-soft)", color: "var(--text-muted)" }}>
                Close
              </button>
            </div>

            {detailQuery.isLoading ? <p className="mt-4 text-sm" style={{ color: "var(--text-muted)" }}>Loading details...</p> : null}
            {detailQuery.isError ? <p className="mt-4 text-sm" style={{ color: "#dc2626" }}>Failed to load container detail.</p> : null}

            {detailQuery.data ? (
              <div className="mt-5 space-y-4">
                <section className="rounded-lg border p-3" style={{ borderColor: "var(--border-soft)", backgroundColor: "var(--bg-panel-strong)" }}>
                  <p className="text-xs font-semibold uppercase" style={{ color: "var(--text-muted)" }}>Overview</p>
                  <div className="mt-2 space-y-1 text-sm" style={{ color: "var(--text-main)" }}>
                    <p>ID: {detailQuery.data.id}</p>
                    <p>Status: {detailQuery.data.state.status}</p>
                    <p>Uptime: {formatUptime(detailQuery.data.uptimeSeconds)}</p>
                    <p>Restart count: {detailQuery.data.state.restartCount}</p>
                  </div>
                </section>

                <section className="rounded-lg border p-3" style={{ borderColor: "var(--border-soft)", backgroundColor: "var(--bg-panel-strong)" }}>
                  <p className="text-xs font-semibold uppercase" style={{ color: "var(--text-muted)" }}>Runtime</p>
                  <div className="mt-2 space-y-1 text-sm" style={{ color: "var(--text-main)" }}>
                    <p>Started: {formatDate(detailQuery.data.state.startedAt)}</p>
                    <p>Finished: {formatDate(detailQuery.data.state.finishedAt)}</p>
                    <p>Running: {detailQuery.data.state.running ? "Yes" : "No"}</p>
                  </div>
                </section>

                <section className="rounded-lg border p-3" style={{ borderColor: "var(--border-soft)", backgroundColor: "var(--bg-panel-strong)" }}>
                  <p className="text-xs font-semibold uppercase" style={{ color: "var(--text-muted)" }}>Resources</p>
                  <div className="mt-2 space-y-3 text-sm" style={{ color: "var(--text-main)" }}>
                    <div>
                      <p>CPU: {detailQuery.data.stats ? `${detailQuery.data.stats.cpuPercent.toFixed(2)}%` : "-"}</p>
                      <Bar percent={detailQuery.data.stats?.cpuPercent ?? 0} />
                    </div>
                    <div>
                      <p>Memory: {detailQuery.data.stats ? `${formatBytes(detailQuery.data.stats.memoryBytes)} / ${formatBytes(detailQuery.data.stats.memoryLimitBytes)}` : "-"}</p>
                      <Bar percent={getMemoryPercent(detailQuery.data.stats?.memoryBytes ?? 0, detailQuery.data.stats?.memoryLimitBytes ?? 0)} />
                    </div>
                  </div>
                </section>

                <section className="rounded-lg border p-3" style={{ borderColor: "var(--border-soft)", backgroundColor: "var(--bg-panel-strong)" }}>
                  <p className="text-xs font-semibold uppercase" style={{ color: "var(--text-muted)" }}>Ports</p>
                  <div className="mt-2 space-y-1 text-sm" style={{ color: "var(--text-main)" }}>
                    {detailQuery.data.ports.length ? detailQuery.data.ports.map((port) => (
                      <p key={`${port.containerPort}-${port.hostIp}-${port.hostPort}`}>
                        {port.hostIp}:{port.hostPort} {"->"} {port.containerPort}
                      </p>
                    )) : <p style={{ color: "var(--text-muted)" }}>No published ports.</p>}
                  </div>
                </section>

                <section className="rounded-lg border p-3" style={{ borderColor: "var(--border-soft)", backgroundColor: "var(--bg-panel-strong)" }}>
                  <div className="flex items-center gap-2">
                    <p className="text-xs font-semibold uppercase" style={{ color: "var(--text-muted)" }}>Logs</p>
                    <button type="button" onClick={() => void logsQuery.refetch()} className="ml-auto rounded border px-2 py-1 text-xs" style={{ borderColor: "var(--accent-primary)", backgroundColor: "var(--accent-primary-soft)", color: "var(--accent-memory)" }}>
                      Refresh logs
                    </button>
                  </div>
                  <div className="mt-2 max-h-72 overflow-auto rounded border p-2 font-mono text-xs" style={{ borderColor: "var(--border-soft)", backgroundColor: "#ffffff", color: "#0f172a" }}>
                    {logsQuery.isLoading ? "Loading logs..." : null}
                    {logsQuery.isError ? "Failed to load logs." : null}
                    {!logsQuery.isLoading && !logsQuery.isError ? logsQuery.data?.data || "No logs." : null}
                  </div>
                </section>
              </div>
            ) : null}
          </aside>
        </>
      ) : null}
    </main>
  )
}

function getMemoryPercent(used: number, total: number) {
  if (!total) {
    return 0
  }

  return Math.min(100, Math.max(0, (used / total) * 100))
}

function Bar({ percent }: { percent: number }) {
  return (
    <div className="mt-1 h-2 rounded-full" style={{ backgroundColor: "rgba(148, 163, 184, 0.25)" }}>
      <div className="h-full rounded-full" style={{ width: `${Math.min(100, Math.max(0, percent))}%`, backgroundColor: "var(--accent-primary)" }} />
    </div>
  )
}

function formatBytes(bytes: number) {
  if (!bytes) {
    return "0 B"
  }

  const units = ["B", "KB", "MB", "GB", "TB"]
  let value = bytes
  let unitIndex = 0

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024
    unitIndex += 1
  }

  const precision = value >= 100 || unitIndex === 0 ? 0 : 1
  return `${value.toFixed(precision)} ${units[unitIndex]}`
}

function formatDate(value?: string) {
  if (!value) {
    return "-"
  }

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return "-"
  }

  return date.toLocaleString()
}

function formatUptime(totalSeconds: number | null) {
  if (totalSeconds === null) {
    return "-"
  }

  const days = Math.floor(totalSeconds / 86400)
  const hours = Math.floor((totalSeconds % 86400) / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = Math.floor(totalSeconds % 60)
  return `${days}d ${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`
}
