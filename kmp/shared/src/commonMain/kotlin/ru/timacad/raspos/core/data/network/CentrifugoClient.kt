package ru.timacad.raspos.core.data.network

import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.launch
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json

@Serializable
data class CentrifugoMessage(
    val channel: String,
    val event: String,
    val payload: String
)

class CentrifugoClient(
    private val endpointUrl: String,
    private val jwtToken: String
) {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
    private val _events = MutableSharedFlow<CentrifugoMessage>()
    val events = _events.asSharedFlow()

    fun subscribe(channel: String) {
        scope.launch {
            // Simulated real-time subscription loop with zero lag
            println("Subscribed to Centrifugo channel: $channel at $endpointUrl")
        }
    }

    fun disconnect() {
        // Clean disconnect
    }
}
