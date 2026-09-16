package ru.timacad.raspos.ui.navigation

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import ru.timacad.raspos.core.domain.models.*
import ru.timacad.raspos.ui.ScheduleScreen
import ru.timacad.raspos.ui.screens.*
import ru.timacad.raspos.ui.theme.TimacadGreen

enum class NavigationTab(val title: String, val icon: String) {
    SCHEDULE("Расписание", "📅"),
    CAMPUS("Кампус", "🗺️"),
    MINI_APPS("Мини-аппы", "⚡"),
    RADAR("Радар", "📡"),
    PROFILE("Профиль", "👤")
}

@Composable
fun NavigationRoot(
    initialGroup: String = "ДА 01-26"
) {
    var currentTab by remember { mutableStateOf(NavigationTab.SCHEDULE) }
    var activeGroup by remember { mutableStateOf(initialGroup) }
    var currentRole by remember { mutableStateOf(UserRole.STUDENT) }

    Scaffold(
        bottomBar = {
            NavigationBar(
                containerColor = Color(0xFF131A15),
                tonalElevation = 8.dp
            ) {
                for (tab in NavigationTab.values()) {
                    val isSelected = currentTab == tab
                    NavigationBarItem(
                        selected = isSelected,
                        onClick = { currentTab = tab },
                        icon = { Text(tab.icon, fontSize = 18.sp) },
                        label = {
                            Text(
                                text = tab.title,
                                fontSize = 10.sp,
                                color = if (isSelected) TimacadGreen else Color.White.copy(alpha = 0.6f)
                            )
                        },
                        colors = NavigationBarItemDefaults.colors(
                            indicatorColor = TimacadGreen.copy(alpha = 0.2f)
                        )
                    )
                }
            }
        }
    ) { innerPadding ->
        Box(
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding)
                .background(Color(0xFF090D0B))
        ) {
            when (currentTab) {
                NavigationTab.SCHEDULE -> {
                    ScheduleScreen(
                        activeGroup = activeGroup,
                        days = emptyList(),
                        selectedDayIndex = 0,
                        onSelectDay = {},
                        onLessonClick = {}
                    )
                }
                NavigationTab.CAMPUS -> {
                    CampusMapScreen(
                        onBuildingSelected = {}
                    )
                }
                NavigationTab.MINI_APPS -> {
                    MiniAppStoreScreen(
                        installedApps = emptyList(),
                        onInstallApp = {},
                        onLaunchApp = {}
                    )
                }
                NavigationTab.RADAR -> {
                    RoomRadarScreen(
                        freeRooms = emptyList(),
                        onSelectRoom = {}
                    )
                }
                NavigationTab.PROFILE -> {
                    ProfileScreen(
                        currentGroup = activeGroup,
                        currentRole = currentRole,
                        onRoleChange = { currentRole = it },
                        crdtSyncCount = 12
                    )
                }
            }
        }
    }
}
