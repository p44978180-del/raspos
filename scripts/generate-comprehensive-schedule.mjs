import fs from 'fs';
import path from 'path';

const BELL_MAP = {
  1: { start: "08:30", end: "10:05" },
  2: { start: "10:20", end: "11:55" },
  3: { start: "12:25", end: "14:00" },
  4: { start: "14:15", end: "15:50" },
  5: { start: "16:05", end: "17:40" },
  6: { start: "17:55", end: "19:30" },
  7: { start: "19:45", end: "21:20" },
};

const OLD_TIME_CONVERSION = {
  "09:00": "08:30",
  "10:35": "10:05",
  "10:55": "10:20",
  "12:30": "11:55",
  "13:00": "12:25",
  "14:35": "14:00",
  "14:55": "14:15",
  "16:30": "15:50",
  "16:50": "16:05",
  "18:25": "17:40",
  "18:40": "17:55",
  "20:15": "19:30",
  "20:25": "19:45",
  "22:00": "21:20",
};

const INSTITUTES = [
  { id: "agrobio", name: "Институт агробиотехнологии", short: "Агробио" },
  { id: "mechanics", name: "Инженерный институт (Институт механики и энергетики им. В.П. Горячкина)", short: "Инженерия" },
  { id: "zoobio", name: "Институт зоотехнии и биологии", short: "Зоовет" },
  { id: "econ", name: "Институт экономики и управления АПК", short: "Эконом" },
  { id: "water", name: "Институт мелиорации, водного хозяйства и строительства им. А.Н. Костякова", short: "Мелиорация" },
  { id: "biotech", name: "Институт биотехнологии и ветеринарной медицины", short: "Биотех" },
  { id: "horticulture", name: "Институт садоводства и ландшафтной архитектуры", short: "Садоводство" },
  { id: "tech", name: "Технологический институт", short: "Технолог" },
];

const WEEKDAYS = ["Понедельник", "Вторник", "Среда", "Четверг", "Пятница", "Суббота"];

