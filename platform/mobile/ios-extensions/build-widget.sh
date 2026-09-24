#!/bin/bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
CRATE="$ROOT/platform/rust/timacad-core"
OUT="$ROOT/platform/mobile/ios-extensions/build"
rm -rf "$OUT"
mkdir -p "$OUT/headers" "$OUT/simulator"

export PATH="$HOME/.cargo/bin:$PATH"
rustup target add aarch64-apple-ios aarch64-apple-ios-sim x86_64-apple-ios
cd "$CRATE"
cargo build --lib --release --no-default-features
cargo build --lib --release --no-default-features --target aarch64-apple-ios
cargo build --lib --release --no-default-features --target aarch64-apple-ios-sim
cargo build --lib --release --no-default-features --target x86_64-apple-ios

HOST_LIB="$CRATE/target/release/libtimacad_core.dylib"
if [[ ! -f "$HOST_LIB" ]]; then
  echo "host cdylib is missing: $HOST_LIB" >&2
  exit 1
fi
cargo run --quiet --no-default-features --features cli --bin uniffi-bindgen -- generate --library "$HOST_LIB" --language swift --out-dir "$OUT/swift"

cp "$OUT/swift/"*.h "$OUT/headers/"
cp "$OUT/swift/"*.modulemap "$OUT/headers/module.modulemap"
mkdir -p "$OUT/headers-sim"
cp "$OUT/headers/"* "$OUT/headers-sim/"
lipo -create \
  "$CRATE/target/aarch64-apple-ios-sim/release/libtimacad_core.a" \
  "$CRATE/target/x86_64-apple-ios/release/libtimacad_core.a" \
  -output "$OUT/simulator/libtimacad_core.a"
xcodebuild -create-xcframework \
  -library "$CRATE/target/aarch64-apple-ios/release/libtimacad_core.a" -headers "$OUT/headers" \
  -library "$OUT/simulator/libtimacad_core.a" -headers "$OUT/headers-sim" \
  -output "$OUT/SharedCore.xcframework"
find "$OUT/SharedCore.xcframework" -type f -name '*.a' -print
echo "XCFRAMEWORK_READY"

SDK="$(xcrun --sdk iphonesimulator --show-sdk-path)"
xcrun swiftc \
  -sdk "$SDK" \
  -target arm64-apple-ios17.0-simulator \
  -I "$OUT/headers-sim" \
  -L "$OUT/simulator" \
  -Xlinker -force_load -Xlinker "$OUT/simulator/libtimacad_core.a" \
  -lc++ \
  -framework Foundation \
  -framework CoreFoundation \
  -framework Security \
  -framework WidgetKit \
  -framework SwiftUI \
  "$ROOT/platform/mobile/ios-extensions/TimacadWidget/ScheduleWidget.swift" \
  "$OUT/swift/"*.swift \
  -emit-library \
  -module-name TimacadWidget \
  -o "$OUT/libTimacadWidget.dylib"
echo "WIDGETKIT_LINKED $OUT/libTimacadWidget.dylib"
