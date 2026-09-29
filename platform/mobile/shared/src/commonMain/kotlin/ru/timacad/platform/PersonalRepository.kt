package ru.timacad.platform

import androidx.compose.runtime.Immutable
import kotlinx.serialization.json.*
import ru.timacad.platform.db.PlatformDatabase
import kotlin.random.Random

@Immutable
data class PersonalTask(val id: String, val title: String, val date: String, val done: Boolean, val kind: String)

@Immutable
data class PersonalPlan(
    val id: String, val title: String, val date: String, val start: String,
    val end: String, val room: String, val cancelled: Boolean,
)

/** Call on the database dispatcher; document, projection and outbox share a transaction. */
class PersonalRepository(private val database: PlatformDatabase, private val engine: PersonalEngine) {
    private val queries get() = database.platformQueries

    fun saveTask(task: PersonalTask) = edit(buildJsonObject { put("type", "save_task"); put("task", task.json()) })
    fun savePlan(plan: PersonalPlan) = edit(buildJsonObject { put("type", "save_plan"); put("plan", plan.json()) })
    fun deleteTask(id: String) = edit(buildJsonObject { put("type", "delete_task"); put("id", id) })
    fun deletePlan(id: String) = edit(buildJsonObject { put("type", "delete_plan"); put("id", id) })
    fun saveNotes(text: String) = edit(buildJsonObject { put("type", "set_notes"); put("text", text) })

    fun tasks(): List<PersonalTask> = queries.listTasks().executeAsList().map {
        PersonalTask(it.task_id, it.title, it.task_date, it.done != 0L, it.kind)
    }
    fun plans(): List<PersonalPlan> = queries.listPlans().executeAsList().map {
        PersonalPlan(it.plan_id, it.title, it.plan_date, it.starts_at, it.ends_at, it.room, it.cancelled != 0L)
    }
    fun notes(): String = meta("personal_notes").orEmpty()

    fun scopeId(): String = meta("active_personal_scope") ?: guestScope()
    private fun guestScope() = identity("personal_guest_scope") { "guest:" + randomUuid { Random.nextInt(256) } }

    /** Account changes retain each document separately, including the offline guest. */
    fun activateAccount(account: String?) = database.transaction {
        if (account != null) require(Regex("[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}").matches(account))
        val target = account ?: guestScope()
        if (scopeId() == target) return@transaction
        snapshot()
        queries.upsertMeta("active_personal_scope", target)
        commit(engine.open(queries.personalSnapshot(target).executeAsOneOrNull() ?: byteArrayOf()))
    }
    private fun peer(): ULong = identity("personal_peer") { Random.nextLong(1, Long.MAX_VALUE).toString() }.toULong()
    private fun identity(key: String, create: () -> String): String = meta(key) ?: create().also { queries.upsertMeta(key, it) }
    private fun meta(key: String) = queries.selectByKey(key).executeAsOneOrNull()

    private fun snapshot(): ByteArray {
        queries.personalSnapshot(scopeId()).executeAsOneOrNull()?.let { return it }
        if (tasks().isEmpty() && plans().isEmpty() && notes().isEmpty() && meta("personal_group").isNullOrEmpty()
            && meta("personal_name").isNullOrEmpty() && (meta("personal_favorites") ?: "[]") == "[]") {
            return engine.open(byteArrayOf()).also(::commit).snapshot
        }
        // Upgrade existing installations without losing pre-CRDT notes/tasks/plans.
        val legacy = Json.parseToJsonElement(exportV4(meta("personal_group").orEmpty(), meta("personal_name").orEmpty(), notes()))
        val imported = engine.apply(byteArrayOf(), peer(), buildJsonObject { put("type", "import_v4"); put("backup", legacy) }.toString())
        commit(imported)
        return imported.snapshot
    }

    private fun edit(operation: JsonObject) = database.transaction {
        commit(engine.apply(snapshot(), peer(), operation.toString()))
    }

