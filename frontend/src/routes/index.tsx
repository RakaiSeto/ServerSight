import { useEffect, useMemo, useRef, useState } from "react"
import { createFileRoute } from "@tanstack/react-router"
import { useQuery } from "@tanstack/react-query"
import { api } from "@/lib/api"

type HourlyCell = {
  hourStart: string
  state: "green" | "yellow" | "red" | "gray"
  totalComponents?: number
  downComponents?: number
  totalChecks?: number
  downChecks?: number
}

type HealthState = "green" | "yellow" | "red" | "gray"
type UptimeLevel = "good" | "warn" | "bad" | "neutral"

type PublicHourlyWebsite = {
  id: string
  name: string
  uptimePercent: number | null
  hourly: HourlyCell[]
  components: Array<{
    id: string
    label: string
    hourly: HourlyCell[]
  }>
}

type PublicHourlyResponse = {
  hours: number
  data: PublicHourlyWebsite[]
}

export const Route = createFileRoute("/")({
  component: PublicHealthPage,
})

function PublicHealthPage() {
  const measureRef = useRef<HTMLDivElement | null>(null)
  const [pillMetrics, setPillMetrics] = useState({ pillWidth: 2, gap: 1 })
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const query = useQuery({
    queryKey: ["public-health-hourly", 168],
    queryFn: async () => (await api.get("/health/websites/hourly", { params: { hours: 168 } })).data as PublicHourlyResponse,
    refetchOnMount: true,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  })

  const websites = useMemo(() => query.data?.data ?? [], [query.data])

  useEffect(() => {
    const node = measureRef.current
    if (!node) return

    const updateMetrics = () => {
      const count = websites[0]?.hourly.length ?? 168
      const availableWidth = Math.max(0, node.clientWidth - 8)
      const minWidth = 2
      const maxWidth = 6
      const gap = 1
      const ideal = Math.floor((availableWidth - (count - 1) * gap) / count)
      const pillWidth = Math.min(maxWidth, Math.max(minWidth, ideal))
      setPillMetrics({ pillWidth, gap })
    }

    updateMetrics()
    const observer = new ResizeObserver(updateMetrics)
    observer.observe(node)
    return () => observer.disconnect()
  }, [websites])

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <h1 className="text-2xl font-semibold" style={{ color: "var(--text-main)" }}>ServerSight Public Health</h1>
      <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>Hourly health over last 7 days by component</p>

      <section className="mt-4 flex items-center gap-4 text-xs" style={{ color: "var(--text-muted)" }}>
        <Legend color="#22c55e" label="No issue" />
        <Legend color="#eab308" label="Partial issue (<99%)" />
        <Legend color="#ef4444" label="Major issue (<90%)" />
      </section>

      {query.isLoading ? <p className="mt-4 text-sm" style={{ color: "var(--text-muted)" }}>Loading hourly status...</p> : null}
      {query.isError ? (
        <section className="mt-5 rounded-2xl border p-8 text-center" style={{ backgroundColor: "var(--bg-panel)", borderColor: "var(--border-soft)" }}>
          <p className="text-lg font-semibold" style={{ color: "var(--text-main)" }}>Stats sedang tidak tersedia</p>
          <p className="mt-2 text-sm" style={{ color: "var(--text-muted)" }}>Layanan backend belum merespons. Coba lagi beberapa saat.</p>
          <button
            onClick={() => void query.refetch()}
            className="mx-auto mt-5 rounded-md px-4 py-2 text-sm font-medium"
            style={{ backgroundColor: "var(--bg-panel-strong)", border: "1px solid var(--border-soft)", color: "var(--text-main)" }}
          >
            Coba lagi
          </button>
        </section>
      ) : null}

      {!query.isError ? <section className="mt-5 grid gap-3">
        <div ref={measureRef} className="h-0 w-full overflow-hidden" />
        {websites.map((website) => {
          const isOpen = expanded[website.id] ?? false
          return (
            <article key={website.id} className="rounded-xl border p-4" style={{ backgroundColor: "var(--bg-panel)", borderColor: "var(--border-soft)" }}>
              <div className="flex flex-wrap items-center gap-3">
                <button
                  onClick={() => setExpanded((prev) => ({ ...prev, [website.id]: !isOpen }))}
                  className="text-left text-sm font-semibold"
                  style={{ color: "var(--text-main)" }}
                >
                  {isOpen ? "▾" : "▸"} {website.name}
                </button>
                <span className="text-xs" style={{ color: "var(--text-muted)" }}>{website.components.length} components</span>
                <div className="flex items-center gap-2 text-xs" style={{ color: "var(--text-muted)" }}>
                  <UptimeBadge uptimePercent={website.uptimePercent} />
                  <span>{website.uptimePercent === null ? "No data" : `${website.uptimePercent.toFixed(2)}% `}</span>
                </div>
              </div>
              <div className="mt-3 min-w-0 hidden md:block">
                <PillRow cells={website.hourly} pillWidth={pillMetrics.pillWidth} gap={pillMetrics.gap} />
              </div>
              <div className="mt-3 md:hidden">
                <CurrentStatus state={getLatestState(website.hourly)} />
              </div>

              {isOpen ? (
                <div className="mt-4 space-y-2 border-t pt-3" style={{ borderColor: "var(--border-soft)" }}>
                  {website.components.map((component) => (
                    <div key={component.id} className="rounded-lg border p-2" style={{ borderColor: "rgba(148, 163, 184, 0.24)" }}>
                      <div className="flex items-center gap-2 text-sm" style={{ color: "var(--text-muted)" }}>
                        <UptimeBadge uptimePercent={computeComponentUptime(component.hourly)} />
                        <p>{component.label}</p>
                        <span className="text-xs">
                          {formatPercentOnly(computeComponentUptime(component.hourly))}
                        </span>
                      </div>
                      <div className="mt-2 min-w-0 hidden md:block">
                        <PillRow cells={component.hourly} componentLevel pillWidth={pillMetrics.pillWidth} gap={pillMetrics.gap} />
                      </div>
                      <div className="mt-2 md:hidden">
                        <CurrentStatus state={getLatestState(component.hourly)} />
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}
            </article>
          )
        })}
      </section> : null}
    </main>
  )
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="inline-block h-2.5 w-4 rounded-full" style={{ backgroundColor: color }} />
      <span>{label}</span>
    </div>
  )
}

function PillRow({
  cells,
  componentLevel = false,
  pillWidth: _pillWidth,
  gap: _gap,
}: {
  cells: HourlyCell[]
  componentLevel?: boolean
  pillWidth: number
  gap: number
}) {
  const ref = useRef<HTMLDivElement | null>(null)
  const [hovered, setHovered] = useState<string | null>(null)
  const [tooltip, setTooltip] = useState<{ x: number; y: number; text: string } | null>(null)
  const [isOverflow, setIsOverflow] = useState(true)
  const [trackWidth, setTrackWidth] = useState(0)
  const PILL_WIDTH = 5
  const PILL_GAP = 2
  const dayMarkers = getDayMarkers(cells)

  useEffect(() => {
    const node = ref.current
    if (!node) return

    const update = () => {
      const width = cells.length * PILL_WIDTH + Math.max(0, cells.length - 1) * PILL_GAP
      setTrackWidth(width)
      const overflow = width > node.clientWidth
      setIsOverflow(overflow)
      if (!overflow) {
        node.scrollLeft = 0
        return
      }
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          node.scrollLeft = Math.max(0, node.scrollWidth - node.clientWidth)
        })
      })
    }

    update()
    const observer = new ResizeObserver(update)
    observer.observe(node)
    return () => observer.disconnect()
  }, [cells])

  return (
    <div className="min-w-0 overflow-x-hidden">
      <div className={isOverflow ? "w-full" : "flex justify-center"}>
      <div ref={ref} className={`min-w-0 rounded-md px-[1px] py-[1px] ${isOverflow ? "w-full overflow-x-auto overflow-y-visible" : "overflow-visible"}`}>
      <div className="w-fit" style={{ width: `${trackWidth}px` }}>
      <div className="inline-flex flex-nowrap items-end whitespace-nowrap" style={{ gap: `${PILL_GAP}px`, width: `${trackWidth}px` }}>
        {cells.map((cell) => (
          <button
            key={cell.hourStart}
            className={componentLevel ? "relative flex h-3.5 items-end justify-center" : "relative flex h-4 items-end justify-center"}
            onMouseEnter={() => setHovered(cell.hourStart)}
            onMouseMove={(event) => setTooltip({ x: event.clientX, y: event.clientY, text: formatTitle(cell, componentLevel) })}
            onMouseLeave={() => {
              setHovered(null)
              setTooltip(null)
            }}
            aria-label={formatTitle(cell, componentLevel)}
          >
            <span className={componentLevel ? "h-3.5 rounded-full" : "h-4 rounded-full"} style={{ width: `${PILL_WIDTH}px`, backgroundColor: resolveStateColor(cell.state) }} />
          </button>
        ))}
      </div>
      <div className="relative mt-1 h-4" style={{ width: `${trackWidth}px` }}>
        {dayMarkers.map((marker) => (
          <span
            key={marker.hourStart}
            className="absolute -translate-x-1/2 text-[10px]"
            style={{ left: `${marker.leftPx}px`, color: "var(--text-muted)" }}
          >
            {marker.label}
          </span>
        ))}
      </div>
      </div>
    </div>
    </div>
    {hovered && tooltip ? (
      <div
        className="pointer-events-none fixed z-[9999] whitespace-nowrap rounded-md border px-2 py-1 text-[10px]"
        style={{
          left: tooltip.x + 10,
          top: tooltip.y + 14,
          backgroundColor: "#fff",
          borderColor: "var(--border-soft)",
          color: "var(--text-main)",
        }}
      >
        {tooltip.text}
      </div>
    ) : null}
    </div>
  )
}