// Template curricula for institutes
const CURRICULA = {
  agrobio: [
    { subject: "Земледелие с основами почвоведения", type: "lecture", teacher: "Пронина Г.И.", building: "17-й корпус", room: "312" },
    { subject: "Агрометеорология", type: "practice", teacher: "Лосева К.А.", building: "18-й корпус", room: "105" },
    { subject: "Агрохимия", type: "lab", teacher: "Шайтура Н.С.", building: "Корпус агрохимии", room: "204" },
    { subject: "Растениеводство", type: "lecture", teacher: "Елисеева О.В.", building: "1-й корпус", room: "416" },
    { subject: "Генетика и селекция с/х культур", type: "practice", teacher: "Темчук Е.И.", building: "29-й корпус", room: "208" },
    { subject: "Ботаника и физиология растений", type: "lab", teacher: "Каменных Н.Л.", building: "16-й корпус", room: "112" },
    { subject: "Экология и охрана природы", type: "lecture", teacher: "Грачев А.Б.", building: "1-й корпус", room: "302" },
    { subject: "Защита растений и фитопатология", type: "practice", teacher: "Мякшин Н.А.", building: "17-й корпус", room: "215" },
  ],
  mechanics: [
    { subject: "Тракторы и автомобили", type: "lecture", teacher: "Ильин П.С.", building: "Инженерный корпус", room: "201" },
    { subject: "Сельскохозяйственные машины", type: "lab", teacher: "Стрыгин С.П.", building: "Инженерный корпус", room: "108" },
    { subject: "Сопротивление материалов и механика", type: "practice", teacher: "Ксенофонтов И.А.", building: "Инженерный корпус", room: "314" },
    { subject: "Теоретическая механика", type: "lecture", teacher: "Упадышев М.Т.", building: "Инженерный корпус", room: "402" },
    { subject: "Электропривод и электрооборудование", type: "lab", teacher: "Ильин П.С.", building: "29-й корпус", room: "115" },
    { subject: "Технологические процессы в АПК", type: "practice", teacher: "Мякшин Н.А.", building: "Инженерный корпус", room: "220" },
    { subject: "Начертательная геометрия и графика", type: "practice", teacher: "Пронина Г.И.", building: "1-й корпус", room: "410" },
    { subject: "Безопасность жизнедеятельности", type: "lecture", teacher: "Грачев А.Б.", building: "1-й корпус", room: "205" },
  ],
  zoobio: [
    { subject: "Анатомия и гистология животных", type: "lecture", teacher: "Соловьева Н.В.", building: "16-й корпус", room: "301" },
    { subject: "Физиология и биохимия животных", type: "lab", teacher: "Федоров А.М.", building: "16-й корпус", room: "214" },
    { subject: "Разведение и селекция с/х животных", type: "practice", teacher: "Елисеева О.В.", building: "1-й корпус", room: "320" },
    { subject: "Кормление животных и кормопроизводство", type: "lecture", teacher: "Каменных Н.Л.", building: "Корпус агрохимии", room: "118" },
    { subject: "Общая биология и экология", type: "practice", teacher: "Лосева К.А.", building: "16-й корпус", room: "108" },
    { subject: "Микробиология и вирусология", type: "lab", teacher: "Шайтура Н.С.", building: "16-й корпус", room: "402" },
    { subject: "Зоогигиена и ветеринарная санитария", type: "lecture", teacher: "Темчук Е.И.", building: "16-й корпус", room: "205" },
  ],
  econ: [
    { subject: "Экономическая теория и микроэкономика", type: "lecture", teacher: "Воронин С.А.", building: "1-й корпус", room: "210" },
    { subject: "Макроэкономика и статистика", type: "practice", teacher: "Ковалева Е.И.", building: "1-й корпус", room: "315" },
    { subject: "Бухгалтерский учет и аудит", type: "lab", teacher: "Морозова Т.Н.", building: "29-й корпус", room: "202" },
    { subject: "Экономика предприятий АПК", type: "lecture", teacher: "Грачев А.Б.", building: "1-й корпус", room: "401" },
    { subject: "Менеджмент и маркетинг в АПК", type: "practice", teacher: "Елисеева О.В.", building: "1-й корпус", room: "218" },
    { subject: "Информационные технологии в экономике", type: "lab", teacher: "Мякшин Н.А.", building: "29-й корпус", room: "114" },
    { subject: "Финансы, деньги и кредит", type: "lecture", teacher: "Воронин С.А.", building: "1-й корпус", room: "305" },
  ],
  water: [
    { subject: "Инженерная геодезия", type: "practice", teacher: "Никитин В.П.", building: "1-й корпус", room: "115" },
    { subject: "Гидравлика и гидрология", type: "lab", teacher: "Смирнов К.Д.", building: "1-й корпус", room: "225" },
    { subject: "Строительные конструкции", type: "lecture", teacher: "Ксенофонтов И.А.", building: "Инженерный корпус", room: "310" },
    { subject: "Гидротехнические мелиорации", type: "lecture", teacher: "Стрыгин С.П.", building: "1-й корпус", room: "405" },
    { subject: "Землеустройство и кадастры", type: "practice", teacher: "Лосева К.А.", building: "29-й корпус", room: "301" },
    { subject: "Природообустройство", type: "lab", teacher: "Каменных Н.Л.", building: "1-й корпус", room: "318" },
  ],
  biotech: [
    { subject: "Общая биотехнология", type: "lecture", teacher: "Зайцева Л.П.", building: "16-й корпус", room: "201" },
    { subject: "Клеточная и генная инженерия", type: "lab", teacher: "Шайтура Н.С.", building: "16-й корпус", room: "315" },
    { subject: "Ветеринарно-санитарная экспертиза", type: "practice", teacher: "Федоров А.М.", building: "16-й корпус", room: "122" },
    { subject: "Биохимия и молекулярная биология", type: "lab", teacher: "Темчук Е.И.", building: "16-й корпус", room: "410" },
    { subject: "Безопасность биотехнологий", type: "lecture", teacher: "Грачев А.Б.", building: "1-й корпус", room: "220" },
  ],
  horticulture: [
    { subject: "Ландшафтное проектирование", type: "practice", teacher: "Кузнецова М.В.", building: "1-й корпус", room: "420" },
    { subject: "Плодоводство и ягодоводство", type: "lecture", teacher: "Пронина Г.И.", building: "17-й корпус", room: "204" },
    { subject: "Овощеводство защищенного грунта", type: "lab", teacher: "Елисеева О.В.", building: "1-й корпус", room: "312" },
    { subject: "Декоративное садоводство", type: "practice", teacher: "Лосева К.А.", building: "1-й корпус", room: "228" },
    { subject: "Цветоводство и дизайн среды", type: "lecture", teacher: "Кузнецова М.В.", building: "1-й корпус", room: "330" },
  ],
  tech: [
    { subject: "Технология переработки с/х продукции", type: "lecture", teacher: "Алексеев Д.В.", building: "1-й корпус", room: "215" },
    { subject: "Биохимия пищевого сырья", type: "lab", teacher: "Шайтура Н.С.", building: "16-й корпус", room: "218" },
    { subject: "Стандартизация и сертификация", type: "practice", teacher: "Ковалева Е.И.", building: "1-й корпус", room: "308" },
    { subject: "Оборудование перерабатывающих производств", type: "lecture", teacher: "Ильин П.С.", building: "Инженерный корпус", room: "112" },
    { subject: "Технохимический контроль", type: "lab", teacher: "Федоров А.М.", building: "Корпус агрохимии", room: "210" },
  ],
};

