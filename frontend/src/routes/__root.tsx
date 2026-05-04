import { createRootRoute, Outlet } from "@tanstack/react-router"
import { ErrorBoundary } from "react-error-boundary"
import { CrashScreen } from "@/components/CrashScreen"

export const Route = createRootRoute({
    component: RootLayout,
    errorComponent: RootError,
})

function RootError({ error }: { error: unknown }) {
    console.error(error)

    return (
        <div className="p-6">
            <h1 className="text-xl font-bold">Something went wrong</h1>
            <p className="text-sm opacity-70">
                This is not your fault.
            </p>
        </div>
    )
}

function RootLayout() {
    return (
        <div className="min-h-screen">
            <ErrorBoundary fallback={<CrashScreen />}>
                <Outlet />
            </ErrorBoundary>
        </div>
    )
}