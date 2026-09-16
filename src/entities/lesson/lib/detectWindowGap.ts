import type { ClassItem, WindowGap } from "../model/types"

function parseTimeToMinutes(t: string): number {
  if (!t || !t.includes(":")) return 0
  const [h, m] = t.split(":").map(Number)
  return (h || 0) * 60 + (m || 0)
}

export function detectWindowGap(
  prevClass: ClassItem,
  currentClass: ClassItem,
): WindowGap | null {
  const slotDiff = currentClass.num - prevClass.num
  const prevEndMin = parseTimeToMinutes(prevClass.end)
  const curStartMin = parseTimeToMinutes(currentClass.start)
  const gapMinutes = curStartMin - prevEndMin

  // Window is recognized if slot numbers skip (e.g. 1 and 3) or gap is >= 35 minutes
  if (slotDiff > 1 || gapMinutes >= 35) {
    const hours = Math.floor(gapMinutes / 60)
    const mins = gapMinutes % 60

    let durationFormatted = ""
    if (hours > 0) {
      durationFormatted = `${hours} ч. ${mins > 0 ? `${mins} мин.` : "00 мин."}`
    } else {
      durationFormatted = `${mins} мин.`
    }

    return {
      startSlot: prevClass.num,
      endSlot: currentClass.num,
      startTime: prevClass.end,
      endTime: currentClass.start,
      durationMinutes: gapMinutes,
      durationFormatted,
    }
  }

  return null
}
