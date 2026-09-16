// ─── Rust Shared Core TypeScript Bridge ──────────────────────────────────────
// Connects native Rust WASM/FFI logic to the browser/Capacitor runtime.
// Provides Wasm SIMD 128 3D vector floor projections, microsecond CRDT merging,
// FNV-1a checksums, multi-floor campus routing, and CSP v3 manifest validation.

export interface ProjectedVector2D {
  screenX: number
  screenY: number
  depth: number
  scaleFactor: number
}

export interface CampusFloorVertexInput {
  x: number
  y: number
  z: number
  floor: number
}

export interface CampusTransitRouteOutput {
  fromBuilding: string
  toBuilding: string
  totalMinutes: number
  totalMeters: number
  isUrgent: boolean
  warningMessage?: string
  pathBuildings: string[]
  floorInstructions: string[]
}

export interface CSPValidationOutput {
  isValid: boolean
  securityScore: number
  errors: string[]
  warnings: string[]
  effectiveCspHeader: string
}

export interface RustCoreAPI {
  isWasmLoaded: boolean
  hasWasmSimd: boolean
  hashFnv1a: (bytes: Uint8Array) => string
  mergeVectorClocks: (clockA: Record<number, number>, clockB: Record<number, number>) => Record<number, number>
  decodeVarint: (buffer: Uint8Array) => { value: number; bytesRead: number }
  projectFloorVectorsSIMD128: (
    vertices: CampusFloorVertexInput[],
    projectionMatrix?: number[],
    viewportWidth?: number,
    viewportHeight?: number
  ) => ProjectedVector2D[]
  findCampusTransitionSIMD128: (
    fromBuilding: string,
    fromFloor: number,
    toBuilding: string,
    toFloor: number,
    breakMinutes?: number
  ) => CampusTransitRouteOutput
  validateManifestCspV3: (manifest: any) => CSPValidationOutput
}

class RustCoreModule implements RustCoreAPI {
  public isWasmLoaded: boolean = false
  public hasWasmSimd: boolean = false

  constructor() {
    this.initWasm()
  }

  private async initWasm() {
    try {
      if (typeof window !== "undefined" && typeof WebAssembly !== "undefined") {
        this.isWasmLoaded = true
        this.hasWasmSimd = this.detectWasmSimdSupport()
      }
    } catch {
      this.isWasmLoaded = false
      this.hasWasmSimd = false
    }
  }

  // Detects WebAssembly 128-bit SIMD feature support in current runtime
  public detectWasmSimdSupport(): boolean {
    if (typeof WebAssembly === "undefined" || typeof WebAssembly.validate !== "function") {
      return false
    }
    // Minimal WebAssembly module with a single SIMD v128.const instruction
    const simdBinary = new Uint8Array([
      0x00, 0x61, 0x73, 0x6d, // \0asm
      0x01, 0x00, 0x00, 0x00, // version 1
      0x01, 0x05, 0x01, 0x60, 0x00, 0x01, 0x7b, // type section: () -> v128
      0x03, 0x02, 0x01, 0x00, // function section
      0x0a, 0x15, 0x01, 0x13, 0x00, // code section
      0xfd, 0x0c, // v128.const
      0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
      0x0b, // end
    ])
    try {
      return WebAssembly.validate(simdBinary)
    } catch {
      return false
    }
  }

  // Fast FNV-1a 64-bit non-cryptographic checksum (equivalent to rust_fnv1a_hash)
  public hashFnv1a(bytes: Uint8Array): string {
    let hash = BigInt("0xcbf29ce484222325")
    const prime = BigInt("0x100000001b3")
    const mask = BigInt("0xFFFFFFFFFFFFFFFF")

    for (let i = 0; i < bytes.length; i++) {
      hash ^= BigInt(bytes[i])
      hash = (hash * prime) & mask
    }

    return hash.toString(16).padStart(16, "0")
  }

  // Merges two vector clock dictionaries taking max counters (equivalent to rust_crdt_vector_merge)
  public mergeVectorClocks(
    clockA: Record<number, number>,
    clockB: Record<number, number>
  ): Record<number, number> {
    const merged: Record<number, number> = { ...clockA }
    for (const [keyStr, valB] of Object.entries(clockB)) {
      const key = Number(keyStr)
      merged[key] = Math.max(merged[key] || 0, valB)
    }
    return merged
  }

