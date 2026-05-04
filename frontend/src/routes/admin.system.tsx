import { createFileRoute, Link, redirect, useNavigate } from "@tanstack/react-router"
import { useQuery } from "@tanstack/react-query"
import { useEffect, useMemo, useState } from "react"
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"
import { api } from "@/lib/api"
import { clearToken, isAuthenticated } from "@/lib/auth"

type SystemStats = {
  cpu: { usagePercent: number }
  memory: { usagePercent: number }
  disk: { usagePercent: number }
  uptimeSeconds: number
  network: { rxBytes: number; txBytes: number }
  checkedAt: string
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

type SystemHistory = {
  range: string
  step: string
  resolvedStep: string
  points: HistoryPoint[]
}

export const Route = createFileRoute("/admin/system")({
  beforeLoad: () => {
    if (!isAuthenticated()) {
      throw redirect({ to: "/login" })
    }
  },
  component: AdminSystemPage,
})

function AdminSystemPage() {
  const navigate = useNavigate()
  const [selectedRange, setSelectedRange] = useState<"1h" | "8h" | "1d" | "7d">("1h")
  const query = useQuery({
    queryKey: ["system-stats"],
    queryFn: async () => (await api.get("/system/stats")).data as SystemStats,
    refetchInterval: 30000,
  })
  const historyQuery = useQuery({
    queryKey: ["system-history", selectedRange],
    queryFn: async () => (await api.get("/system/history", { params: { range: selectedRange } })).data as SystemHistory,
    refetchInterval: 30000,
  })

  const data = query.data
  const [uptimeClock, setUptimeClock] = useState<number>(0)
  const [refreshCountdown, setRefreshCountdown] = useState(30)

  useEffect(() => {
    if (!data) {
      return
    }

    setUptimeClock(data.uptimeSeconds)
    const timer = window.setInterval(() => {
      setUptimeClock((prev) => prev + 1)
    }, 1000)

    return () => window.clearInterval(timer)
  }, [data?.checkedAt, data?.uptimeSeconds])

  const uptimeLabel = useMemo(() => formatUptime(uptimeClock), [uptimeClock])

  useEffect(() => {
    setRefreshCountdown(30)
  }, [query.dataUpdatedAt, historyQuery.dataUpdatedAt, query.errorUpdatedAt, historyQuery.errorUpdatedAt])

  useEffect(() => {
    const timer = window.setInterval(() => {
      setRefreshCountdown((prev) => (prev <= 1 ? 30 : prev - 1))
    }, 1000)

    return () => window.clearInterval(timer)
  }, [])

  const onSignOut = () => {
    clearToken()
    void navigate({ to: "/login", replace: true })
  }

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <Header onSignOut={onSignOut} />
      <section className="mt-6 rounded-2xl border p-5 backdrop-blur-xl" style={{ backgroundColor: "var(--bg-panel)", borderColor: "var(--border-soft)" }}>
        <h1 className="text-2xl font-semibold" style={{ color: "var(--text-main)" }}>System Overview</h1>
        <p className="mt-2 text-sm" style={{ color: "var(--text-muted)" }}>
          Live host metrics with 30s backend refresh.
        </p>
        {data ? (
          <p className="mt-2 text-xs" style={{ color: "var(--text-muted)" }}>
            Last updated: {new Date(data.checkedAt).toLocaleString()}
          </p>
        ) : null}
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <p className="text-xs" style={{ color: "var(--text-muted)" }}>Next update in {refreshCountdown}s</p>
          <div className="ml-auto flex items-center gap-2 rounded-lg border p-1" style={{ borderColor: "var(--border-soft)", backgroundColor: "var(--bg-panel-strong)" }}>
            {([
              { label: "1H", value: "1h" },
              { label: "8H", value: "8h" },
              { label: "1D", value: "1d" },
              { label: "7D", value: "7d" },
            ] as const).map((option) => (
              <button
                key={option.value}
                onClick={() => setSelectedRange(option.value)}
                className="rounded-md px-3 py-1.5 text-xs font-medium"
                style={{
                  backgroundColor: selectedRange === option.value ? "var(--accent-primary-soft)" : "transparent",
                  color: selectedRange === option.value ? "var(--accent-memory)" : "var(--text-muted)",
                  border: selectedRange === option.value ? "1px solid var(--accent-primary)" : "1px solid transparent",
                }}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      </section>
      {query.isError ? (
        <section className="mt-6 rounded-2xl border p-8 text-center" style={{ backgroundColor: "var(--bg-panel-strong)", borderColor: "var(--border-soft)" }}>
          <p className="text-lg font-semibold" style={{ color: "var(--text-main)" }}>
            Layanan monitoring sedang tidak tersedia
          </p>
          <p className="mt-2 text-sm" style={{ color: "var(--text-muted)" }}>
            Data sistem sementara belum bisa dimuat dari backend. Coba lagi beberapa saat.
          </p>
          <button
            onClick={() => void query.refetch()}
            className="mx-auto mt-5 rounded-md px-4 py-2 text-sm font-medium"
            style={{ backgroundColor: "var(--accent-primary-soft)", border: "1px solid var(--accent-primary)", color: "var(--accent-memory)" }}
          >
            Coba lagi
          </button>
        </section>
      ) : null}
      {query.isLoading ? <p className="mt-4" style={{ color: "var(--text-muted)" }}>Loading metrics...</p> : null}
      {data && !query.isError ? (
        <section className="mt-6 grid gap-4 lg:grid-cols-2">
          <UptimeCard value={uptimeLabel} />
          <MetricLineCard
            title="CPU Usage"
            subtitle={`Last ${formatRangeLabel(selectedRange)}, step ${historyQuery.data?.resolvedStep ?? "-"}`}
            color="var(--accent-cpu)"
            data={historyQuery.data?.points}
            loading={historyQuery.isLoading}
            error={historyQuery.isError}
            dataKey="cpu"
            formatValue={(value) => `${value.toFixed(1)}%`}
          />
          <MetricLineCard
            title="Memory Usage"
            subtitle={`Last ${formatRangeLabel(selectedRange)}, step ${historyQuery.data?.resolvedStep ?? "-"}`}
            color="var(--accent-memory)"
            data={historyQuery.data?.points}
            loading={historyQuery.isLoading}
            error={historyQuery.isError}
            dataKey="memory"
            formatValue={(value) => `${value.toFixed(1)}%`}
            detailKey="memory"
          />
          <MetricLineCard
            title="Disk Usage"
            subtitle={`Last ${formatRangeLabel(selectedRange)}, step ${historyQuery.data?.resolvedStep ?? "-"}`}
            color="var(--accent-disk)"
            data={historyQuery.data?.points}
            loading={historyQuery.isLoading}
            error={historyQuery.isError}
            dataKey="disk"
            formatValue={(value) => `${value.toFixed(1)}%`}
            detailKey="disk"
          />
          <BandwidthCard data={historyQuery.data?.points} loading={historyQuery.isLoading} error={historyQuery.isError} subtitle={`Last ${formatRangeLabel(selectedRange)}, step ${historyQuery.data?.resolvedStep ?? "-"}`} />
        </section>
      ) : null}
    </main>
  )
}

function Header({ onSignOut }: { onSignOut: () => void }) {
  return (
    <header className="flex items-center rounded-xl border px-4 py-3" style={{ backgroundColor: "var(--bg-panel)", borderColor: "var(--border-soft)" }}>
      <nav className="flex w-full items-center justify-center gap-7">
        <Link to="/admin/system" className="border-b border-current pb-1 text-sm font-medium" style={{ color: "var(--accent-memory)" }}>System</Link>
        <Link to="/admin/docker" className="pb-1 text-sm font-medium transition-colors" style={{ color: "var(--text-muted)" }}>Docker</Link>
        <Link to="/admin/health" className="pb-1 text-sm font-medium transition-colors" style={{ color: "var(--text-muted)" }}>Websites</Link>
      </nav>
      <button onClick={onSignOut} className="ml-4 shrink-0 text-sm font-medium" style={{ color: "var(--text-main)" }}>Sign out</button>
    </header>
  )
}

function UptimeCard({ value }: { value: string }) {
  return (
    <article className="rounded-xl border p-4" style={{ backgroundColor: "var(--bg-panel)", borderColor: "var(--border-soft)" }}>
      <p className="text-sm font-medium" style={{ color: "var(--text-main)" }}>Uptime</p>
      <p className="mt-1 text-xs" style={{ color: "var(--text-muted)" }}>Live counter</p>
      <div className="mt-4 flex h-64 items-center justify-center">
        <p className="text-center text-4xl font-semibold" style={{ color: "var(--text-main)" }}>{value}</p>
      </div>
    </article>
  )
}

function MetricLineCard({
  title,
  subtitle,
  color,
  data,
  loading,
  error,
  dataKey,
  formatValue,
  detailKey,
}: {
  title: string
  subtitle: string
  color: string
  data?: HistoryPoint[]
  loading: boolean
  error: boolean
  dataKey: "cpu" | "memory" | "disk"
  formatValue: (value: number) => string
  detailKey?: "memory" | "disk"
}) {
  return (
    <article className="rounded-xl border p-4" style={{ backgroundColor: "var(--bg-panel)", borderColor: "var(--border-soft)" }}>
      <p className="text-sm font-medium" style={{ color: "var(--text-main)" }}>{title}</p>
      <p className="mt-1 text-xs" style={{ color: "var(--text-muted)" }}>{subtitle}</p>
      <div className="mt-4 h-64">
        {loading ? <CardMutedMessage message="Loading chart..." /> : null}
        {error ? <CardMutedMessage message="Chart tidak tersedia" /> : null}
        {!loading && !error && data?.length ? (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data}>
              <CartesianGrid stroke="rgba(148, 163, 184, 0.15)" strokeDasharray="3 3" />
              <XAxis dataKey="timestamp" tickFormatter={formatShortTime} minTickGap={30} tick={{ fill: "#94a3b8", fontSize: 12 }} axisLine={{ stroke: "rgba(148, 163, 184, 0.3)" }} tickLine={false} />
              <YAxis domain={[0, 100]} tick={{ fill: "#94a3b8", fontSize: 12 }} axisLine={{ stroke: "rgba(148, 163, 184, 0.3)" }} tickLine={false} width={36} />
              <Tooltip
                formatter={(value, _name, props) => {
                  const safeValue = Number(value ?? 0)
                  if (detailKey === "memory") {
                    const used = Number(props.payload?.memoryUsedBytes ?? 0)
                    const total = Number(props.payload?.memoryTotalBytes ?? 0)
                    return [`${formatValue(safeValue)} (${formatBytes(used)} of ${formatBytes(total)})`, "Usage"]
                  }

                  if (detailKey === "disk") {
                    const used = Number(props.payload?.diskUsedBytes ?? 0)
                    const total = Number(props.payload?.diskTotalBytes ?? 0)
                    return [`${formatValue(safeValue)} (${formatBytes(used)} of ${formatBytes(total)})`, "Usage"]
                  }

                  return [formatValue(safeValue), "Usage"]
                }}
                labelFormatter={(label) => new Date(String(label)).toLocaleString()}
                contentStyle={{ background: "#ffffff", border: "1px solid rgba(15, 23, 42, 0.16)", borderRadius: "10px", color: "#0f172a" }}
              />
              <Line type="monotone" dataKey={dataKey} stroke={color} strokeWidth={2.5} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        ) : null}
      </div>
    </article>
  )
}

function BandwidthCard({ data, loading, error, subtitle }: { data?: HistoryPoint[]; loading: boolean; error: boolean; subtitle: string }) {
  return (
    <article className="rounded-xl border p-4 lg:col-span-2" style={{ backgroundColor: "var(--bg-panel)", borderColor: "var(--border-soft)" }}>
      <p className="text-sm font-medium" style={{ color: "var(--text-main)" }}>Bandwidth I/O</p>
      <p className="mt-1 text-xs" style={{ color: "var(--text-muted)" }}>RX/TX per second, {subtitle}</p>
      <div className="mt-4 h-72">
        {loading ? <CardMutedMessage message="Loading chart..." /> : null}
        {error ? <CardMutedMessage message="Chart tidak tersedia" /> : null}
        {!loading && !error && data?.length ? (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data}>
              <CartesianGrid stroke="rgba(148, 163, 184, 0.15)" strokeDasharray="3 3" />
              <XAxis dataKey="timestamp" tickFormatter={formatShortTime} minTickGap={30} tick={{ fill: "#94a3b8", fontSize: 12 }} axisLine={{ stroke: "rgba(148, 163, 184, 0.3)" }} tickLine={false} />
              <YAxis tickFormatter={formatRateTick} tick={{ fill: "#94a3b8", fontSize: 12 }} axisLine={{ stroke: "rgba(148, 163, 184, 0.3)" }} tickLine={false} width={56} />
              <Tooltip
                formatter={(value, name) => [formatRate(Number(value ?? 0)), String(name)]}
                labelFormatter={(label) => new Date(String(label)).toLocaleString()}
                contentStyle={{ background: "#ffffff", border: "1px solid rgba(15, 23, 42, 0.16)", borderRadius: "10px", color: "#0f172a" }}
              />
              <Legend wrapperStyle={{ color: "#cbd5e1" }} />
              <Line type="monotone" dataKey="rxRate" name="RX" stroke="var(--accent-cpu)" strokeWidth={2.5} dot={false} />
              <Line type="monotone" dataKey="txRate" name="TX" stroke="var(--accent-network)" strokeWidth={2.5} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        ) : null}
      </div>
    </article>
  )
}

function CardMutedMessage({ message }: { message: string }) {
  return (
    <div className="flex h-full items-center justify-center rounded-lg border border-dashed" style={{ borderColor: "var(--border-soft)", color: "var(--text-muted)" }}>
      <p className="text-sm">{message}</p>
    </div>
  )
}

function formatUptime(totalSeconds: number) {
  const days = Math.floor(totalSeconds / 86400)
  const hours = Math.floor((totalSeconds % 86400) / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = Math.floor(totalSeconds % 60)
  const hh = String(hours).padStart(2, "0")
  const mm = String(minutes).padStart(2, "0")
  const ss = String(seconds).padStart(2, "0")

  return `${days}d ${hh}:${mm}:${ss}`
}

function formatShortTime(timestamp: string) {
  return new Date(timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
}

function formatRangeLabel(range: "1h" | "8h" | "1d" | "7d") {
  if (range === "1h") return "1 hour"
  if (range === "8h") return "8 hours"
  if (range === "1d") return "1 day"
  return "7 days"
}

function formatBytes(bytes: number) {
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

function formatRate(bytesPerSecond: number) {
  return `${formatBytes(bytesPerSecond)}/s`
}

function formatRateTick(bytesPerSecond: number) {
  if (bytesPerSecond >= 1024 * 1024) {
    return `${(bytesPerSecond / 1024 / 1024).toFixed(1)}M`
  }

  if (bytesPerSecond >= 1024) {
    return `${(bytesPerSecond / 1024).toFixed(1)}K`
  }

  return `${bytesPerSecond.toFixed(0)}B`
}
