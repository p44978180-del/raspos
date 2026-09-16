package ru.timacad.raspos.core.domain.models

import kotlinx.serialization.Serializable

@Serializable
enum class MiniAppCategory {
    CAMPUS_LIFE,
    STUDY_TOOLS,
    CANTEEN_FOOD,
    COMMUNITY,
    SPORTS,
    UTILITIES
}

@Serializable
data class ContentSecurityPolicyV3(
    val defaultSrc: List<String>,
    val scriptSrc: List<String>,
    val styleSrc: List<String>,
    val connectSrc: List<String>,
    val imgSrc: List<String>,
    val fontSrc: List<String>,
    val sandbox: List<String>
)

@Serializable
data class MiniAppPermission(
    val id: String,
    val name: String,
    val description: String,
    val isDangerous: Boolean
)

@Serializable
data class MiniAppManifest(
    val id: String,
    val name: String,
    val version: String,
    val description: String,
    val author: String,
    val repositoryUrl: String,
    val iconUrl: String,
    val category: MiniAppCategory,
    val csp: ContentSecurityPolicyV3,
    val permissions: List<MiniAppPermission>,
    val integritySha256: String,
    val isVerifiedStudentOrg: Boolean = false
)

@Serializable
data class MiniAppSecurityReport(
    val isValid: Boolean,
    val securityScore: Int,
    val errors: List<String>,
    val warnings: List<String>
)
