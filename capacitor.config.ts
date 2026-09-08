import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: "ru.timacad.student",
  appName: "РГАУ Расписание",
  webDir: "dist",
  server: {
    androidScheme: "https",
  },
}

export default config
