package ru.timacad.platform

import androidx.glance.appwidget.updateAll
import io.ktor.client.HttpClient
import io.ktor.client.engine.okhttp.OkHttp
import io.ktor.client.plugins.websocket.WebSockets
import io.ktor.client.plugins.HttpTimeout
import io.ktor.client.plugins.websocket.webSocket
import io.ktor.client.request.header
import io.ktor.client.request.post
import io.ktor.client.request.setBody
import io.ktor.client.statement.bodyAsBytes
import io.ktor.client.statement.bodyAsText
import io.ktor.http.ContentType
import io.ktor.http.contentType
import io.ktor.websocket.Frame
import io.ktor.websocket.readText
import kotlinx.coroutines.flow.receiveAsFlow
import kotlinx.coroutines.runBlocking
import ru.timacad.platform.shared.BuildConfig

val SYNC_BASE_URL = BuildConfig.API_URL
val REALTIME_URL = BuildConfig.REALTIME_URL

class KtorSyncTransport(
    private val baseUrl: String = SYNC_BASE_URL,
    private val realtimeUrl: String = REALTIME_URL,
    private val session: () -> String? = { null },
) : SyncTransport {
    private val client = platformHttp()
    override fun bootstrap(replicaId: String, groupCode: String): List<BootstrapFrame> = runBlocking {
        val body = postBytes("$SYNC_SERVICE/Bootstrap", encodeEnvelope(encodeBootstrapRequest(replicaId, groupCode)), "application/connect+proto")
        decodeBootstrapFrames(body)
    }

    override fun pull(collection: String, scopeId: String, sinceLsn: Long): List<SyncFrame> = runBlocking {
        val body = postBytes("$SYNC_SERVICE/Pull", encodeEnvelope(encodePullRequest(collection, scopeId, sinceLsn)), "application/connect+proto")
        decodePullFrames(body)
    }

    override fun push(replicaId: String, rows: List<OutboxRow>): List<PushAck> = runBlocking {
        val body = postBytes("$SYNC_SERVICE/Push", encodePushRequest(replicaId, rows), "application/proto")
        decodePushResponse(body)
    }

    suspend fun listen(channel: String, onHint: (ScheduleHint) -> Unit) {
        client.webSocket(realtimeUrl) {
            send(Frame.Text("""{"id":1,"connect":{}}"""))
            send(Frame.Text("""{"id":2,"subscribe":{"channel":"$channel"}}"""))
            incoming.receiveAsFlow().collect { frame ->
                if (frame is Frame.Text) {
                    val payload = frame.readText()
                    if (payload == "{}") send(Frame.Text("{}"))
                    else {
                        check(!payload.contains("\"error\"")) { "Realtime subscription failed" }
                        parseRealtimeHint(payload)?.let(onHint)
                    }
                }
            }
        }
    }

    private suspend fun postBytes(path: String, payload: ByteArray, content: String): ByteArray {
        return client.post(baseUrl + path) {
            contentType(ContentType.parse(content))
            header("Connect-Protocol-Version", "1")
            session()?.let { header("Authorization", "Bearer $it") }
            setBody(payload)
        }.bodyAsBytes()
    }

    fun close() = client.close()
}

class KtorPasskeyHttp(
    private val baseUrl: String = SYNC_BASE_URL,
) : PasskeyHttp {
    private val client = platformHttp()
    override fun post(path: String, body: String, headers: Map<String, String>): PasskeyResponse = runBlocking {
        val response = client.post(baseUrl + path) {
            contentType(ContentType.Application.Json)
            headers.forEach { (name, value) -> header(name, value) }
            setBody(body)
        }
        val echoed = response.headers.entries().associate { it.key to it.value.joinToString(",") }
        PasskeyResponse(response.status.value, response.bodyAsText(), echoed)
    }

    fun close() = client.close()
}

fun refreshScheduleWidget(context: android.content.Context) {
    kotlinx.coroutines.runBlocking { ScheduleGlanceWidget().updateAll(context) }
}

private fun platformHttp(): HttpClient = HttpClient(OkHttp) {
    expectSuccess = true
    install(HttpTimeout) {
        connectTimeoutMillis = 5_000
        requestTimeoutMillis = 30_000
        socketTimeoutMillis = 30_000
    }
    install(WebSockets)
}
