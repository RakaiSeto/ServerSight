import { useState, type FormEvent } from "react"
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router"
import { api } from "@/lib/api"
import { setToken } from "@/lib/auth"

export const Route = createFileRoute("/login")({
  component: LoginPage,
})

function LoginPage() {
  const navigate = useNavigate()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault()
    setLoading(true)
    setError("")

    try {
      const response = await api.post("/auth/login", { email, password })
      setToken(response.data.accessToken)
      await navigate({ to: "/admin/system" })
    } catch {
      setError("Login failed. Check your credentials.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md items-center px-4">
      <div className="w-full">
        <Link to="/" className="mb-3 inline-block text-sm font-medium" style={{ color: "var(--text-muted)" }}>
          Back to Public
        </Link>
        <form onSubmit={onSubmit} className="w-full rounded-2xl border p-6 shadow-sm" style={{ backgroundColor: "var(--bg-panel)", borderColor: "var(--border-soft)" }}>
        <h1 className="text-2xl font-semibold" style={{ color: "var(--text-main)" }}>ServerSight Admin</h1>
        <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>Sign in to manage system and monitors.</p>
        <label className="mt-5 block text-sm" style={{ color: "var(--text-muted)" }}>Email</label>
        <input className="mt-1 w-full rounded-lg border px-3 py-2" style={{ borderColor: "var(--border-soft)", backgroundColor: "var(--bg-panel-strong)", color: "var(--text-main)" }} value={email} onChange={(e) => setEmail(e.target.value)} />
        <label className="mt-4 block text-sm" style={{ color: "var(--text-muted)" }}>Password</label>
        <input type="password" className="mt-1 w-full rounded-lg border px-3 py-2" style={{ borderColor: "var(--border-soft)", backgroundColor: "var(--bg-panel-strong)", color: "var(--text-main)" }} value={password} onChange={(e) => setPassword(e.target.value)} />
        {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}
        <button disabled={loading} className="mt-5 w-full rounded-lg px-3 py-2 font-medium" style={{ backgroundColor: "var(--accent-primary-soft)", border: "1px solid var(--accent-primary)", color: "var(--accent-memory)" }}>
          {loading ? "Signing in..." : "Sign in"}
        </button>
        </form>
      </div>
    </main>
  )
}
