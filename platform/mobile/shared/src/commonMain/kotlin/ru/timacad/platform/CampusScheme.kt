package ru.timacad.platform

object CampusScheme {
    const val caption = "Схема территории"
    const val cameraZoom = 16.5

    fun legend(names: List<String>): String = names.joinToString(" · ")
}