    /** Merge is idempotent and never re-enqueues received operations. */
    fun merge(frames: List<SyncFrame>) = database.transaction {
        if (frames.isEmpty()) return@transaction
        val doc = engine.merge(snapshot(), frames.map { it.op })
        commit(doc)
        val latest = maxOf(cursor(), frames.maxOf { it.lsn })
        queries.upsertCursor("personal", scopeId(), "", latest)
    }
    fun cursor(): Long = queries.selectCursor("personal", scopeId()).executeAsOneOrNull()?.lsn ?: 0L

    private fun commit(doc: PersonalDocument) {
        val data = Json.parseToJsonElement(doc.jsonV4).jsonObject.getValue("data").jsonObject
        queries.savePersonalSnapshot(scopeId(), doc.snapshot)
        queries.deleteTasks()
        queries.deletePlans()
        data.getValue("tasks").jsonArray.forEach { entry ->
            val row = entry.jsonObject
            queries.upsertTask(row.text("id"), row.text("title"), row.text("date"), if (row.getValue("done").jsonPrimitive.boolean) 1 else 0, row.text("kind"))
        }
        data.getValue("plans").jsonArray.forEach { entry ->
            val row = entry.jsonObject
            queries.upsertPlan(row.text("id"), row.text("title"), row.text("date"), row.text("start"), row.text("end"), row.text("room"), if (row["cancelled"]?.jsonPrimitive?.boolean == true) 1 else 0)
        }
        queries.upsertMeta("personal_notes", data.text("notes"))
        queries.upsertMeta("personal_group", data.text("group"))
        queries.upsertMeta("personal_name", data.text("name"))
        queries.upsertMeta("personal_favorites", data.getValue("favorites").toString())
        if (doc.update.isNotEmpty()) {
            val limit = 1024 * 1024
            val chunks = if (doc.update.size <= limit) listOf(doc.update) else engine.splitUpdate(doc.snapshot, doc.update, limit)
            var sequence = queries.nextOutboxSequence().executeAsOne()
            chunks.forEach { enqueue(sequence++, scopeId(), it) }
        }
    }

    fun importV4(json: String): Boolean = try {
        require(json.length <= 8 * 1024 * 1024)
        val backup = Json.parseToJsonElement(json).jsonObject
        require(backup.getValue("version").jsonPrimitive.int == 4)
        edit(buildJsonObject { put("type", "import_v4"); put("backup", backup) })
        true
    } catch (_: Exception) { false }

    fun exportV4(group: String = meta("personal_group").orEmpty(), name: String = meta("personal_name").orEmpty(), notes: String = notes()): String = buildJsonObject {
        put("version", 4)
        put("data", buildJsonObject {
            put("group", group); put("name", name); put("notes", notes)
            put("tasks", JsonArray(tasks().map { it.json() }))
            put("plans", JsonArray(plans().map { it.json() }))
            put("favorites", Json.parseToJsonElement(meta("personal_favorites") ?: "[]"))
        })
    }.toString()

    fun enqueue(clientSeq: Long, scopeId: String, payload: ByteArray): Boolean {
        if (queries.findOutbox(clientSeq).executeAsOneOrNull() != null) return false
        queries.enqueue(clientSeq, "personal", scopeId, payload)
        return true
    }
    fun acknowledge(clientSeq: Long) = queries.ackOutbox(clientSeq)
    fun pending(): List<Long> = queries.pendingOutbox().executeAsList()
    fun pendingRows(): List<OutboxRow> = queries.pendingOutboxRows().executeAsList().map {
        OutboxRow(it.client_seq, it.collection, it.scope_id, it.payload)
    }
}

private fun JsonObject.text(key: String) = getValue(key).jsonPrimitive.content
private fun PersonalTask.json() = buildJsonObject {
    put("id", id); put("title", title); put("date", date); put("done", done); put("kind", kind)
}
private fun PersonalPlan.json() = buildJsonObject {
    put("id", id); put("title", title); put("date", date); put("start", start)
    put("end", end); put("room", room); if (cancelled) put("cancelled", true)
}
