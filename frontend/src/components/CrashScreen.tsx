// src/components/CrashScreen.tsx
export function CrashScreen({ error }: { error?: Error }) {
  return (
    <div className="flex h-screen items-center justify-center">
      <div>
        <h1>💥 App crashed</h1>
        <pre className="text-xs opacity-70">
          {error?.message}
        </pre>
      </div>
    </div>
  )
}
