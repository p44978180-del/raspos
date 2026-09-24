package ru.timacad.platform

import ru.timacad.platform.db.PlatformDatabase

data class PersonalTask(val id: String, val title: String, val date: String, val done: Boolean, val kind: String)

data class PersonalPlan(
    val id: String,
    val title: String,
    val date: String,
    val start: String,
    val end: String,
    val room: String,
    val cancelled: Boolean,
)

class PersonalRepository(private val database: PlatformDatabase) {
    fun saveTask(task: PersonalTask) {
        database.platformQueries.upsertTask(task.id, task.title, task.date, if (task.done) 1 else 0, task.kind)
    }

    fun savePlan(plan: PersonalPlan) {
        database.platformQueries.upsertPlan(
            plan.id, plan.title, plan.date, plan.start, plan.end, plan.room, if (plan.cancelled) 1 else 0,
        )
    }

    fun tasks(): List<PersonalTask> = database.platformQueries.listTasks().executeAsList().map {
        PersonalTask(it.task_id, it.title, it.task_date, it.done != 0L, it.kind)
    }

    fun plans(): List<PersonalPlan> = database.platformQueries.listPlans().executeAsList().map {
        PersonalPlan(it.plan_id, it.title, it.plan_date, it.starts_at, it.ends_at, it.room, it.cancelled != 0L)
    }

    fun enqueue(clientSeq: Long, scopeId: String, payload: ByteArray): Boolean {
        if (database.platformQueries.findOutbox(clientSeq).executeAsOneOrNull() != null) return false
        database.platformQueries.enqueue(clientSeq, "personal", scopeId, payload)
        return true
    }

    fun acknowledge(clientSeq: Long) {
        database.platformQueries.ackOutbox(clientSeq)
    }

    fun pending(): List<Long> = database.platformQueries.pendingOutbox().executeAsList()

    fun exportV4(group: String, name: String, notes: String): String {
        val tasks = tasks().joinToString(",") { task ->
            """{"id":${json(task.id)},"title":${json(task.title)},"date":${json(task.date)},"done":${task.done},"kind":${json(task.kind)}}"""
        }
        val plans = plans().joinToString(",") { plan ->
            val cancelled = if (plan.cancelled) ""","cancelled":true""" else ""
            """{"id":${json(plan.id)},"title":${json(plan.title)},"date":${json(plan.date)},"start":${json(plan.start)},"end":${json(plan.end)},"room":${json(plan.room)}$cancelled}"""
        }
        return """{"version":4,"data":{"group":${json(group)},"name":${json(name)},"tasks":[$tasks],"notes":${json(notes)},"plans":[$plans],"favorites":[]}}"""
    }
}

private fun json(value: String): String {
    val escaped = value.replace("\\", "\\\\").replace("\"", "\\\"").replace("\n", "\\n")
    return "\"$escaped\""
}
