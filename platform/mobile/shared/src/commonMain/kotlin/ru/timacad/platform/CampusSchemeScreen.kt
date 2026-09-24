package ru.timacad.platform

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp

@Composable
fun CampusSchemeScreen(names: List<String>, modifier: Modifier = Modifier) {
    Column(modifier = modifier.fillMaxWidth().padding(horizontal = 20.dp, vertical = 8.dp)) {
        Text(CampusScheme.caption, style = MaterialTheme.typography.titleMedium)
        Text(CampusScheme.legend(names), style = MaterialTheme.typography.bodyMedium)
    }
}
