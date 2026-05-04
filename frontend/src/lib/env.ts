export const ENV = {
  API_BASE_URL: import.meta.env.VITE_API_BASE_URL,
}

if (!ENV.API_BASE_URL) {
  throw new Error("VITE_API_BASE_URL is not defined")
}
