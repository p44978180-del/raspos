package ru.timacad.platform

import uniffi.timacad_core.corePersonalApply
import uniffi.timacad_core.corePersonalMerge
import uniffi.timacad_core.corePersonalOpen
import uniffi.timacad_core.PersonalState

class NativePersonalEngine : PersonalEngine {
    override fun open(snapshot: ByteArray) = corePersonalOpen(snapshot).document()
    override fun apply(snapshot: ByteArray, peer: ULong, operation: String) = corePersonalApply(snapshot, peer, operation).document()
    override fun merge(snapshot: ByteArray, updates: List<ByteArray>) = corePersonalMerge(snapshot, updates).document()
}

private fun PersonalState.document() = PersonalDocument(snapshot, update, jsonV4)