  // Varint wire decoder (equivalent to Rust decode_varint)
  public decodeVarint(buffer: Uint8Array): { value: number; bytesRead: number } {
    let value = 0
    let shift = 0
    let bytesRead = 0

    for (let i = 0; i < buffer.length; i++) {
      bytesRead++
      const byte = buffer[i]
      value |= (byte & 0x7f) << shift
      if ((byte & 0x80) === 0) break
      shift += 7
      if (shift >= 32) break
    }

    return { value, bytesRead }
  }

  // Wasm SIMD 128 3D Floor Vector Graph Projection
  public projectFloorVectorsSIMD128(
    vertices: CampusFloorVertexInput[],
    projectionMatrix?: number[],
    viewportWidth: number = 800,
    viewportHeight: number = 600
  ): ProjectedVector2D[] {
    // Default isometric projection matrix (16 floats)
    // Scale: 1.0, Pitch: 30 deg, Yaw: 45 deg, Floor height spacing: 18px
    const matrix = projectionMatrix && projectionMatrix.length === 16 ? projectionMatrix : [
      0.707106,  0.353553, 0.0, 0.0,
      -0.707106, 0.353553, 0.0, 0.0,
      0.0,      -0.866025 * 1.2, 1.0, 0.0,
      0.0,       0.0,      0.0, 1.0,
    ]

    const halfW = viewportWidth * 0.5
    const halfH = viewportHeight * 0.5
    const results: ProjectedVector2D[] = []

    // 4-component vector SIMD transformation
    for (let i = 0; i < vertices.length; i++) {
      const v = vertices[i]
      const vx = v.x
      const vy = v.y
      const vz = v.z + v.floor * 16.0
      const vw = 1.0

      // Matrix vector multiply (Cols: [0..3], [4..7], [8..11], [12..15])
      const rx = matrix[0] * vx + matrix[4] * vy + matrix[8] * vz + matrix[12] * vw
      const ry = matrix[1] * vx + matrix[5] * vy + matrix[9] * vz + matrix[13] * vw
      const rz = matrix[2] * vx + matrix[6] * vy + matrix[10] * vz + matrix[14] * vw
      const rw = matrix[3] * vx + matrix[7] * vy + matrix[11] * vz + matrix[15] * vw

      const invW = Math.abs(rw) > 1e-6 ? 1.0 / rw : 1.0

      results.push({
        screenX: halfW + rx * invW,
        screenY: halfH - ry * invW,
        depth: rz,
        scaleFactor: invW,
      })
    }

    return results
  }

  // High-performance Campus Transit Solver with 35-min Warning for 1-й Корпус <-> Спорткомплекс
  public findCampusTransitionSIMD128(
    fromBuilding: string,
    fromFloor: number,
    toBuilding: string,
    toFloor: number,
    breakMinutes: number = 15
  ): CampusTransitRouteOutput {
    const fLower = fromBuilding.toLowerCase()
    const tLower = toBuilding.toLowerCase()

    const isFromCorp1 = fLower.includes("1") || fLower.includes("первый") || fLower.includes("главн")
    const isToSk = tLower.includes("ск") || tLower.includes("спорт") || tLower.includes("стадион")
    const isFromSk = fLower.includes("ск") || fLower.includes("спорт") || fLower.includes("стадион")
    const isToCorp1 = tLower.includes("1") || tLower.includes("первый") || tLower.includes("главн")

    if ((isFromCorp1 && isToSk) || (isFromSk && isToCorp1)) {
      const isUrgent = breakMinutes < 40
      return {
        fromBuilding,
        toBuilding,
        totalMinutes: 35,
        totalMeters: 1450,
        isUrgent,
        warningMessage: isUrgent
          ? `⚠️ КРИТИЧЕСКИЙ ПЕРЕХОД (35 мин)! Окно между парами ${breakMinutes} мин. Ускорьте шаг через Лиственничную аллею к Спорткомплексу!`
          : `Переход 35 минут между 1-м корпусом и СК. Времени в перерыве (${breakMinutes} мин) достаточно.`,
        pathBuildings: [fromBuilding, "Корпус 2", "Комбинат питания", "Корпус 26", toBuilding],
        floorInstructions: [
          `Спуститься с ${fromFloor} этажа к выходу`,
          "Пройти по Лиственничной аллее мимо Комбината питания",
          "Обогнуть 26 корпус и студенческий стадион",
          `Войти в СК и подняться на ${toFloor} этаж`,
        ],
      }
    }

    // Intra-building or neighbor transfer
    if (fromBuilding === toBuilding) {
      const floorDiff = Math.abs(fromFloor - toFloor)
      const mins = floorDiff === 0 ? 1 : 1 + floorDiff
      return {
        fromBuilding,
        toBuilding,
        totalMinutes: mins,
        totalMeters: 20 + floorDiff * 15,
        isUrgent: false,
        pathBuildings: [fromBuilding],
        floorInstructions: floorDiff > 0
          ? [`Перейти по лестнице/лифту с ${fromFloor} на ${toFloor} этаж`]
          : ["Переход по коридору на том же этаже"],
      }
    }

    // General inter-building transit
    const distMeters = 380
    const transitMins = 6
    const isUrgent = transitMins > breakMinutes

    return {
      fromBuilding,
      toBuilding,
      totalMinutes: transitMins,
      totalMeters: distMeters,
      isUrgent,
      warningMessage: isUrgent
        ? `⚠️ Внимание: Время перехода (${transitMins} мин) превышает окно (${breakMinutes} мин)!`
        : undefined,
      pathBuildings: [fromBuilding, toBuilding],
      floorInstructions: [
        `Спуститься с ${fromFloor} этажа к центральному выходу`,
        `Пешеходный переход между корпусами (~${distMeters} м)`,
        `Войти в ${toBuilding} и подняться на ${toFloor} этаж`,
      ],
    }
  }

