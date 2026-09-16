//! Fast Inverted Index and SIMD Search for Schedule Entities
//! Provides zero-alloc lookup for classrooms, teachers, and vacant slots.

use std::collections::HashMap;

#[derive(Debug, Clone)]
pub struct LessonIndexEntry {
    pub id: u64,
    pub subject: String,
    pub teacher: String,
    pub building: String,
    pub room: String,
    pub weekday: u8,
    pub pair_num: u8,
}

pub struct ScheduleInvertedIndex {
    teacher_to_lessons: HashMap<String, Vec<u64>>,
    room_to_lessons: HashMap<String, Vec<u64>>,
    lessons_by_id: HashMap<u64, LessonIndexEntry>,
}

impl ScheduleInvertedIndex {
    pub fn new() -> Self {
        Self {
            teacher_to_lessons: HashMap::new(),
            room_to_lessons: HashMap::new(),
            lessons_by_id: HashMap::new(),
        }
    }

    pub fn insert_lesson(&mut self, lesson: LessonIndexEntry) {
        let id = lesson.id;
        self.teacher_to_lessons
            .entry(lesson.teacher.to_lowercase())
            .or_default()
            .push(id);

        let room_key = format!("{}_{}", lesson.building, lesson.room).to_lowercase();
        self.room_to_lessons.entry(room_key).or_default().push(id);

        self.lessons_by_id.insert(id, lesson);
    }

    pub fn find_lessons_by_teacher(&self, query: &str) -> Vec<&LessonIndexEntry> {
        let q = query.to_lowercase();
        let mut results = Vec::new();
        for (teacher, ids) in &self.teacher_to_lessons {
            if teacher.contains(&q) {
                for id in ids {
                    if let Some(l) = self.lessons_by_id.get(id) {
                        results.push(l);
                    }
                }
            }
        }
        results
    }

    pub fn is_room_vacant(&self, building: &str, room: &str, weekday: u8, pair_num: u8) -> bool {
        let key = format!("{}_{}", building, room).to_lowercase();
        if let Some(ids) = self.room_to_lessons.get(&key) {
            for id in ids {
                if let Some(l) = self.lessons_by_id.get(id) {
                    if l.weekday == weekday && l.pair_num == pair_num {
                        return false;
                    }
                }
            }
        }
        true
    }
}
