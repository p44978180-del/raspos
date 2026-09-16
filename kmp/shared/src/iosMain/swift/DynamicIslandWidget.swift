//
//  DynamicIslandWidget.swift
//  TimacadRaspos
//
//  WidgetKit Home Screen & Lock Screen Widgets for RGAU-MSHA Timiryazev Schedule.
//

import WidgetKit
import SwiftUI

struct TimacadScheduleEntry: TimelineEntry {
    let date: Date
    let group: String
    let currentClass: String
    let classroom: String
    let building: String
    let minutesRemaining: Int
}

struct TimacadScheduleWidgetEntryView : View {
    var entry: TimacadScheduleEntry

    var body: some View {
        ZStack {
            Color(red: 0.04, green: 0.05, blue: 0.04)
            VStack(alignment: .leading, spacing: 6) {
                HStack {
                    Text("РГАУ-МСХА")
                        .font(.system(size: 10, weight: .bold))
                        .foregroundColor(Color(red: 0.08, green: 0.50, blue: 0.24))
                    Spacer()
                    Text(entry.group)
                        .font(.system(size: 11, weight: .semibold))
                        .foregroundColor(.white.opacity(0.8))
                }
                
                Text(entry.currentClass)
                    .font(.system(size: 14, weight: .heavy))
                    .foregroundColor(.white)
                    .lineLimit(1)
                
                HStack {
                    Text("ауд. \(entry.classroom) • \(entry.building)")
                        .font(.system(size: 11, weight: .medium))
                        .foregroundColor(.white.opacity(0.7))
                    Spacer()
                    Text("\(entry.minutesRemaining) мин")
                        .font(.system(size: 12, weight: .bold))
                        .foregroundColor(Color(red: 0.13, green: 0.77, blue: 0.37))
                }
            }
            .padding()
        }
    }
}

@main
struct TimacadScheduleWidget: Widget {
    let kind: String = "TimacadScheduleWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: TimacadTimelineProvider()) { entry in
            TimacadScheduleWidgetEntryView(entry: entry)
        }
        .configurationDisplayName("РГАУ Расписание")
        .description("Текущая пара, аудитория и время до звонка на домашнем экране")
        .supportedFamilies([.systemSmall, .systemMedium, .accessoryRectangular])
    }
}

struct TimacadTimelineProvider: TimelineProvider {
    func placeholder(in context: Context) -> TimacadScheduleEntry {
        TimacadScheduleEntry(date: Date(), group: "ДА 01-26", currentClass: "Почвоведение (Лекция)", classroom: "214", building: "Корпус 12", minutesRemaining: 25)
    }

    func getSnapshot(in context: Context, completion: @escaping (TimacadScheduleEntry) -> ()) {
        completion(placeholder(in: context))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<Entry>) -> ()) {
        let entry = placeholder(in: context)
        let timeline = Timeline(entries: [entry], policy: .atEnd)
        completion(timeline)
    }
}
