# Original User Request

## 2026-09-08T00:08:40Z

Full-cycle development, design refinement, and cross-platform deployment of the RGAU-MSHA Timiryazev student application: complete PWA setup for iOS "Add to Home Screen", Android native build setup via Capacitor, top-tier fluid animations (radial dark-mode wave, spring sheets, staggered lists), custom campus markers modeled after official university cartography, and automated GitHub Actions CI/CD workflow for web and Android.

Working directory: d:/raspos
Integrity mode: development

## Requirements

### R1. PWA & iOS "Add to Home Screen"
- Provide a complete Web App Manifest (`public/manifest.webmanifest` or `public/manifest.json`) configured with standalone display mode, orientation, brand theme `#2D5016`, background `#F4F1EB`, and icons.
- Add iOS-specific headers and meta tags (`apple-touch-icon`, `apple-mobile-web-app-capable`, `apple-mobile-web-app-status-bar-style`, `apple-mobile-web-app-title`) into `index.html`.
- Implement a non-intrusive, dismissible iOS onboarding tip/modal that detects iOS Safari and guides students with step-by-step instructions (Share button → "На экран «Домой»").

### R2. Android Native Build with Capacitor
- Configure Capacitor (`@capacitor/core`, `@capacitor/cli`, `@capacitor/android`) targeting the `d:/raspos` project with app id `ru.timacad.student` and app name "РГАУ Расписание".
- Ensure `capacitor.config.ts` or `capacitor.config.json` correctly points to the `dist` web directory.
- Provide build and sync commands in `package.json` (`build:android`, `sync:android`).
- Generate GitHub Actions workflow (`.github/workflows/build-android.yml`) to automatically build unsigned/signed release APK artifacts on push.

### R3. Top-Tier UI Polish & Animations
- **Dark Mode Wave Transition**: When the user clicks the theme toggle button, trigger a radial clip-path wave originating from the exact click coordinates across the screen.
- **Custom Campus Map Pins**: Upgrade campus markers to match the visual language of the official Timiryazev map reference (distinctive colored badge silhouettes with internal icons/numbers for 🏛 Корпуса, 🏠 Общежития, 🔬 Кафедры, 🍽 Столовые и буфеты).
- **Sheet & Search Motion**: Spring transitions on bottom sheets and search bar expand animations.

### R4. Automated Verification and CI/CD
- Add GitHub Actions CI workflow (`.github/workflows/deploy.yml`) to build the static web application for GitHub Pages.
- Ensure `vite.config.ts` and all TypeScript source code pass build checks without unhandled exceptions.

## Acceptance Criteria

### PWA / iOS
- [ ] Valid `manifest.json` present in `public/` and linked in `index.html`.
- [ ] Apple mobile web app tags and touch icons configured.
- [ ] In-app prompt/banner available for iOS devices.

### Android Build
- [ ] Capacitor configuration initialized and integrated into project scripts.
- [ ] Android project wrapper ready or CI workflow capable of building an APK.

### Visual & Motion Polish
- [ ] Dark mode switch displays radial wave expansion effect.
- [ ] Custom SVG map pins accurately reflect distinct categories (buildings, dorms, departments, dining) inspired by the reference map.
- [ ] Staggered animations across schedule cards and list items.
