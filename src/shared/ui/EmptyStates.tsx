import React from "react"

export function EmptyDayState({ weekday }: { weekday: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-6 text-center animate-fade-in">
      <div className="w-14 h-14 rounded-2xl bg-emerald-500/10 border border-emerald-500/25 flex items-center justify-center text-primary mb-3.5 shadow-xs">
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
          <polyline points="22 4 12 14.01 9 11.01" />
        </svg>
      </div>
      <h3 className="text-base font-bold text-fg mb-1.5 tracking-tight">Свободный день</h3>
      <p className="text-xs text-muted-fg max-w-xs leading-relaxed">
        На {weekday.toLowerCase()} нет запланированных учебных занятий. Время для самоподготовки или отдыха.
      </p>
      <span className="mt-3.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-muted border border-border/80 text-muted-fg">
        Занятий нет
      </span>
    </div>
  )
}

export function EmptySearchState({ query }: { query: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-14 px-6 text-center animate-fade-in">
      <div className="w-12 h-12 rounded-2xl bg-muted/80 border border-border/80 flex items-center justify-center text-muted-fg mb-3 shadow-xs">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
      </div>
      <h3 className="text-sm font-bold text-fg mb-1">Ничего не найдено</h3>
      <p className="text-xs text-muted-fg max-w-xs leading-relaxed">
        По запросу «{query}» ничего не нашлось. Попробуйте изменить формулировку.
      </p>
    </div>
  )
}

export function EmptyHomeworkState() {
  return (
    <div className="flex flex-col items-center justify-center py-12 px-6 text-center animate-fade-in">
      <div className="w-12 h-12 rounded-2xl bg-muted/80 border border-border/80 flex items-center justify-center text-muted-fg mb-3 shadow-xs">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
          <line x1="16" y1="13" x2="8" y2="13" />
          <line x1="16" y1="17" x2="8" y2="17" />
          <polyline points="10 9 9 9 8 9" />
        </svg>
      </div>
      <h3 className="text-sm font-bold text-fg mb-1">Заданий пока нет</h3>
      <p className="text-xs text-muted-fg max-w-xs leading-relaxed">
        Домашние задания появятся здесь, когда их добавит староста группы.
      </p>
    </div>
  )
}

export function PullIndicator({ pulling, progress }: { pulling: boolean; progress: number }) {
  if (!pulling && progress <= 0) return null
  return (
    <div
      className="flex items-center justify-center transition-all duration-150 overflow-hidden"
      style={{ height: `${Math.min(60, progress * 0.6)}px` }}
    >
      <div
        className="w-8 h-8 rounded-full bg-card border border-border/80 shadow-md flex items-center justify-center text-primary"
        style={{ transform: `rotate(${progress * 2.5}deg) scale(${Math.min(1, progress / 60)})` }}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.85.83 6.72 2.24" />
          <polyline points="21 3 21 9 15 9" />
        </svg>
      </div>
    </div>
  )
}
