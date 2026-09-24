# iosApp

Xcode project for the iOS host. It is created on a Mac, where `:shared` also compiles `iosArm64` and `iosSimulatorArm64` into the `SharedCore` framework.

WidgetKit lives in `platform/mobile/ios-extensions/`. `.github/workflows/ios.yml` builds `SharedCore.xcframework` and compiles that Swift target on `macos-latest`. ActivityKit is not in this tree, and a Kotlin screen does not stand in for it. The workflow has not been run from Windows.
