package ru.timacad.platform

import androidx.compose.runtime.Immutable

enum class PersonalEntryKind { Task, Plan }

@Immutable
data class PersonalDraft(
    val id: String,
    val kind: PersonalEntryKind,
    val title: String = "",
    val date: String = "",
    val start: String = "09:00",
    val end: String = "10:35",
    val room: String = "",
    val homework: Boolean = false,
    val done: Boolean = false,
    val cancelled: Boolean = false,
)