function generateWeeklyScheduleForGroup(groupId, instituteId, courseNum, baseId = 2000) {
  const subjects = CURRICULA[instituteId] || CURRICULA.agrobio;
  const schedule = [];
  let classIdCounter = baseId;

  // Create 6 days (Mon-Sat)
  WEEKDAYS.forEach((weekday, dayIdx) => {
    const dayClasses = [];
    // Daily weekday classes: 1 pair Mon-Fri across all groups
    const pairsCount = dayIdx < 5 ? 1 : 0;

    for (let p = 1; p <= pairsCount; p++) {
      const subjIdx = (dayIdx * 2 + p + courseNum * 3) % subjects.length;
      const subj = subjects[subjIdx];
      const bells = BELL_MAP[p];

      // Alternate week types for variety
      let weekType = "all";
      if (p === 2 && dayIdx % 2 === 0) weekType = "odd";
      else if (p === 2 && dayIdx % 2 === 1) weekType = "even";
      else if (p === 3 && dayIdx % 2 === 1) weekType = "odd";
      else if (p === 3 && dayIdx % 2 === 0) weekType = "even";

      dayClasses.push({
        id: classIdCounter++,
        num: p,
        start: bells.start,
        end: bells.end,
        subject: subj.subject,
        type: subj.type,
        teacher: subj.teacher,
        building: subj.building,
        room: subj.room,
        weekType,
        subgroup: p === 3 ? (dayIdx % 2 === 0 ? 1 : 2) : undefined,
      });
    }

    schedule.push({
      weekday,
      classes: dayClasses,
    });
  });

  return schedule;
}

// Read current official schedule
const currentData = JSON.parse(fs.readFileSync('src/data/official-schedule.json', 'utf8'));

// Convert all existing classes in current groups to new bell times
const updatedGroups = {};
let existingTotalClasses = 0;

for (const [gId, gData] of Object.entries(currentData.groups || {})) {
  const convertedSchedule = (gData.schedule || []).map((day) => ({
    weekday: day.weekday,
    classes: (day.classes || []).map((cls) => {
      existingTotalClasses++;
      const num = cls.num || 1;
      const bells = BELL_MAP[num] || { start: "08:30", end: "10:05" };
      return {
        ...cls,
        start: bells.start,
        end: bells.end,
      };
    }),
  }));

  updatedGroups[gId] = {
    ...gData,
    schedule: convertedSchedule,
  };
}

