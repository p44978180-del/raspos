package ru.timacad.raspos.core.mvi

import com.arkivanov.mvikotlin.core.store.Store
import kotlinx.coroutines.flow.StateFlow
import ru.timacad.raspos.core.domain.models.CampusBuilding
import ru.timacad.raspos.core.domain.models.TransitRoute

interface CampusStore : Store<CampusStore.Intent, CampusStore.State, CampusStore.Label> {

    sealed interface Intent {
        data class SelectBuilding(val buildingId: String) : Intent
        data class SelectFloor(val floor: Int) : Intent
        data class SearchRoute(val fromId: String, val toId: String) : Intent
        object ResetRoute : Intent
    }

    data class State(
        val buildings: List<CampusBuilding> = emptyList(),
        val selectedBuildingId: String? = null,
        val selectedFloor: Int = 1,
        val activeRoute: TransitRoute? = null,
        val isLoading: Boolean = false,
        val errorMessage: String? = null
    )

    sealed interface Label {
        data class ShowUrgentTransferAlert(val message: String) : Label
    }
}
