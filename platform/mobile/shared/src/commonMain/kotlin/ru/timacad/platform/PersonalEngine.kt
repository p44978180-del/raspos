package ru.timacad.platform

/** The native document and its v4 projection are one atomic repository value. */
data class PersonalDocument(val snapshot: ByteArray, val update: ByteArray, val jsonV4: String)

interface PersonalEngine {
    fun open(snapshot: ByteArray): PersonalDocument
    fun apply(snapshot: ByteArray, peer: ULong, operation: String): PersonalDocument
    fun merge(snapshot: ByteArray, updates: List<ByteArray>): PersonalDocument
    fun splitUpdate(snapshot: ByteArray, update: ByteArray, maxBytes: Int): List<ByteArray>
}