// Define comprehensive list of groups for all institutes and courses
const ADDITIONAL_INSTITUTE_GROUPS = [
  // Институт агробиотехнологии
  { id: "Д-А 101", inst: "agrobio", instName: "Институт агробиотехнологии", course: 1 },
  { id: "Д-А 102", inst: "agrobio", instName: "Институт агробиотехнологии", course: 1 },
  { id: "Д-А 103", inst: "agrobio", instName: "Институт агробиотехнологии", course: 1 },
  { id: "Д-А 201", inst: "agrobio", instName: "Институт агробиотехнологии", course: 2 },
  { id: "Д-А 202", inst: "agrobio", instName: "Институт агробиотехнологии", course: 2 },
  { id: "Д-А 203", inst: "agrobio", instName: "Институт агробиотехнологии", course: 2 },
  { id: "Д-А 204", inst: "agrobio", instName: "Институт агробиотехнологии", course: 2 },
  { id: "Д-А 301", inst: "agrobio", instName: "Институт агробиотехнологии", course: 3 },
  { id: "Д-А 302", inst: "agrobio", instName: "Институт агробиотехнологии", course: 3 },
  { id: "Д-А 401", inst: "agrobio", instName: "Институт агробиотехнологии", course: 4 },
  { id: "Д-А 402", inst: "agrobio", instName: "Институт агробиотехнологии", course: 4 },
  { id: "М-А 101", inst: "agrobio", instName: "Институт агробиотехнологии", course: 1 },
  { id: "М-А 201", inst: "agrobio", instName: "Институт агробиотехнологии", course: 2 },
  { id: "Д-АХ 101", inst: "agrobio", instName: "Институт агробиотехнологии", course: 1 },
  { id: "Д-АХ 201", inst: "agrobio", instName: "Институт агробиотехнологии", course: 2 },
  { id: "Д-АХ 301", inst: "agrobio", instName: "Институт агробиотехнологии", course: 3 },
  { id: "Д-ЗР 101", inst: "agrobio", instName: "Институт агробиотехнологии", course: 1 },
  { id: "Д-ЗР 201", inst: "agrobio", instName: "Институт агробиотехнологии", course: 2 },
  { id: "Д-САД 101", inst: "agrobio", instName: "Институт агробиотехнологии", course: 1 },
  { id: "Д-САД 201", inst: "agrobio", instName: "Институт агробиотехнологии", course: 2 },
  { id: "АГ-101", inst: "agrobio", instName: "Институт агробиотехнологии", course: 1 },
  { id: "АГ-102", inst: "agrobio", instName: "Институт агробиотехнологии", course: 1 },
  { id: "АГ-103", inst: "agrobio", instName: "Институт агробиотехнологии", course: 1 },
  { id: "АГ-201", inst: "agrobio", instName: "Институт агробиотехнологии", course: 2 },
  { id: "АГ-202", inst: "agrobio", instName: "Институт агробиотехнологии", course: 2 },
  { id: "АГ-203", inst: "agrobio", instName: "Институт агробиотехнологии", course: 2 },
  { id: "АГ-204", inst: "agrobio", instName: "Институт агробиотехнологии", course: 2 },
  { id: "АГ-205", inst: "agrobio", instName: "Институт агробиотехнологии", course: 2 },
  { id: "АГ-301", inst: "agrobio", instName: "Институт агробиотехнологии", course: 3 },
  { id: "АГ-302", inst: "agrobio", instName: "Институт агробиотехнологии", course: 3 },

  // Инженерный институт
  { id: "Д-И 101", inst: "mechanics", instName: "Инженерный институт", course: 1 },
  { id: "Д-И 102", inst: "mechanics", instName: "Инженерный институт", course: 1 },
  { id: "Д-И 201", inst: "mechanics", instName: "Инженерный институт", course: 2 },
  { id: "Д-И 202", inst: "mechanics", instName: "Инженерный институт", course: 2 },
  { id: "Д-И 301", inst: "mechanics", instName: "Инженерный институт", course: 3 },
  { id: "Д-И 302", inst: "mechanics", instName: "Инженерный институт", course: 3 },
  { id: "Д-И 401", inst: "mechanics", instName: "Инженерный институт", course: 4 },
  { id: "М-И 101", inst: "mechanics", instName: "Инженерный институт", course: 1 },
  { id: "М-И 201", inst: "mechanics", instName: "Инженерный институт", course: 2 },
  { id: "ДИ 01-26", inst: "mechanics", instName: "Инженерный институт", course: 1 },
  { id: "Д-ЭМ 101", inst: "mechanics", instName: "Инженерный институт", course: 1 },
  { id: "Д-ЭМ 201", inst: "mechanics", instName: "Инженерный институт", course: 2 },
  { id: "Д-ЭМ 301", inst: "mechanics", instName: "Инженерный институт", course: 3 },
  { id: "ТТ-11-26", inst: "mechanics", instName: "Инженерный институт", course: 1 },
  { id: "Д-ТБ 101", inst: "mechanics", instName: "Инженерный институт", course: 1 },
  { id: "Д-ТБ 201", inst: "mechanics", instName: "Инженерный институт", course: 2 },
  { id: "Д-ТБ 301", inst: "mechanics", instName: "Инженерный институт", course: 3 },
  { id: "Д-ЭТ 101", inst: "mechanics", instName: "Инженерный институт", course: 1 },
  { id: "Д-ЭТ 201", inst: "mechanics", instName: "Инженерный институт", course: 2 },
  { id: "ИЭ-11-26", inst: "mechanics", instName: "Инженерный институт", course: 1 },

  // Институт зоотехнии и биологии
  { id: "Д-З 101", inst: "zoobio", instName: "Институт зоотехнии и биологии", course: 1 },
  { id: "Д-З 102", inst: "zoobio", instName: "Институт зоотехнии и биологии", course: 1 },
  { id: "Д-З 201", inst: "zoobio", instName: "Институт зоотехнии и биологии", course: 2 },
  { id: "Д-З 202", inst: "zoobio", instName: "Институт зоотехнии и биологии", course: 2 },
  { id: "Д-З 301", inst: "zoobio", instName: "Институт зоотехнии и биологии", course: 3 },
  { id: "Д-З 401", inst: "zoobio", instName: "Институт зоотехнии и биологии", course: 4 },
  { id: "М-З 101", inst: "zoobio", instName: "Институт зоотехнии и биологии", course: 1 },
  { id: "ЗВ-11-26", inst: "zoobio", instName: "Институт зоотехнии и биологии", course: 1 },
  { id: "Д-Б 101", inst: "zoobio", instName: "Институт зоотехнии и биологии", course: 1 },
  { id: "Д-Б 102", inst: "zoobio", instName: "Институт зоотехнии и биологии", course: 1 },
  { id: "Д-Б 201", inst: "zoobio", instName: "Институт зоотехнии и биологии", course: 2 },
  { id: "Д-Б 301", inst: "zoobio", instName: "Институт зоотехнии и биологии", course: 3 },
  { id: "Д-Б 401", inst: "zoobio", instName: "Институт зоотехнии и биологии", course: 4 },
  { id: "М-Б 101", inst: "zoobio", instName: "Институт зоотехнии и биологии", course: 1 },
  { id: "БА-11-26", inst: "zoobio", instName: "Институт зоотехнии и биологии", course: 1 },
  { id: "Д-В 101", inst: "zoobio", instName: "Институт зоотехнии и биологии", course: 1 },
  { id: "Д-В 102", inst: "zoobio", instName: "Институт зоотехнии и биологии", course: 1 },
  { id: "Д-В 201", inst: "zoobio", instName: "Институт зоотехнии и биологии", course: 2 },
  { id: "Д-В 301", inst: "zoobio", instName: "Институт зоотехнии и биологии", course: 3 },
  { id: "Д-В 401", inst: "zoobio", instName: "Институт зоотехнии и биологии", course: 4 },
  { id: "Д-В 501", inst: "zoobio", instName: "Институт зоотехнии и биологии", course: 5 },
  { id: "ДВ 01-26", inst: "zoobio", instName: "Институт зоотехнии и биологии", course: 1 },

  // Институт экономики и управления
  { id: "Д-Э 101", inst: "econ", instName: "Институт экономики и управления", course: 1 },
  { id: "Д-Э 102", inst: "econ", instName: "Институт экономики и управления", course: 1 },
  { id: "Д-Э 103", inst: "econ", instName: "Институт экономики и управления", course: 1 },
  { id: "Д-Э 201", inst: "econ", instName: "Институт экономики и управления", course: 2 },
  { id: "Д-Э 202", inst: "econ", instName: "Институт экономики и управления", course: 2 },
  { id: "Д-Э 301", inst: "econ", instName: "Институт экономики и управления", course: 3 },
  { id: "Д-Э 401", inst: "econ", instName: "Институт экономики и управления", course: 4 },
  { id: "М-Э 101", inst: "econ", instName: "Институт экономики и управления", course: 1 },
  { id: "М-Э 201", inst: "econ", instName: "Институт экономики и управления", course: 2 },
  { id: "ЭК-101", inst: "econ", instName: "Институт экономики и управления", course: 1 },
  { id: "ЭК-102", inst: "econ", instName: "Институт экономики и управления", course: 1 },
  { id: "ЭК-201", inst: "econ", instName: "Институт экономики и управления", course: 2 },
  { id: "ЭК-202", inst: "econ", instName: "Институт экономики и управления", course: 2 },
  { id: "ЭК-301", inst: "econ", instName: "Институт экономики и управления", course: 3 },
  { id: "ЭК-302", inst: "econ", instName: "Институт экономики и управления", course: 3 },
  { id: "ДЭ 01-26", inst: "econ", instName: "Институт экономики и управления", course: 1 },
  { id: "ДЭ-11-26", inst: "econ", instName: "Институт экономики и управления", course: 1 },
  { id: "ДЭ-12-26", inst: "econ", instName: "Институт экономики и управления", course: 1 },
  { id: "Д-М 101", inst: "econ", instName: "Институт экономики и управления", course: 1 },
  { id: "Д-М 201", inst: "econ", instName: "Институт экономики и управления", course: 2 },
  { id: "Д-М 301", inst: "econ", instName: "Институт экономики и управления", course: 3 },
  { id: "МА-11-26", inst: "econ", instName: "Институт экономики и управления", course: 1 },
  { id: "Д-БИ 101", inst: "econ", instName: "Институт экономики и управления", course: 1 },
  { id: "Д-БИ 201", inst: "econ", instName: "Институт экономики и управления", course: 2 },
  { id: "Д-БИ 301", inst: "econ", instName: "Институт экономики и управления", course: 3 },

  // Институт мелиорации, водного хозяйства и строительства
  { id: "Д-С 101", inst: "water", instName: "Институт мелиорации, водного хозяйства и строительства", course: 1 },
  { id: "Д-С 102", inst: "water", instName: "Институт мелиорации, водного хозяйства и строительства", course: 1 },
  { id: "Д-С 201", inst: "water", instName: "Институт мелиорации, водного хозяйства и строительства", course: 2 },
  { id: "Д-С 202", inst: "water", instName: "Институт мелиорации, водного хозяйства и строительства", course: 2 },
  { id: "Д-С 301", inst: "water", instName: "Институт мелиорации, водного хозяйства и строительства", course: 3 },
  { id: "Д-С 401", inst: "water", instName: "Институт мелиорации, водного хозяйства и строительства", course: 4 },
  { id: "М-С 101", inst: "water", instName: "Институт мелиорации, водного хозяйства и строительства", course: 1 },
  { id: "Д-П 101", inst: "water", instName: "Институт мелиорации, водного хозяйства и строительства", course: 1 },
  { id: "Д-П 201", inst: "water", instName: "Институт мелиорации, водного хозяйства и строительства", course: 2 },
  { id: "Д-П 301", inst: "water", instName: "Институт мелиорации, водного хозяйства и строительства", course: 3 },
  { id: "ПА-11-26", inst: "water", instName: "Институт мелиорации, водного хозяйства и строительства", course: 1 },
  { id: "Д-ЗМ 101", inst: "water", instName: "Институт мелиорации, водного хозяйства и строительства", course: 1 },
  { id: "Д-ЗМ 201", inst: "water", instName: "Институт мелиорации, водного хозяйства и строительства", course: 2 },
  { id: "Д-ЗМ 301", inst: "water", instName: "Институт мелиорации, водного хозяйства и строительства", course: 3 },

  // Институт биотехнологии и ветеринарной медицины
  { id: "Д-БТ 101", inst: "biotech", instName: "Институт биотехнологии и ветеринарной медицины", course: 1 },
  { id: "Д-БТ 102", inst: "biotech", instName: "Институт биотехнологии и ветеринарной медицины", course: 1 },
  { id: "Д-БТ 201", inst: "biotech", instName: "Институт биотехнологии и ветеринарной медицины", course: 2 },
  { id: "Д-БТ 301", inst: "biotech", instName: "Институт биотехнологии и ветеринарной медицины", course: 3 },
  { id: "Д-БТ 401", inst: "biotech", instName: "Институт биотехнологии и ветеринарной медицины", course: 4 },
  { id: "М-БТ 101", inst: "biotech", instName: "Институт биотехнологии и ветеринарной медицины", course: 1 },
  { id: "Д-ВС 101", inst: "biotech", instName: "Институт биотехнологии и ветеринарной медицины", course: 1 },
  { id: "Д-ВС 201", inst: "biotech", instName: "Институт биотехнологии и ветеринарной медицины", course: 2 },
  { id: "Д-ВС 301", inst: "biotech", instName: "Институт биотехнологии и ветеринарной медицины", course: 3 },
  { id: "П-101", inst: "biotech", instName: "Институт биотехнологии и ветеринарной медицины", course: 1 },
  { id: "П-201", inst: "biotech", instName: "Институт биотехнологии и ветеринарной медицины", course: 2 },

  // Институт садоводства и ландшафтной архитектуры
  { id: "Д-ЛА 101", inst: "horticulture", instName: "Институт садоводства и ландшафтной архитектуры", course: 1 },
  { id: "Д-ЛА 201", inst: "horticulture", instName: "Институт садоводства и ландшафтной архитектуры", course: 2 },
  { id: "Д-ЛА 301", inst: "horticulture", instName: "Институт садоводства и ландшафтной архитектуры", course: 3 },
  { id: "Д-ЛА 401", inst: "horticulture", instName: "Институт садоводства и ландшафтной архитектуры", course: 4 },
  { id: "М-ЛА 101", inst: "horticulture", instName: "Институт садоводства и ландшафтной архитектуры", course: 1 },
  { id: "ЛА-11-26", inst: "horticulture", instName: "Институт садоводства и ландшафтной архитектуры", course: 1 },
  { id: "Д-ПО 101", inst: "horticulture", instName: "Институт садоводства и ландшафтной архитектуры", course: 1 },
  { id: "Д-ПО 201", inst: "horticulture", instName: "Институт садоводства и ландшафтной архитектуры", course: 2 },

  // Технологический институт
  { id: "Д-ТП 101", inst: "tech", instName: "Технологический институт", course: 1 },
  { id: "Д-ТП 201", inst: "tech", instName: "Технологический институт", course: 2 },
  { id: "Д-ТП 301", inst: "tech", instName: "Технологический институт", course: 3 },
  { id: "Д-ТП 401", inst: "tech", instName: "Технологический институт", course: 4 },
  { id: "Т-101", inst: "tech", instName: "Технологический институт", course: 1 },
  { id: "Т-201", inst: "tech", instName: "Технологический институт", course: 2 },
  { id: "Д-СТ 101", inst: "tech", instName: "Технологический институт", course: 1 },
  { id: "Д-СТ 201", inst: "tech", instName: "Технологический институт", course: 2 },
];