function resolveStateColor(state: HourlyCell["state"]) {
  if (state === "green") return "#22c55e"
  if (state === "red") return "#ef4444"
  if (state === "yellow") return "#eab308"
  return "#cbd5e1"
}

function formatTitle(cell: HourlyCell, componentLevel: boolean) {
  const base = new Date(cell.hourStart).toLocaleString()
  if (componentLevel) {
    return `${base} | ${cell.state.toUpperCase()} | ${cell.downChecks ?? 0}/${cell.totalChecks ?? 0} checks down`
  }
  return `${base} | ${cell.state.toUpperCase()} | ${cell.downChecks ?? 0}/${cell.totalChecks ?? 0} checks down`
}

function CurrentStatus({ state }: { state: HealthState }) {
  const label = state === "green" ? "Hijau" : state === "yellow" ? "Kuning" : state === "red" ? "Merah" : "Tidak ada data"
  return (
    <p className="text-xs" style={{ color: "var(--text-muted)" }}>
      Saat ini: <span style={{ color: resolveStateColor(state), fontWeight: 600 }}>{label}</span>
    </p>
  )
}

function UptimeBadge({ uptimePercent }: { uptimePercent: number | null }) {
  const level = getUptimeLevel(uptimePercent)

  if (level === "neutral") {
    return <span className="inline-block h-3 w-3 rounded-full" style={{ backgroundColor: "#9ca3af" }} aria-label="No uptime data" />
  }

  if (level === "good") {
    return (
      <span className="inline-flex h-4 w-4 items-center justify-center rounded-full text-[10px] font-bold text-white" style={{ backgroundColor: "#22c55e" }} aria-label="Uptime good">
        ✓
      </span>
    )
  }

  const color = level === "warn" ? "#eab308" : "#ef4444"
  return (
    <span className="inline-flex h-4 w-4 items-center justify-center rounded-full text-[10px] font-bold text-white" style={{ backgroundColor: color }} aria-label={level === "warn" ? "Uptime warning" : "Uptime critical"}>
      !
    </span>
  )
}

