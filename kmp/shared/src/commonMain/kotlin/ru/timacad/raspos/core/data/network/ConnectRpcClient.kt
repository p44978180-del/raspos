package ru.timacad.raspos.core.data.network

import io.ktor.client.*
import io.ktor.client.call.*
import io.ktor.client.plugins.contentnegotiation.*
import io.ktor.client.request.*
import io.ktor.client.statement.*
import io.ktor.http.*
import io.ktor.serialization.kotlinx.json.*
import kotlinx.serialization.json.Json
import ru.timacad.raspos.core.domain.models.DaySchedule
import ru.timacad.raspos.core.domain.models.FreeClassroom

class ConnectRpcClient(
    private val baseUrl: String = "https://raspos.rgau.ru/api/connect"
) {
    private val httpClient = HttpClient {
        install(ContentNegotiation) {
            json(Json {
                ignoreUnknownKeys = true
                isLenient = true
                encodeDefaults = true
            })
        }
    }

    suspend fun getScheduleDelta(
        groupId: String,
        lastEtag: String? = null
    ): Result<Pair<List<DaySchedule>, String>> = runCatching {
        val response: HttpResponse = httpClient.post("$baseUrl/schedule.v1.ScheduleService/GetScheduleDelta") {
            contentType(ContentType.Application.Json)
            setBody(mapOf("group_id" to groupId, "etag" to (lastEtag ?: "")))
            headers {
                append("Connect-Protocol-Version", "1")
                if (lastEtag != null) {
                    append(HttpHeaders.IfNoneMatch, lastEtag)
                }
            }
        }

        if (response.status == HttpStatusCode.NotModified) {
            return@runCatching Pair(emptyList(), lastEtag ?: "")
        }

        val etag = response.headers[HttpHeaders.ETag] ?: "W/etag-v3.0"
        val schedule = response.body<List<DaySchedule>>()
        Pair(schedule, etag)
    }

    suspend fun getEmptyClassrooms(
        buildingId: String,
        slotNumber: Int
    ): Result<List<FreeClassroom>> = runCatching {
        val response: HttpResponse = httpClient.post("$baseUrl/schedule.v1.ScheduleService/GetEmptyClassrooms") {
            contentType(ContentType.Application.Json)
            setBody(mapOf("building_id" to buildingId, "slot" to slotNumber))
            headers {
                append("Connect-Protocol-Version", "1")
            }
        }
        response.body()
    }
}
