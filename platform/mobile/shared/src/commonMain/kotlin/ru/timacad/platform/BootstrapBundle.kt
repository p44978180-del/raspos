package ru.timacad.platform

/** Decode the entire server transaction before making any local data visible. */
fun applyBootstrapBundle(repository: ScheduleRepository, frames: List<BootstrapFrame>, requestedGroup: String): Int {
    require(frames.size == 3 && frames.map { it.collection }.toSet() == setOf("group_directory", "lesson", "campus_graph")) { "Bootstrap bundle is incomplete" }
    require(frames.all { it.reset && it.lsn > 0 }) { "Bootstrap frame is not a snapshot" }
    val directory = frames.single { it.collection == "group_directory" }
    val lesson = frames.single { it.collection == "lesson" }
    val campus = frames.single { it.collection == "campus_graph" }
    require(directory.scopeId == "catalog" && campus.scopeId == "campus") { "Bootstrap scope mismatch" }
    syncOpBody(directory.op, 1)
    val groups = decodeDirectory(directory.op)
    require(groups.isNotEmpty() && groups.size <= 10_000 && groups.all { it.code.isNotBlank() } && groups.map { it.code }.toSet().size == groups.size)
    syncOpBody(lesson.op, 2)
    val snapshot = decodeLessonSnapshot(lesson.op)
    require(snapshot.groupCode == lesson.scopeId && groups.any { it.code == snapshot.groupCode }) { "Bootstrap lesson scope mismatch" }
    require(requestedGroup.isEmpty() || requestedGroup == snapshot.groupCode) { "Bootstrap selected a different group" }
    val graph = decodeCampusSnapshot(campus.op)
    repository.transaction {
        repository.replaceDirectory(groups, directory.lsn)
        repository.replaceLessons(snapshot.groupCode, snapshot.snapshotHash, lesson.lsn, snapshot.lessons)
        repository.replaceCampus(graph, campus.lsn)
        repository.select(snapshot.groupCode)
    }
    return 3
}
