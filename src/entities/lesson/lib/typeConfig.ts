export const TYPE_CFG = {
  lecture: {
    label: "Лекция",
    bar: "bg-primary",
    chip: "bg-primary/10 text-primary border border-primary/25",
  },
  practice: {
    label: "Практика",
    bar: "bg-amber-500",
    chip: "bg-amber-bg text-amber border border-amber/25",
  },
  lab: {
    label: "Лабораторная",
    bar: "bg-blue-500",
    chip: "bg-blue-bg text-blue border border-blue/25",
  },
  elective: {
    label: "Факультатив",
    bar: "bg-purple-500",
    chip: "bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/25",
  },
} as const
