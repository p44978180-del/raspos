import WidgetKit
import SwiftUI

struct ScheduleEntry: TimelineEntry {
    let date: Date
    let title: String
}

struct ScheduleProvider: TimelineProvider {
    func placeholder(in context: Context) -> ScheduleEntry {
        ScheduleEntry(date: Date(), title: "Расписание")
    }

    func getSnapshot(in context: Context, completion: @escaping (ScheduleEntry) -> Void) {
        completion(ScheduleEntry(date: Date(), title: coreHello()))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<ScheduleEntry>) -> Void) {
        let entry = ScheduleEntry(date: Date(), title: coreHello())
        completion(Timeline(entries: [entry], policy: .never))
    }
}

struct ScheduleWidgetView: View {
    let entry: ScheduleEntry

    var body: some View {
        Text(entry.title)
    }
}

struct TimacadScheduleWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "timacad.schedule", provider: ScheduleProvider()) { entry in
            ScheduleWidgetView(entry: entry)
        }
        .configurationDisplayName("Расписание")
        .description("Следующая пара из локальной базы")
        .supportedFamilies([.systemSmall, .systemMedium])
    }
}
