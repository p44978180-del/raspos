import React from "react"
import ReactDOM from "react-dom/client"
import App from "./App"
import "./index.css"
import { QueryProvider } from "./app/providers/QueryClientProvider"

// Harmonize iOS status bar & viewport theme color with app header (eliminates black top bar)
if (typeof document !== "undefined") {
  try {
    const isDark =
      document.documentElement.classList.contains("dark") ||
      (typeof window !== "undefined" &&
        window.matchMedia("(prefers-color-scheme: dark)").matches)
    const metaStatus = document.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]')
    if (metaStatus) metaStatus.setAttribute("content", "black-translucent")
    const metaThemes = document.querySelectorAll('meta[name="theme-color"]')
    metaThemes.forEach((m) => m.setAttribute("content", isDark ? "#090D0B" : "#F8F9FA"))
  } catch {}
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryProvider>
      <App />
    </QueryProvider>
  </React.StrictMode>,
)

if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(() => {})
  })
}
