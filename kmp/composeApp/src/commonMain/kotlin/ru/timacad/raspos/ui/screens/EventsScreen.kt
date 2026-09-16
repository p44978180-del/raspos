package ru.timacad.raspos.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import ru.timacad.raspos.ui.theme.TimacadGreen

data class UniversityEvent(
    val id: Long,
    val title: String,
    val date: String,
    val category: String,
    val location: String,
    val description: String
)

val TIMACAD_EVENTS = listOf(
    UniversityEvent(1, "День карьеры в АПК 2026", "24 Марта", "Карьера", "ЦНБ им. Железнова", "Встречи с ведущими агрохолдингами России, стажировки и ярмарка вакансий."),
    UniversityEvent(2, "Научная конференция молодых учёных", "28 Марта", "Наука", "1-й Корпус, Актовый зал", "Секции почвоведения, цифровой агрономии и механизации."),
    UniversityEvent(3, "Весенний кубок РГАУ по мини-футболу", "2 Апреля", "Спорт", "Спорткомплекс (СК)", "Ежегодный турнир между факультетами и институтами.")
)

@Composable
fun EventsScreen(
    modifier: Modifier = Modifier
) {
    Surface(
        modifier = modifier.fillMaxSize(),
        color = Color(0xFF090D0B)
    ) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(16.dp)
        ) {
            Text(
                text = "События и новости РГАУ",
                fontSize = 20.sp,
                fontWeight = FontWeight.ExtraBold,
                color = Color.White
            )

            Spacer(modifier = Modifier.height(16.dp))

            LazyColumn(
                verticalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                items(TIMACAD_EVENTS, key = { it.id }) { item ->
                    Surface(
                        shape = RoundedCornerShape(16.dp),
                        color = Color(0xFF131A15),
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Column(modifier = Modifier.padding(16.dp)) {
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.SpaceBetween
                            ) {
                                Text(
                                    text = item.category,
                                    fontSize = 11.sp,
                                    fontWeight = FontWeight.Bold,
                                    color = TimacadGreen
                                )
                                Text(
                                    text = item.date,
                                    fontSize = 11.sp,
                                    color = Color(0xFF94A3B8)
                                )
                            }
                            Spacer(modifier = Modifier.height(6.dp))
                            Text(
                                text = item.title,
                                fontSize = 16.sp,
                                fontWeight = FontWeight.Bold,
                                color = Color.White
                            )
                            Spacer(modifier = Modifier.height(4.dp))
                            Text(
                                text = item.description,
                                fontSize = 13.sp,
                                color = Color(0xFFCBD5E1)
                            )
                            Spacer(modifier = Modifier.height(8.dp))
                            Text(
                                text = "📍 " + item.location,
                                fontSize = 12.sp,
                                color = Color(0xFF38BDF8)
                            )
                        }
                    }
                }
            }
        }
    }
}
