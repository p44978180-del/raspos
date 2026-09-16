package ru.timacad.raspos.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import ru.timacad.raspos.core.domain.models.UserRole
import ru.timacad.raspos.ui.theme.TimacadGreen

@Composable
fun ProfileScreen(
    currentGroup: String,
    currentRole: UserRole,
    onRoleChange: (UserRole) -> Unit,
    crdtSyncCount: Int,
    modifier: Modifier = Modifier
) {
    Column(
        modifier = modifier
            .fillMaxSize()
            .background(Color(0xFF090D0B))
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        Text(
            text = "Профиль & Настройки",
            fontSize = 20.sp,
            fontWeight = FontWeight.ExtraBold,
            color = Color.White
        )

        // User Info Card
        Surface(
            shape = RoundedCornerShape(16.dp),
            color = Color(0xFF131A15),
            modifier = Modifier.fillMaxWidth()
        ) {
            Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                Text(text = "Текущая группа", fontSize = 11.sp, color = Color.White.copy(alpha = 0.6f))
                Text(text = currentGroup, fontSize = 18.sp, fontWeight = FontWeight.Bold, color = Color.White)
                Text(
                    text = "РГАУ-МСХА имени К.А. Тимирязева",
                    fontSize = 12.sp,
                    color = TimacadGreen,
                    fontWeight = FontWeight.SemiBold
                )
            }
        }

        // Role Switcher Card (Student / Headstudent / Deputy)
        Surface(
            shape = RoundedCornerShape(16.dp),
            color = Color(0xFF131A15),
            modifier = Modifier.fillMaxWidth()
        ) {
            Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Text(text = "Роль в группе", fontSize = 13.sp, fontWeight = FontWeight.Bold, color = Color.White)
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    val roles = listOf(
                        Triple(UserRole.STUDENT, "Студент", "👨‍🎓"),
                        Triple(UserRole.HEADSTUDENT, "Староста", "⭐"),
                        Triple(UserRole.DEPUTY_HEADSTUDENT, "Зам. старосты", "🛡️")
                    )

                    for ((role, title, icon) in roles) {
                        val isSelected = currentRole == role
                        Button(
                            onClick = { onRoleChange(role) },
                            shape = RoundedCornerShape(10.dp),
                            colors = ButtonDefaults.buttonColors(
                                containerColor = if (isSelected) TimacadGreen else Color.White.copy(alpha = 0.08f)
                            ),
                            contentPadding = PaddingValues(horizontal = 10.dp, vertical = 6.dp)
                        ) {
                            Text("$icon $title", fontSize = 11.sp, color = Color.White)
                        }
                    }
                }
            }
        }

        // Local-First CRDT Status
        Surface(
            shape = RoundedCornerShape(16.dp),
            color = Color(0xFF131A15),
            modifier = Modifier.fillMaxWidth()
        ) {
            Row(
                modifier = Modifier
                    .padding(16.dp)
                    .fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Column {
                    Text(text = "Local-First CRDT Синхронизация", fontSize = 13.sp, fontWeight = FontWeight.Bold, color = Color.White)
                    Text(text = "P2P векторные часы и LWW репликация", fontSize = 11.sp, color = Color.White.copy(alpha = 0.6f))
                }
                Surface(
                    shape = RoundedCornerShape(8.dp),
                    color = TimacadGreen.copy(alpha = 0.15f)
                ) {
                    Text(
                        text = "Активно ($crdtSyncCount оп.)",
                        fontSize = 11.sp,
                        fontWeight = FontWeight.Bold,
                        color = TimacadGreen,
                        modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp)
                    )
                }
            }
        }
    }
}
