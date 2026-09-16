package ru.timacad.raspos.core.mvi

import com.arkivanov.mvikotlin.core.store.Store
import ru.timacad.raspos.core.domain.models.MiniAppManifest
import ru.timacad.raspos.core.domain.models.MiniAppSecurityReport

interface MiniAppStore : Store<MiniAppStore.Intent, MiniAppStore.State, MiniAppStore.Label> {

    sealed interface Intent {
        data class InstallApp(val manifest: MiniAppManifest) : Intent
        data class UninstallApp(val appId: String) : Intent
        data class LaunchApp(val appId: String) : Intent
        data class ValidateThirdPartyManifest(val manifestUrl: String) : Intent
    }

    data class State(
        val installedApps: List<MiniAppManifest> = emptyList(),
        val catalogApps: List<MiniAppManifest> = emptyList(),
        val activeApp: MiniAppManifest? = null,
        val securityReports: Map<String, MiniAppSecurityReport> = emptyMap(),
        val isImporting: Boolean = false
    )

    sealed interface Label {
        data class AppInstallationDenied(val reason: String) : Label
        data class NfcTurnstileEmulated(val passId: String) : Label
    }
}
