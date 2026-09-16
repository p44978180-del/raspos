package ru.timacad.raspos.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import ru.timacad.raspos.core.domain.models.StudentMiniAppManifest
import ru.timacad.raspos.ui.theme.TimacadGreen

@Composable
fun MiniAppStoreScreen(
    installedApps: List<StudentMiniAppManifest>,
    onInstallApp: (StudentMiniAppManifest) -> Unit,
    onLaunchApp: (StudentMiniAppManifest) -> Unit,
    modifier: Modifier = Modifier
) {
    var selectedTab by remember { mutableStateOf(0) }
    val categories = listOf("Все", "Наука & СНО", "Общежития", "Спорт", "Учеба")

    Column(
        modifier = modifier
            .fillMaxSize()
            .background(Color(0xFF090D0B))
            .padding(16.dp)
    ) {
        // Store Header
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Column {
                Text(
                    text = "Магазин мини-аппов",
                    fontSize = 20.sp,
                    fontWeight = FontWeight.ExtraBold,
                    color = Color.White
                )
                Text(
                    text = "Студенческие репозитории · CSP v3 Sandbox",
                    fontSize = 12.sp,
                    color = Color.White.copy(alpha = 0.6f)
                )
            }

            Surface(
                shape = RoundedCornerShape(10.dp),
                color = TimacadGreen.copy(alpha = 0.15f)
            ) {
                Text(
                    text = "✓ CSP v3",
                    fontSize = 11.sp,
                    fontWeight = FontWeight.Bold,
                    color = TimacadGreen,
                    modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp)
                )
            }
        }

        Spacer(modifier = Modifier.height(16.dp))

        // Mini-Apps List
        LazyColumn(
            verticalArrangement = Arrangement.spacedBy(10.dp),
            modifier = Modifier.fillMaxSize()
        ) {
            items(installedApps, key = { it.id }) { app ->
                Surface(
                    shape = RoundedCornerShape(16.dp),
                    color = Color(0xFF131A15),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Row(
                        modifier = Modifier
                            .padding(14.dp)
                            .fillMaxWidth(),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(12.dp)
                    ) {
                        Text(text = app.icon, fontSize = 28.sp)

                        Column(modifier = Modifier.weight(1f)) {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Text(
                                    text = app.name,
                                    fontSize = 14.sp,
                                    fontWeight = FontWeight.Bold,
                                    color = Color.White
                                )
                                Spacer(modifier = Modifier.width(6.dp))
                                Text(
                                    text = "v${app.version}",
                                    fontSize = 10.sp,
                                    color = Color.White.copy(alpha = 0.5f)
                                )
                            }
                            Text(
                                text = app.description,
                                fontSize = 11.sp,
                                color = Color.White.copy(alpha = 0.6f),
                                maxLines = 1
                            )
                            Text(
                                text = app.organization,
                                fontSize = 10.sp,
                                color = TimacadGreen,
                                fontWeight = FontWeight.SemiBold
                            )
                        }

                        Button(
                            onClick = {
                                if (app.isInstalled) onLaunchApp(app) else onInstallApp(app)
                            },
                            shape = RoundedCornerShape(10.dp),
                            colors = ButtonDefaults.buttonColors(
                                containerColor = if (app.isInstalled) TimacadGreen else Color.White.copy(alpha = 0.1f)
                            ),
                            contentPadding = PaddingValues(horizontal = 12.dp, vertical = 6.dp)
                        ) {
                            Text(
                                text = if (app.isInstalled) "Открыть" else "Установить",
                                fontSize = 11.sp,
                                fontWeight = FontWeight.Bold,
                                color = Color.White
                            )
                        }
                    }
                }
            }
        }
    }
}
