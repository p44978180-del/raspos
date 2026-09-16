package ru.timacad.raspos.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
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
import ru.timacad.raspos.ui.theme.TimacadGreen

@Composable
fun WalletPassScreen(
    studentName: String = "Иванов Иван Иванович",
    studentCardId: String = "2024-РГАУ-49102",
    facultyName: String = "Агробиотехнология",
    groupName: String = "ДА 01-26",
    onDismiss: () -> Unit
) {
    Surface(
        modifier = Modifier.fillMaxSize(),
        color = Color(0xFF090D0B)
    ) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(20.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center
        ) {
            Surface(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(24.dp)),
                color = Color(0xFF1B330D)
            ) {
                Column(modifier = Modifier.padding(20.dp)) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text(
                            text = "РГАУ-МСХА",
                            fontWeight = FontWeight.ExtraBold,
                            fontSize = 18.sp,
                            color = Color.White
                        )
                        Text(
                            text = "СТУДЕНЧЕСКИЙ БИЛЕТ",
                            fontWeight = FontWeight.Bold,
                            fontSize = 10.sp,
                            color = Color.White.copy(alpha = 0.7f)
                        )
                    }

                    Spacer(modifier = Modifier.height(24.dp))

                    Text(text = studentName, fontSize = 18.sp, fontWeight = FontWeight.Bold, color = Color.White)
                    Text(text = facultyName, fontSize = 12.sp, color = Color(0xFF86EFAC))
                    Text(text = "Группа: $groupName", fontSize = 12.sp, color = Color.White.copy(alpha = 0.8f))

                    Spacer(modifier = Modifier.height(28.dp))

                    // Code 128 Mock Barcode representation
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(54.dp)
                            .background(Color.White, RoundedCornerShape(8.dp)),
                        contentAlignment = Alignment.Center
                    ) {
                        Text(
                            text = "||| | |||| || | |||| ||| | |||",
                            letterSpacing = 2.sp,
                            fontWeight = FontWeight.Bold,
                            fontSize = 18.sp,
                            color = Color.Black
                        )
                    }

                    Spacer(modifier = Modifier.height(8.dp))

                    Text(
                        text = studentCardId,
                        fontSize = 11.sp,
                        fontWeight = FontWeight.SemiBold,
                        color = Color.White.copy(alpha = 0.7f),
                        modifier = Modifier.align(Alignment.CenterHorizontally)
                    )
                }
            }

            Spacer(modifier = Modifier.height(24.dp))

            Button(
                onClick = onDismiss,
                colors = ButtonDefaults.buttonColors(containerColor = TimacadGreen),
                shape = RoundedCornerShape(16.dp)
            ) {
                Text("Закрыть пропуск")
            }
        }
    }
}