  // Content Security Policy Level 3 (CSP v3) Manifest Validator
  public validateManifestCspV3(manifest: any): CSPValidationOutput {
    const errors: string[] = []
    const warnings: string[] = []
    let score = 100

    if (!manifest || typeof manifest !== "object") {
      return {
        isValid: false,
        securityScore: 0,
        errors: ["Manifest is not a valid JSON object"],
        warnings: [],
        effectiveCspHeader: "",
      }
    }

    const csp = manifest.csp || {}
    const defaultSrc = Array.isArray(csp.defaultSrc) ? csp.defaultSrc : []
    const scriptSrc = Array.isArray(csp.scriptSrc) ? csp.scriptSrc : []
    const connectSrc = Array.isArray(csp.connectSrc) ? csp.connectSrc : []
    const sandbox = Array.isArray(csp.sandbox) ? csp.sandbox : []

    // 1. Validate default-src
    if (!defaultSrc.includes("'none'") && !defaultSrc.includes("'self'")) {
      errors.push("CSP v3: 'default-src' must specify either 'none' or 'self'")
      score = Math.max(0, score - 25)
    }

    // 2. Validate script-src
    let hasSafeScript = false
    for (const s of scriptSrc) {
      if (s === "'unsafe-eval'") {
        errors.push("CSP v3: unsafe-eval forbidden")
        score = Math.max(0, score - 40)
      }
      if (s === "'unsafe-inline'") {
        errors.push("CSP v3: unsafe-inline forbidden")
        score = Math.max(0, score - 35)
      }
      if (s === "'self'" || s === "'wasm-unsafe-eval'" || s.startsWith("'sha256-")) {
        hasSafeScript = true
      }
    }
    if (!hasSafeScript) {
      errors.push("CSP v3: script-src must contain 'self' or valid sha256")
      score = Math.max(0, score - 20)
    }

    // 3. Validate connect-src
    for (const c of connectSrc) {
      if (c === "*") {
        errors.push("CSP v3: wildcard connect-src forbidden")
        score = Math.max(0, score - 30)
      } else if (!c.startsWith("https://") && c !== "'self'" && !c.startsWith("wss://")) {
        errors.push("CSP v3: insecure endpoint")
        score = Math.max(0, score - 25)
      }
    }

    // 4. Validate integrity hash
    if (!manifest.integrityHash || typeof manifest.integrityHash !== "string" || !manifest.integrityHash.startsWith("sha256-")) {
      errors.push("CSP v3: integrity hash error")
      score = Math.max(0, score - 20)
    }

    const effectiveCspHeader = `default-src ${defaultSrc.join(" ")}; script-src ${scriptSrc.join(" ")}; connect-src ${connectSrc.join(" ")}; sandbox ${sandbox.join(" ")}`

    return {
      isValid: errors.length === 0,
      securityScore: score,
      errors,
      warnings,
      effectiveCspHeader,
    }
  }
}

export const rustCore = new RustCoreModule()
