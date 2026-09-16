import React from "react"
import { Sheet } from "@/shared/ui/Sheet"

export function RestSheet({ onClose }: { onClose: () => void }) {
  const spots = [
    {
      name: "Читальный зал №1",
      where: "УК-1, 2-й этаж",
      note: "Тихо, есть розетки",
    },
    {
      name: "Библиотека РГАУ-МСХА",
      where: "УК-1, 1-й этаж",
      note: "Открыта до 18:00",
    },
    { name: "Холл агрохимии", where: "Агрохим, вход", note: "Диваны, Wi-Fi" },
    {
      name: "Беседки у главного корпуса",
      where: "Территория кампуса",
      note: "В хорошую погоду",
    },
  ]
  return (
    <Sheet onClose={onClose} title="Где переждать">
      <div className="px-4 pb-8 space-y-2">
        {spots.map((s) => (
          <div key={s.name} className="bg-muted rounded-xl px-4 py-3">
            <p className="text-sm font-bold text-fg">{s.name}</p>
            <p className="text-xs text-muted-fg mt-0.5">{s.where}</p>
            <p className="text-xs text-accent mt-0.5">{s.note}</p>
          </div>
        ))}
      </div>
    </Sheet>
  )
}
