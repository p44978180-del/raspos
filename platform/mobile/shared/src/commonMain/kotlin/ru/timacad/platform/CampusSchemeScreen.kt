package ru.timacad.platform

import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.unit.dp

@Composable
fun CampusSchemeScreen(
    view: CampusView?, onEndpoint: (Boolean, Int) -> Unit, modifier: Modifier = Modifier,
    map: @Composable (CampusView, Modifier) -> Unit,
) {
    val uri = LocalUriHandler.current
    Column(modifier) {
        Column(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp)) {
            Text(CampusScheme.caption, style = MaterialTheme.typography.titleLarge)
            Text("Дорожки и корпуса · без маршрутов внутри зданий", style = MaterialTheme.typography.bodySmall)
        }
        if (view == null) {
            Text("Схема появится после первого подключения и сохранится для работы без сети.", Modifier.padding(16.dp))
        } else {
            Column(Modifier.padding(horizontal = 8.dp)) {
                CampusEndpoint("Откуда", view.from, view.presets) { onEndpoint(true, it) }
                CampusEndpoint("Куда", view.to, view.presets) { onEndpoint(false, it) }
            }
            Text(view.message, Modifier.padding(horizontal = 16.dp, vertical = 4.dp), style = MaterialTheme.typography.bodySmall)
            map(view, Modifier.weight(1f).fillMaxWidth())
            TextButton(onClick = { uri.openUri(view.attributionUrl) }, modifier = Modifier.fillMaxWidth()) {
                Text("${view.attribution} · ODbL", style = MaterialTheme.typography.labelSmall)
            }
        }
    }
}

@Composable
private fun CampusEndpoint(label: String, selected: Int, presets: List<CampusPreset>, choose: (Int) -> Unit) {
    var expanded by remember { mutableStateOf(false) }
    Box {
        TextButton(onClick = { expanded = true }) { Text("$label: ${presets.firstOrNull { it.id == selected }?.name.orEmpty()} ▾") }
        DropdownMenu(expanded = expanded, onDismissRequest = { expanded = false }) {
            presets.forEach { preset -> DropdownMenuItem(text = { Text(preset.name) }, onClick = { expanded = false; choose(preset.id) }) }
        }
    }
}
