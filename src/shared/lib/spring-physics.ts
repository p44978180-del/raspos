/**
 * Fluid Motion Standard: Spring Physics Tokens
 * Standardized across all interactive components for consistent tactile feel.
 */
export const springPhysics = {
  instant: { type: "spring", stiffness: 500, damping: 40 },
  snappy: { type: "spring", stiffness: 400, damping: 30, mass: 0.8 },
  gentle: { type: "spring", stiffness: 200, damping: 24, mass: 1 },
  bouncy: { type: "spring", stiffness: 350, damping: 18 },
} as const

export type SpringPreset = keyof typeof springPhysics
