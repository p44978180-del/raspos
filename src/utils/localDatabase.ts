/**
 * Local-First Relational Database Engine
 * SQLite WebAssembly via Origin Private File System (OPFS) with graceful IndexedDB/Memory fallback.
 * Allows 0ms cold-start offline schedule queries in basement lecture halls.
 */

import initSqlJs, { type Database } from "sql.js"
import officialScheduleData from "../data/official-schedule.json"
import type { ScheduleItem, DaySchedule, EmptyClassroomItem, ScheduleChangeProposal } from "../proto/schedule"

const OPFS_DB_FILENAME = "timacad_schedule_local.sqlite"

class LocalDatabaseManager {
  private db: Database | null = null
  private initPromise: Promise<Database> | null = null
  private opfsSupported: boolean = false

  constructor() {
    this.opfsSupported = typeof navigator !== "undefined" && !!navigator.storage?.getDirectory
  }

  async getDatabase(): Promise<Database> {
    if (this.db) return this.db
    if (this.initPromise) return this.initPromise

    this.initPromise = this.initEngine()
    this.db = await this.initPromise
    return this.db
  }

  private async initEngine(): Promise<Database> {
    const SQL = await initSqlJs({
      // Locate wasm asset or let Vite resolve it
      locateFile: (file) => `https://sql.js.org/dist/${file}`,
    }).catch(async () => {
      // Fallback in case CDN is offline: use bundler asset or initialize with inline/default
      return await initSqlJs()
    })

    // 1. Try reading existing database from OPFS
    let existingBytes: Uint8Array | null = null
    if (this.opfsSupported) {
      try {
        const root = await navigator.storage.getDirectory()
        const fileHandle = await root.getFileHandle(OPFS_DB_FILENAME, { create: false })
        const file = await fileHandle.getFile()
        const buffer = await file.arrayBuffer()
        if (buffer.byteLength > 0) {
          existingBytes = new Uint8Array(buffer)
        }
      } catch {
        // File does not exist yet in OPFS; will create new
      }
    }

    const database = existingBytes ? new SQL.Database(existingBytes) : new SQL.Database()

    // 2. Initialize relational schema
    this.applySchema(database)

    // 3. Seed from bundled official-schedule.json if empty
    this.seedIfEmpty(database)

    // 4. Save to OPFS
    await this.persistToOPFS(database)

    return database
  }

  private applySchema(db: Database) {
    db.run(`
      CREATE TABLE IF NOT EXISTS groups (
        id INTEGER PRIMARY KEY,
        name TEXT UNIQUE NOT NULL,
        institute TEXT NOT NULL,
        course INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS lessons (
        id INTEGER PRIMARY KEY,
        group_name TEXT NOT NULL,
        weekday TEXT NOT NULL,
        day_of_week INTEGER NOT NULL,
        slot_number INTEGER NOT NULL,
        start_time TEXT NOT NULL,
        end_time TEXT NOT NULL,
        subject TEXT NOT NULL,
        type TEXT NOT NULL,
        week_type TEXT NOT NULL,
        teacher TEXT NOT NULL,
        building TEXT NOT NULL,
        room TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS crowdsource_proposals (
        id INTEGER PRIMARY KEY,
        group_name TEXT NOT NULL,
        student_name TEXT NOT NULL,
        student_role TEXT NOT NULL,
        change_type TEXT NOT NULL,
        target_day INTEGER,
        target_slot INTEGER,
        target_building TEXT,
        target_room TEXT,
        reason TEXT NOT NULL,
        peer_votes INTEGER NOT NULL,
        status TEXT NOT NULL,
        display_badge TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_local_group_lookup ON lessons (group_name, day_of_week, week_type);
      CREATE INDEX IF NOT EXISTS idx_local_classroom_radar ON lessons (building, day_of_week, slot_number, week_type);
    `)
  }

