import { useState, type FormEvent } from "react"
import { createFileRoute, Link, redirect, useNavigate } from "@tanstack/react-router"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { api } from "@/lib/api"
import { clearToken, isAuthenticated } from "@/lib/auth"

type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE"

type Website = {
  id: string
  name: string
  url: string
  enabled: boolean
  components: Array<{
    id: string
    label: string
    targetUrl: string
    requestMethod: HttpMethod
    requestPayload: string | null
    enabled: boolean
  }>
}

const REQUEST_METHODS: HttpMethod[] = ["GET", "POST", "PUT", "PATCH", "DELETE"]

export const Route = createFileRoute("/admin/health")({
  beforeLoad: () => {
    if (!isAuthenticated()) {
      throw redirect({ to: "/login" })
    }
  },
  component: AdminHealthPage,
})

function AdminHealthPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [name, setName] = useState("")
  const [url, setUrl] = useState("")
  const [componentLabel, setComponentLabel] = useState<Record<string, string>>({})
  const [componentUrl, setComponentUrl] = useState<Record<string, string>>({})
  const [componentMethod, setComponentMethod] = useState<Record<string, HttpMethod>>({})
  const [componentPayload, setComponentPayload] = useState<Record<string, string>>({})
  const [showUrl, setShowUrl] = useState<Record<string, boolean>>({})
  const [openWebsiteId, setOpenWebsiteId] = useState<string | null>(null)

  const websites = useQuery({
    queryKey: ["admin-websites"],
    queryFn: async () => (await api.get("/admin/health/websites")).data as { data: Website[] },
  })

  const createMutation = useMutation({
    mutationFn: async () => api.post("/admin/health/websites", { name, url }),
    onSuccess: async () => {
      setName("")
      setUrl("")
      await queryClient.invalidateQueries({ queryKey: ["admin-websites"] })
    },
  })

  const toggleMutation = useMutation({
    mutationFn: async (website: Website) => api.put(`/admin/health/websites/${website.id}`, { enabled: !website.enabled }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["admin-websites"] })
    },
  })

  const deleteMutation = useMutation({
    mutationFn: async (websiteId: string) => api.delete(`/admin/health/websites/${websiteId}`),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["admin-websites"] })
    },
  })

  const createComponentMutation = useMutation({
    mutationFn: async ({
      websiteId,
      label,
      targetUrl,
      requestMethod,
      requestPayload,
    }: {
      websiteId: string
      label: string
      targetUrl: string
      requestMethod: HttpMethod
      requestPayload: string
    }) =>
      api.post(`/admin/health/websites/${websiteId}/components`, {
        label,
        targetUrl,
        requestMethod,
        requestPayload: normalizePayloadForRequest(requestPayload),
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["admin-websites"] })
    },
  })

  const updateComponentMutation = useMutation({
    mutationFn: async ({
      componentId,
      payload,
    }: {
      componentId: string
      payload: { label?: string; targetUrl?: string; enabled?: boolean; requestMethod?: HttpMethod; requestPayload?: string | null }
    }) => api.put(`/admin/health/components/${componentId}`, payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["admin-websites"] })
    },
  })

  const deleteComponentMutation = useMutation({
    mutationFn: async (componentId: string) => api.delete(`/admin/health/components/${componentId}`),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["admin-websites"] })
    },
  })

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault()
    await createMutation.mutateAsync()
  }

  const onSignOut = () => {
    clearToken()
    void navigate({ to: "/login", replace: true })
  }

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <header className="flex items-center rounded-xl border px-4 py-3" style={{ backgroundColor: "var(--bg-panel)", borderColor: "var(--border-soft)" }}>
        <nav className="flex w-full items-center justify-center gap-7">
          <Link to="/admin/system" className="pb-1 text-sm font-medium transition-colors" style={{ color: "var(--text-muted)" }}>System</Link>
          <Link to="/admin/docker" className="pb-1 text-sm font-medium transition-colors" style={{ color: "var(--text-muted)" }}>Docker</Link>
          <Link to="/admin/health" className="border-b border-current pb-1 text-sm font-medium" style={{ color: "var(--accent-memory)" }}>Websites</Link>
        </nav>
        <button onClick={onSignOut} className="ml-4 shrink-0 text-sm font-medium" style={{ color: "var(--text-main)" }}>Sign out</button>
      </header>

      <h1 className="mt-6 text-2xl font-semibold" style={{ color: "var(--text-main)" }}>Website Monitoring</h1>
      <form onSubmit={onSubmit} className="mt-5 grid gap-3 rounded-xl border p-4 sm:grid-cols-3" style={{ borderColor: "var(--border-soft)", backgroundColor: "var(--bg-panel)" }}>
        <input className="rounded-lg border px-3 py-2" style={{ borderColor: "var(--border-soft)", backgroundColor: "var(--bg-panel-strong)", color: "var(--text-main)" }} placeholder="Website name" value={name} onChange={(e) => setName(e.target.value)} required />
        <input className="rounded-lg border px-3 py-2" style={{ borderColor: "var(--border-soft)", backgroundColor: "var(--bg-panel-strong)", color: "var(--text-main)" }} placeholder="https://example.com" value={url} onChange={(e) => setUrl(e.target.value)} required />
        <button className="rounded-lg px-3 py-2 font-medium" style={{ backgroundColor: "var(--accent-primary-soft)", border: "1px solid var(--accent-primary)", color: "var(--accent-memory)" }}>Add website</button>
      </form>

      <section className="mt-5 space-y-3">
        {websites.data?.data.map((website) => {
          const isOpen = openWebsiteId === website.id
          return (
            <article key={website.id} className="rounded-xl border" style={{ borderColor: isOpen ? "var(--accent-primary)" : "var(--border-soft)", backgroundColor: "var(--bg-panel)" }}>
              <div className="flex flex-wrap items-center gap-3 px-4 py-3">
                <button
                  type="button"
                  onClick={() => setOpenWebsiteId((prev) => (prev === website.id ? null : website.id))}
                  className="flex min-w-0 flex-1 items-center gap-3 text-left"
                >
                  <span className="inline-flex h-6 w-6 items-center justify-center rounded-md border text-xs" style={{ borderColor: "var(--border-soft)", color: "var(--text-muted)", backgroundColor: "var(--bg-panel-strong)" }}>
                    {isOpen ? "-" : "+"}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold" style={{ color: "var(--text-main)" }}>{website.name}</p>
                    <p className="truncate text-xs" style={{ color: "var(--text-muted)" }}>{website.url}</p>
                  </div>
                </button>
                <span className="rounded-md border px-2 py-1 text-xs" style={{ borderColor: "var(--border-soft)", color: website.enabled ? "var(--accent-memory)" : "var(--text-muted)", backgroundColor: website.enabled ? "var(--accent-primary-soft)" : "var(--bg-panel-strong)" }}>
                  {website.enabled ? "Enabled" : "Disabled"}
                </span>
                <span className="text-xs" style={{ color: "var(--text-muted)" }}>Components: {website.components.length}</span>
                <div className="ml-auto flex gap-2">
                  <button type="button" onClick={() => toggleMutation.mutate(website)} className="rounded border px-2 py-1 text-xs" style={{ borderColor: "var(--accent-primary)", backgroundColor: "var(--accent-primary-soft)", color: "var(--accent-memory)" }}>Toggle</button>
                  <button type="button" onClick={() => deleteMutation.mutate(website.id)} className="rounded border px-2 py-1 text-xs" style={{ borderColor: "rgba(248, 113, 113, 0.4)", color: "#f87171" }}>Delete</button>
                </div>
              </div>

              {isOpen ? (
                <div className="border-t px-4 pb-4 pt-3" style={{ borderColor: "var(--border-soft)" }}>
                  <div className="space-y-2">
                    {website.components.map((component) => (
                      <div key={component.id} className="rounded border p-2" style={{ borderColor: "var(--border-soft)", backgroundColor: "var(--bg-panel-strong)" }}>
                        <div className="flex items-center gap-2">
                          <input
                            className="min-w-0 flex-1 rounded border px-2 py-1 text-xs"
                            style={{ borderColor: "var(--border-soft)", backgroundColor: "#fff", color: "var(--text-main)" }}
                            value={componentLabel[component.id] ?? component.label}
                            onChange={(e) => setComponentLabel((prev) => ({ ...prev, [component.id]: e.target.value }))}
                          />
                          <button
                            type="button"
                            className="rounded border px-2 py-1 text-xs"
                            style={{ borderColor: "var(--border-soft)", color: "var(--text-main)" }}
                            onClick={() => setShowUrl((prev) => ({ ...prev, [component.id]: !prev[component.id] }))}
                          >
                            {showUrl[component.id] ? "Hide URL" : "Reveal URL"}
                          </button>
                        </div>
                        <input
                          className="mt-2 w-full rounded border px-2 py-1 text-xs"
                          style={{ borderColor: "var(--border-soft)", backgroundColor: "#fff", color: "var(--text-main)" }}
                          type={showUrl[component.id] ? "text" : "password"}
                          value={componentUrl[component.id] ?? component.targetUrl}
                          onChange={(e) => setComponentUrl((prev) => ({ ...prev, [component.id]: e.target.value }))}
                        />
                        <div className="mt-2 grid gap-2 sm:grid-cols-2">
                          <select
                            className="rounded border px-2 py-1 text-xs"
                            style={{ borderColor: "var(--border-soft)", backgroundColor: "#fff", color: "var(--text-main)" }}
                            value={componentMethod[component.id] ?? component.requestMethod}
                            onChange={(e) => setComponentMethod((prev) => ({ ...prev, [component.id]: e.target.value as HttpMethod }))}
                          >
                            {REQUEST_METHODS.map((method) => (
                              <option key={method} value={method}>{method}</option>
                            ))}
                          </select>
                          <input
                            className="rounded border px-2 py-1 text-xs"
                            style={{ borderColor: "var(--border-soft)", backgroundColor: "#fff", color: "var(--text-main)" }}
                            placeholder='Payload JSON, ex: {"key":"value"}'
                            value={componentPayload[component.id] ?? component.requestPayload ?? ""}
                            onChange={(e) => setComponentPayload((prev) => ({ ...prev, [component.id]: e.target.value }))}
                          />
                        </div>
                        <div className="mt-2 flex gap-2">
                          <button
                            type="button"
                            className="rounded border px-2 py-1 text-xs"
                            style={{ borderColor: "var(--border-soft)", color: "var(--text-main)" }}
                            onClick={() => {
                              const payloadValue = componentPayload[component.id] ?? component.requestPayload ?? ""
                              if (!isValidJsonPayload(payloadValue)) {
                                window.alert("Payload harus JSON valid")
                                return
                              }
                              updateComponentMutation.mutate({
                                componentId: component.id,
                                payload: {
                                  label: componentLabel[component.id] ?? component.label,
                                  targetUrl: componentUrl[component.id] ?? component.targetUrl,
                                  requestMethod: componentMethod[component.id] ?? component.requestMethod,
                                  requestPayload: normalizePayloadForRequest(payloadValue),
                                },
                              })
                            }}
                          >
                            Save
                          </button>
                          <button
                            type="button"
                            className="rounded border px-2 py-1 text-xs"
                            style={{ borderColor: "var(--border-soft)", color: "var(--text-main)" }}
                            onClick={() => updateComponentMutation.mutate({ componentId: component.id, payload: { enabled: !component.enabled } })}
                          >
                            {component.enabled ? "Disable" : "Enable"}
                          </button>
                          <button
                            type="button"
                            className="rounded border px-2 py-1 text-xs"
                            style={{ borderColor: "rgba(248, 113, 113, 0.4)", color: "#f87171" }}
                            onClick={() => deleteComponentMutation.mutate(component.id)}
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    <input
                      className="rounded border px-2 py-1 text-xs"
                      style={{ borderColor: "var(--border-soft)", backgroundColor: "#fff", color: "var(--text-main)" }}
                      placeholder="Component label"
                      value={componentLabel[`new:${website.id}`] ?? ""}
                      onChange={(e) => setComponentLabel((prev) => ({ ...prev, [`new:${website.id}`]: e.target.value }))}
                    />
                    <input
                      className="rounded border px-2 py-1 text-xs"
                      style={{ borderColor: "var(--border-soft)", backgroundColor: "#fff", color: "var(--text-main)" }}
                      placeholder="https://service/path"
                      value={componentUrl[`new:${website.id}`] ?? ""}
                      onChange={(e) => setComponentUrl((prev) => ({ ...prev, [`new:${website.id}`]: e.target.value }))}
                    />
                    <select
                      className="rounded border px-2 py-1 text-xs"
                      style={{ borderColor: "var(--border-soft)", backgroundColor: "#fff", color: "var(--text-main)" }}
                      value={componentMethod[`new:${website.id}`] ?? "GET"}
                      onChange={(e) => setComponentMethod((prev) => ({ ...prev, [`new:${website.id}`]: e.target.value as HttpMethod }))}
                    >
                      {REQUEST_METHODS.map((method) => (
                        <option key={method} value={method}>{method}</option>
                      ))}
                    </select>
                    <input
                      className="rounded border px-2 py-1 text-xs"
                      style={{ borderColor: "var(--border-soft)", backgroundColor: "#fff", color: "var(--text-main)" }}
                      placeholder='Payload JSON, ex: {"key":"value"}'
                      value={componentPayload[`new:${website.id}`] ?? ""}
                      onChange={(e) => setComponentPayload((prev) => ({ ...prev, [`new:${website.id}`]: e.target.value }))}
                    />
                    <button
                      type="button"
                      className="rounded border px-2 py-1 text-xs"
                      style={{ borderColor: "var(--border-soft)", color: "var(--text-main)" }}
                      onClick={() => {
                        const payloadValue = componentPayload[`new:${website.id}`] ?? ""
                        if (!isValidJsonPayload(payloadValue)) {
                          window.alert("Payload harus JSON valid")
                          return
                        }
                        createComponentMutation.mutate({
                          websiteId: website.id,
                          label: componentLabel[`new:${website.id}`] ?? "",
                          targetUrl: componentUrl[`new:${website.id}`] ?? "",
                          requestMethod: componentMethod[`new:${website.id}`] ?? "GET",
                          requestPayload: payloadValue,
                        })
                      }}
                    >
                      Add Component
                    </button>
                  </div>
                </div>
              ) : null}
            </article>
          )
        })}
      </section>
    </main>
  )
}

function isValidJsonPayload(value: string) {
  const trimmed = value.trim()
  if (!trimmed) {
    return true
  }
  try {
    JSON.parse(trimmed)
    return true
  } catch {
    return false
  }
}

function normalizePayloadForRequest(value: string) {
  const trimmed = value.trim()
  return trimmed ? trimmed : null
}
