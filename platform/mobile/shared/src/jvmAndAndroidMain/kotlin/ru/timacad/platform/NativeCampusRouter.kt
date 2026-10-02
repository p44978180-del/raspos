package ru.timacad.platform

import uniffi.timacad_core.routeCampus

class NativeCampusRouter : CampusRouter {
    override fun route(topology: ByteArray, from: String, to: String): CampusRouteNodes =
        routeCampus(topology, from, to).let { CampusRouteNodes(it.found, it.roomNames) }
}