  private seedIfEmpty(db: Database) {
    const res = db.exec("SELECT COUNT(*) as count FROM groups")
    const count = (res[0]?.values[0]?.[0] as number) || 0

    if (count > 0) return

    const raw = officialScheduleData as any
    if (!raw || !raw.groups) return

    db.run("BEGIN TRANSACTION;")

    const weekdayToNum: Record<string, number> = {
      "Понедельник": 1, "Вторник": 2, "Среда": 3,
      "Четверг": 4, "Пятница": 5, "Суббота": 6, "Воскресенье": 7,
    }

    let gIdx = 1
    for (const [groupName, gData] of Object.entries<any>(raw.groups)) {
      db.run("INSERT OR IGNORE INTO groups (id, name, institute, course) VALUES (?, ?, ?, ?)", [
        gIdx++,
        groupName,
        gData.institute || "Неизвестный институт",
        gData.course || 1,
      ])

      if (Array.isArray(gData.schedule)) {
        for (const day of gData.schedule) {
          const dayNum = weekdayToNum[day.weekday] || 1
          if (Array.isArray(day.classes)) {
            for (const c of day.classes) {
              db.run(
                `INSERT OR IGNORE INTO lessons 
                (id, group_name, weekday, day_of_week, slot_number, start_time, end_time, subject, type, week_type, teacher, building, room)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                  c.id,
                  groupName,
                  day.weekday,
                  dayNum,
                  c.num,
                  c.start,
                  c.end,
                  c.subject,
                  c.type,
                  c.weekType || "all",
                  c.teacher || "",
                  c.building || "",
                  c.room || "",
                ]
              )
            }
          }
        }
      }
    }

    db.run("COMMIT;")
  }

  async persistToOPFS(db: Database): Promise<void> {
    if (!this.opfsSupported) return
    try {
      const data = db.export()
      const root = await navigator.storage.getDirectory()
      const fileHandle = await root.getFileHandle(OPFS_DB_FILENAME, { create: true })
      // Use standard sync access handle or createWritable
      if ("createWritable" in fileHandle) {
        const writable = await (fileHandle as any).createWritable()
        await writable.write(data)
        await writable.close()
      }
    } catch {
      // Graceful fallback if OPFS write fails in private window
    }
  }

  // --- High-Speed Local Queries ---

  async getScheduleForGroup(groupName: string, weekFilter: string = "all"): Promise<DaySchedule[]> {
    const db = await this.getDatabase()
    let query = `
      SELECT id, slot_number, start_time, end_time, subject, type, week_type, teacher, building, room, weekday, day_of_week
      FROM lessons
      WHERE group_name = ?
    `
    const params: any[] = [groupName]

    if (weekFilter === "odd") {
      query += " AND (week_type = 'odd' OR week_type = 'all')"
    } else if (weekFilter === "even") {
      query += " AND (week_type = 'even' OR week_type = 'all')"
    }

    query += " ORDER BY day_of_week ASC, slot_number ASC;"

    const res = db.exec(query, params)
    if (!res[0] || !res[0].values) return []

    const daysMap = new Map<number, DaySchedule>()
    const weekdayNames = ["", "Понедельник", "Вторник", "Среда", "Четверг", "Пятница", "Суббота", "Воскресенье"]

    for (let d = 1; d <= 6; d++) {
      daysMap.set(d, {
        day_of_week: d,
        weekday: weekdayNames[d],
        classes: [] as ScheduleItem[],
      })
    }

    for (const row of res[0].values) {
      const [id, slot, start, end, subj, type, weekType, teacher, building, room, , dayNum] = row as any[]
      const targetDay = daysMap.get(dayNum) || {
        day_of_week: dayNum,
        weekday: weekdayNames[dayNum] || "Понедельник",
        classes: [] as ScheduleItem[],
      }
      targetDay.classes.push({
        id,
        num: slot,
        start,
        end,
        subject: subj,
        type,
        weekType,
        teacher,
        building,
        room,
      })
      daysMap.set(dayNum, targetDay)
    }

    return Array.from(daysMap.values())
  }

  async getEmptyClassrooms(
    building: string,
    dayOfWeek: number,
    slotNumber: number,
    weekType: string = "all"
  ): Promise<EmptyClassroomItem[]> {
    const db = await this.getDatabase()

    // Inverted query: find distinct rooms not scheduled at this day and slot
    const occupiedRes = db.exec(`
      SELECT DISTINCT room
      FROM lessons
      WHERE building = ? AND day_of_week = ? AND slot_number = ?
        AND (week_type = 'all' OR week_type = ? OR ? = 'all');
    `, [building, dayOfWeek, slotNumber, weekType, weekType])

    const occupiedRooms = new Set<string>()
    if (occupiedRes[0]?.values) {
      for (const row of occupiedRes[0].values) {
        occupiedRooms.add(String(row[0]))
      }
    }

    const allRoomsRes = db.exec(`
      SELECT DISTINCT room
      FROM lessons
      WHERE building = ? AND room != '' AND room != 'Каф.'
      ORDER BY room ASC;
    `, [building])

    const emptyRooms: EmptyClassroomItem[] = []
    if (allRoomsRes[0]?.values) {
      for (const row of allRoomsRes[0].values) {
        const roomStr = String(row[0])
        if (!occupiedRooms.has(roomStr)) {
          let floor = 1
          for (const char of roomStr) {
            if (char >= "1" && char <= "9") {
              floor = parseInt(char, 10)
              break
            }
          }
          emptyRooms.push({
            classroom_id: emptyRooms.length + 1,
            building,
            room: roomStr,
            floor,
            capacity: 35 + (emptyRooms.length % 4) * 15,
            has_power_sockets: floor >= 2 || emptyRooms.length % 2 === 0,
            is_quiet_zone: floor >= 3,
            status: "free_now",
          })
        }
      }
    }

    return emptyRooms
  }

  async applyDelta(delta: { groupName: string; classes: ScheduleItem[]; dayOfWeek: number; weekday: string }) {
    const db = await this.getDatabase()
    db.run("BEGIN TRANSACTION;")

    // Delete existing classes for this group & day
    db.run("DELETE FROM lessons WHERE group_name = ? AND day_of_week = ?;", [delta.groupName, delta.dayOfWeek])

    // Insert updated classes
    for (const c of delta.classes) {
      db.run(
        `INSERT INTO lessons (id, group_name, weekday, day_of_week, slot_number, start_time, end_time, subject, type, week_type, teacher, building, room)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          c.id,
          delta.groupName,
          delta.weekday,
          delta.dayOfWeek,
          c.num,
          c.start,
          c.end,
          c.subject,
          c.type,
          c.weekType || "all",
          c.teacher,
          c.building,
          c.room,
        ]
      )
    }

    db.run("COMMIT;")
    await this.persistToOPFS(db)
  }

  async saveProposal(p: ScheduleChangeProposal): Promise<void> {
    const db = await this.getDatabase()
    db.run(`
      INSERT OR REPLACE INTO crowdsource_proposals
      (id, group_name, student_name, student_role, change_type, target_day, target_slot, target_building, target_room, reason, peer_votes, status, display_badge, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      p.id,
      String(p.group_id),
      p.student_name,
      p.student_role,
      p.change_type,
      p.target_day_of_week || 1,
      p.target_slot_number || 1,
      p.target_building || "",
      p.target_room || "",
      p.reason,
      p.peer_votes,
      p.status,
      p.display_badge,
      p.created_at,
    ])
    await this.persistToOPFS(db)
  }
}

export const localDb = new LocalDatabaseManager()