function getUptimeLevel(uptimePercent: number | null): UptimeLevel {
  if (uptimePercent === null || !Number.isFinite(uptimePercent)) {
    return "neutral"
  }
  if (uptimePercent > 99) {
    return "good"
  }
  if (uptimePercent >= 90) {
    return "warn"
  }
  return "bad"
}

function computeComponentUptime(cells: HourlyCell[]) {
  let totalChecks = 0
  let downChecks = 0
  for (const cell of cells) {
    totalChecks += cell.totalChecks ?? 0
    downChecks += cell.downChecks ?? 0
  }

  if (totalChecks === 0) {
    return null
  }

  return ((totalChecks - downChecks) / totalChecks) * 100
}

function formatPercentOnly(value: number | null) {
  if (value === null || !Number.isFinite(value)) {
    return "No data"
  }
  return `${value.toFixed(2)}%`
}

function getLatestState(cells: HourlyCell[]): HealthState {
  for (let i = cells.length - 1; i >= 0; i -= 1) {
    if (cells[i].state !== "gray") return cells[i].state
  }
  return "gray"
}

function getDayMarkers(cells: HourlyCell[]) {
  const PILL_WIDTH = 5
  const PILL_GAP = 2
  const markers: Array<{ hourStart: string; label: string; leftPx: number }> = []
  let previousDay = ""

  for (let i = 0; i < cells.length; i += 1) {
    const hour = new Date(cells[i].hourStart)
    const dayKey = `${hour.getFullYear()}-${hour.getMonth()}-${hour.getDate()}`
    if (dayKey !== previousDay) {
      markers.push({
        hourStart: cells[i].hourStart,
        label: hour.toLocaleDateString([], { day: "2-digit", month: "short" }),
        leftPx: i * (PILL_WIDTH + PILL_GAP) + PILL_WIDTH / 2,
      })
      previousDay = dayKey
    }
  }

  return markers
}
