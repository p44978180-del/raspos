import ActivityKit
import WidgetKit
import SwiftUI

public struct ScheduleAttributes: ActivityAttributes {
    public struct ContentState: Codable, Hashable {
        public var minutesUntil: Int
        public var isCurrent: Bool
        public var remainingMinutes: Int
    }

    public var subject: String
    public var classroom: String
    public var building: String
    public var startTime: String
    public var endTime: String
}

@available(iOS 16.1, *)
public struct ScheduleLiveActivityWidget: Widget {
    public var body: some WidgetConfiguration {
        ActivityConfiguration(for: ScheduleAttributes.self) { context in
            // Lock Screen Banner View
            HStack(spacing: 12) {
                VStack(alignment: .leading, spacing: 4) {
                    Text("РГАУ-МСХА • Следующая пара")
                        .font(.system(size: 11, weight: .bold))
                        .foregroundColor(Color(red: 0.13, green: 0.77, blue: 0.37))
                    Text(context.attributes.subject)
                        .font(.system(size: 15, weight: .heavy))
                        .foregroundColor(.white)
                    Text("📍 ауд. \(context.attributes.classroom) • \(context.attributes.building)")
                        .font(.system(size: 12, weight: .medium))
                        .foregroundColor(Color.gray)
                }
                Spacer()
                VStack(alignment: .trailing, spacing: 2) {
                    Text("\(context.state.minutesUntil) мин")
                        .font(.system(size: 16, weight: .black, design: .monospaced))
                        .foregroundColor(Color(red: 0.13, green: 0.77, blue: 0.37))
                    Text("до звонка")
                        .font(.system(size: 10, weight: .medium))
                        .foregroundColor(.gray)
                }
            }
            .padding()
            .background(Color(red: 0.04, green: 0.05, blue: 0.04))
        } dynamicIsland: { context in
            DynamicIsland {
                // Expanded Dynamic Island
                DynamicIslandExpandedRegion(.leading) {
                    VStack(alignment: .leading) {
                        Text("📖 РГАУ")
                            .font(.caption2)
                            .foregroundColor(.green)
                        Text(context.attributes.subject)
                            .font(.headline)
                            .foregroundColor(.white)
                    }
                }
                DynamicIslandExpandedRegion(.trailing) {
                    VStack(alignment: .trailing) {
                        Text("\(context.state.minutesUntil)м")
                            .font(.title3)
                            .bold()
                            .foregroundColor(.green)
                        Text("ауд. \(context.attributes.classroom)")
                            .font(.caption2)
                            .foregroundColor(.white)
                    }
                }
                DynamicIslandExpandedRegion(.bottom) {
                    HStack {
                        Text(context.attributes.building)
                            .font(.caption)
                            .foregroundColor(.gray)
                        Spacer()
                        Text("\(context.attributes.startTime) — \(context.attributes.endTime)")
                            .font(.caption)
                            .bold()
                    }
                }
            } compactLeading: {
                Text("📖 416")
                    .font(.caption2)
                    .foregroundColor(.green)
            } compactTrailing: {
                Text("\(context.state.minutesUntil)м")
                    .font(.caption2)
                    .foregroundColor(.white)
            } minimal: {
                Text("416")
                    .font(.caption2)
                    .foregroundColor(.green)
            }
        }
    }
}
