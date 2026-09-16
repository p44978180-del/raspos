export const BIDS: Record<string, string> = {
  "1-й учебный корпус": "corp1",
  "2-й учебный корпус": "corp2",
  "3-й учебный корпус": "corp3",
  "4-й учебный корпус": "corp4",
  "Корпус агрохимии": "agrochem",
  "Корпус агрохимии (6-й)": "agrochem",
  "8-й учебный корпус": "corp8",
  "9-й учебный корпус": "corp9",
  "12-й учебный корпус": "corp12",
  "Биологический корпус (16-й)": "bio16",
  "Биологический корпус": "bio16",
  "17-й корпус (Почвенно-агрономический)": "soil17",
  "18-й корпус (Метеорологический)": "meteo18",
  "26-й учебный корпус": "corp26",
  "27-й корпус (Лингвистический центр)": "ling27",
  "Инженерный корпус (28-й)": "engineering",
  "Инженерный корпус": "engineering",
  "28-й учебный корпус (Инженерный)": "engineering",
  "29-й корпус (Цифровой центр)": "digital29",
  "29-й учебный корпус (Цифровой центр)": "digital29",
  "37-й корпус (Биотехнология)": "biotech37",
  "Центральная научная библиотека": "lib",
  "Центральная научная библиотека (ЦНБ)": "lib",
  "ЦНБ": "lib",
  "Студенческий городок (Общежития)": "dorms",
  "Студенческий городок": "dorms",
  "Общежития": "dorms",
  "Спортивный комплекс": "sport",
  "Спортивный комплекс (СОК РГАУ)": "sport",
  "СК": "sport",
  "Учебно-опытная станция": "station",
}

export const BGEN: Record<string, string> = {
  "1-й учебный корпус": "1-го учебного корпуса",
  "2-й учебный корпус": "2-го учебного корпуса",
  "3-й учебный корпус": "3-го учебного корпуса",
  "4-й учебный корпус": "4-го учебного корпуса",
  "Корпус агрохимии": "корпуса агрохимии",
  "Корпус агрохимии (6-й)": "корпуса агрохимии (6-го)",
  "8-й учебный корпус": "8-го учебного корпуса",
  "9-й учебный корпус": "9-го учебного корпуса",
  "12-й учебный корпус": "12-го учебного корпуса",
  "Биологический корпус (16-й)": "биологического корпуса (16-го)",
  "Биологический корпус": "биологического корпуса",
  "17-й корпус (Почвенно-агрономический)": "17-го почвенного корпуса",
  "18-й корпус (Метеорологический)": "18-го метеорологического корпуса",
  "26-й учебный корпус": "26-го учебного корпуса",
  "27-й корпус (Лингвистический центр)": "27-го лингвистического корпуса",
  "Инженерный корпус (28-й)": "инженерного корпуса (28-го)",
  "Инженерный корпус": "инженерного корпуса",
  "28-й учебный корпус (Инженерный)": "инженерного корпуса (28-го)",
  "29-й корпус (Цифровой центр)": "29-го цифрового корпуса",
  "29-й учебный корпус (Цифровой центр)": "29-го цифрового корпуса",
  "37-й корпус (Биотехнология)": "37-го корпуса биотехнологии",
  "Центральная научная библиотека (ЦНБ)": "Центральной научной библиотеки (ЦНБ)",
  "ЦНБ": "ЦНБ",
  "Студенческий городок (Общежития)": "студгородка",
  "Студенческий городок": "студгородка",
  "Общежития": "студгородка",
  "Спортивный комплекс": "спортивного комплекса",
  "Спортивный комплекс (СОК РГАУ)": "спортивного комплекса",
  "СК": "спортивного комплекса",
  "Учебно-опытная станция": "учебно-опытной станции",
}

export function getBldgGenitive(name: string): string {
  if (!name) return ""
  if (BGEN[name]) return BGEN[name]
  for (const [k, v] of Object.entries(BGEN)) {
    if (name.includes(k) || k.includes(name)) return v
  }
  if (/агрохим|6-й/i.test(name)) return "корпуса агрохимии (6-го)"
  if (/16-й|биолог/i.test(name)) return "биологического корпуса (16-го)"
  if (/17-й|почв/i.test(name)) return "17-го почвенного корпуса"
  if (/18-й|метео/i.test(name)) return "18-го метеорологического корпуса"
  if (/26-й/i.test(name)) return "26-го учебного корпуса"
  if (/27-й|лингв/i.test(name)) return "27-го лингвистического корпуса"
  if (/28-й|инженер/i.test(name)) return "инженерного корпуса (28-го)"
  if (/29-й|цифр/i.test(name)) return "29-го цифрового корпуса"
  if (/37-й|биотех/i.test(name)) return "37-го корпуса биотехнологии"
  if (/8-й/i.test(name)) return "8-го учебного корпуса"
  if (/цнб|библиотек/i.test(name)) return "Центральной научной библиотеки"
  if (/общежит|студгород/i.test(name)) return "студгородка"
  if (/спорт|СК/i.test(name)) return "спортивного комплекса"
  if (/станци|опытн/i.test(name)) return "учебно-опытной станции"
  return name
}

export function normalizeBldg(name: string): string {
  if (!name) return ""
  if (BIDS[name]) return BIDS[name]
  for (const [k, v] of Object.entries(BIDS)) {
    if (name.includes(k) || k.includes(name)) return v
  }
  if (/агрохим|6-й/i.test(name)) return "agrochem"
  if (/16-й|биолог/i.test(name)) return "bio16"
  if (/17-й|почв/i.test(name)) return "soil17"
  if (/18-й|метео/i.test(name)) return "meteo18"
  if (/26-й/i.test(name)) return "corp26"
  if (/27-й|лингв/i.test(name)) return "ling27"
  if (/28-й|инженер/i.test(name)) return "engineering"
  if (/29-й|цифр/i.test(name)) return "digital29"
  if (/37-й|биотех/i.test(name)) return "biotech37"
  if (/8-й/i.test(name)) return "corp8"
  if (/цнб|библиотек/i.test(name)) return "lib"
  if (/общежит|студгород/i.test(name)) return "dorms"
  if (/спорт|СК/i.test(name)) return "sport"
  if (/станци|опытн/i.test(name)) return "station"
  return "corp1"
}

export function cleanRoomNumber(building?: string, room?: string): string {
  let rm = (room || "").trim()
  if (!rm || rm === "—" || rm === "-") return "—"
  if (rm.toUpperCase() === "СК") return "СК"
  const bldg = (building || "").trim()
  const bldgNumMatch = bldg.match(/\d+/)
  if (bldgNumMatch) {
    const bNum = bldgNumMatch[0]
    const prefixRe = new RegExp(`^0?${bNum}\\s*-\\s*`, "i")
    if (prefixRe.test(rm)) {
      rm = rm.replace(prefixRe, "").trim()
    }
  }
  return rm
}

export function formatLocationDisplay(building?: string, room?: string): string {
  const bldg = (building || "").trim()
  const rm = cleanRoomNumber(bldg, room)

  if (!bldg || bldg === "Корпус уточняется") {
    if (rm && rm !== "—" && rm !== "-") {
      return `Ауд. ${rm}`
    }
    return "Корпус и ауд. уточняются"
  }

  if (bldg === "Спорткомплекс" || rm.toUpperCase() === "СК") {
    return "Спорткомплекс (СК)"
  }

  if (!rm || rm === "—" || rm === "-") {
    return bldg
  }

  return `${bldg}, ауд. ${rm}`
}
