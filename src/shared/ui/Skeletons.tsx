import React from "react"
import { motion, AnimatePresence } from "framer-motion"

export function ScheduleSkeleton() {
  return (
    <div className="space-y-3 p-4">
      {[1, 2, 3, 4].map((i) => (
        <div
          key={i}
          className="animate-pulse rounded-2xl bg-card p-4 space-y-2 border border-border/40"
          style={{ animationDelay: `${i * 80}ms` }}
        >
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-border/40" />
            <div className="flex-1 space-y-2">
              <div className="h-4 w-3/4 rounded bg-border/40" />
              <div className="h-3 w-1/2 rounded bg-border/30" />
            </div>
          </div>
          <div className="h-3 w-2/3 rounded bg-border/20 mt-2" />
        </div>
      ))}
    </div>
  )
}

export function CampusSkeleton() {
  return (
    <div className="animate-pulse rounded-2xl bg-card mx-4 mt-4" style={{ height: "260px" }}>
      <div className="w-full h-full rounded-2xl bg-border/30" />
    </div>
  )
}

export function SkeletonShimmerCard() {
  return (
    <div className="relative overflow-hidden rounded-2xl bg-card border border-border/60 p-4 space-y-3">
      <div className="flex items-center gap-3">
        <div className="w-12 h-12 rounded-xl bg-muted/80" />
        <div className="flex-1 space-y-2">
          <div className="h-4 w-3/4 rounded bg-muted/80" />
          <div className="h-3 w-1/2 rounded bg-muted/60" />
        </div>
      </div>
      <div className="h-3 w-2/3 rounded bg-muted/40" />

      {/* Shimmer gradient mask */}
      <motion.div
        className="absolute inset-0 z-10 pointer-events-none"
        style={{
          background:
            "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.08) 50%, transparent 100%)",
        }}
        animate={{ x: ["-100%", "100%"] }}
        transition={{
          repeat: Infinity,
          duration: 1.4,
          ease: "linear",
        }}
      />
    </div>
  )
}

export function ScheduleLoadingBoundary({
  isLoading,
  children,
}: {
  isLoading: boolean
  children: React.ReactNode
}) {
  return (
    <AnimatePresence mode="wait">
      {isLoading ? (
        <motion.div
          key="skeleton"
          initial={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
          className="space-y-3 p-4"
        >
          {[1, 2, 3, 4].map((i) => (
            <SkeletonShimmerCard key={i} />
          ))}
        </motion.div>
      ) : (
        <motion.div
          key="content"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.25 }}
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  )
}
