import React from "react"
import ReactDOM from "react-dom/client"
import App from "./App"
import { Capacitor } from "@capacitor/core"
import "./index.css"

ReactDOM.createRoot(document.getElementById("root")!).render(<React.StrictMode><App /></React.StrictMode>)
if ("serviceWorker" in navigator && Capacitor.isNativePlatform()) {
  // The APK already contains its offline shell. Retire any legacy worker that
  // could keep serving an older shell after installing an application update.
  void navigator.serviceWorker.getRegistrations().then(registrations => Promise.all(registrations.map(r => r.unregister()))).catch(() => {})
} else if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => {})
  })
}