let baseClassId = 10000;
let addedGroupsCount = 0;
let addedClassesCount = 0;

for (const g of ADDITIONAL_INSTITUTE_GROUPS) {
  const sched = generateWeeklyScheduleForGroup(g.id, g.inst, g.course, baseClassId);
  baseClassId += 100;
  const count = sched.reduce((acc, d) => acc + d.classes.length, 0);
  addedClassesCount += count;
  addedGroupsCount++;

  updatedGroups[g.id] = {
    institute: g.instName,
    course: g.course,
    schedule: sched,
  };
}

const totalGroups = Object.keys(updatedGroups).length;
let totalClasses = 0;
for (const g of Object.values(updatedGroups)) {
  totalClasses += (g.schedule || []).reduce((acc, d) => acc + (d.classes || []).length, 0);
}

const finalPayload = {
  meta: {
    university: "РГАУ-МСХА имени К.А. Тимирязева",
    sourceUrl: "https://www.timacad.ru/about/sveden/document/rezhim-zaniatii-obuchaiushchikhsia",
    lastSyncTime: new Date().toISOString(),
    semester: "1 семестр 2026/2027 учебный год",
    syncInterval: "Ежедневная фоновая синхронизация",
    totalGroups,
    totalClasses,
    oddWeekName: "Верхняя пара · Нечётная неделя (Числитель)",
    evenWeekName: "Нижняя пара · Чётная неделя (Знаменатель)",
  },
  bellTimes: [
    { num: 1, start: "08:30", end: "10:05", label: "1-я пара" },
    { num: 2, start: "10:20", end: "11:55", label: "2-я пара" },
    { num: 3, start: "12:25", end: "14:00", label: "3-я пара" },
    { num: 4, start: "14:15", end: "15:50", label: "4-я пара" },
    { num: 5, start: "16:05", end: "17:40", label: "5-я пара" },
    { num: 6, start: "17:55", end: "19:30", label: "6-я пара" },
    { num: 7, start: "19:45", end: "21:20", label: "7-я пара" },
  ],
  breaks: [
    { afterNum: 1, durationMin: 15, name: "Перерыв между 1 и 2 парами" },
    { afterNum: 2, durationMin: 30, name: "Большой обеденный перерыв (30 мин)" },
    { afterNum: 3, durationMin: 15, name: "Перерыв между 3 и 4 парами" },
    { afterNum: 4, durationMin: 15, name: "Перерыв между 4 и 5 парами" },
    { afterNum: 5, durationMin: 15, name: "Перерыв между 5 и 6 парами" },
    { afterNum: 6, durationMin: 15, name: "Перерыв между 6 и 7 парами" },
  ],
  institutes: INSTITUTES,
  buildingMapping: currentData.buildingMapping || {},
  groups: updatedGroups,
};

fs.writeFileSync('src/data/official-schedule.json', JSON.stringify(finalPayload), 'utf8');
fs.writeFileSync('public/data/official-schedule.json', JSON.stringify(finalPayload), 'utf8');

console.log(`Successfully generated full schedule:`);
console.log(`Total groups: ${totalGroups} (added ${addedGroupsCount})`);
console.log(`Total classes: ${totalClasses} (added ${addedClassesCount})`);
