import ActivityKit
import Foundation

public struct TimacadScheduleActivityAttributes: ActivityAttributes {
    public struct ContentState: Codable, Hashable {
        public var currentSubject: String
        public var currentRoom: String
        public var currentBuilding: String
        public var minutesLeft: Int
        public var nextSubject: String?
        public var nextRoom: String?
        public var nextStart: String?
        public var isUrgentTransfer: Bool
        public var progress: Double

        public init(
            currentSubject: String,
            currentRoom: String,
            currentBuilding: String,
            minutesLeft: Int,
            nextSubject: String? = nil,
            nextRoom: String? = nil,
            nextStart: String? = nil,
            isUrgentTransfer: Bool = false,
            progress: Double = 0.0
        ) {
            self.currentSubject = currentSubject
            self.currentRoom = currentRoom
            self.currentBuilding = currentBuilding
            self.minutesLeft = minutesLeft
            self.nextSubject = nextSubject
            self.nextRoom = nextRoom
            self.nextStart = nextStart
            self.isUrgentTransfer = isUrgentTransfer
            self.progress = progress
        }
    }

    public var groupId: String
    public var dateIso: String

    public init(groupId: String, dateIso: String) {
        self.groupId = groupId
        self.dateIso = dateIso
    }
}
