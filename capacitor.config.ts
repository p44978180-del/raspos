import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: "ru.timacad.student",
  appName: "ТИМ Кампус",
  webDir: process.env.ANDROID_WEB_DIR || "dist",
  server: {
    androidScheme: "https",
  },
}

export default config
