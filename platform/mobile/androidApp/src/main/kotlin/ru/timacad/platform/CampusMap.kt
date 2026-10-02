package ru.timacad.platform

import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.viewinterop.AndroidView
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import org.maplibre.android.MapLibre
import org.maplibre.android.camera.CameraPosition
import org.maplibre.android.camera.CameraUpdateFactory
import org.maplibre.android.geometry.LatLng
import org.maplibre.android.geometry.LatLngBounds
import org.maplibre.android.maps.MapLibreMap
import org.maplibre.android.maps.MapView
import org.maplibre.android.maps.Style
import org.maplibre.android.style.sources.GeoJsonSource

/** Only passes prepared geometry to MapLibre; SQLite and routing run in the executor. */
@Composable
fun CampusMap(view: CampusView, modifier: Modifier = Modifier) {
    val context = LocalContext.current
    val owner = LocalLifecycleOwner.current
    val renderer = remember(context) { CampusRenderer(MapView(context.also { MapLibre.getInstance(it) }).apply { onCreate(null) }) }
    DisposableEffect(renderer, owner) {
        val observer = LifecycleEventObserver { _, event -> when (event) {
            Lifecycle.Event.ON_START -> renderer.start()
            Lifecycle.Event.ON_RESUME -> renderer.resume()
            Lifecycle.Event.ON_PAUSE -> renderer.pause()
            Lifecycle.Event.ON_STOP -> renderer.stop()
            else -> Unit
        } }
        owner.lifecycle.addObserver(observer)
        onDispose { owner.lifecycle.removeObserver(observer); renderer.destroy() }
    }
    AndroidView(factory = { renderer.view }, update = { renderer.render(view) }, modifier = modifier)
}

private class CampusRenderer(val view: MapView) {
    private var map: MapLibreMap? = null
    private var style: Style? = null
    private var pending: CampusView? = null
    private var hash: String? = null
    private var markers: String? = null
    private var route: String? = null
    private var started = false
    private var resumed = false
    private var destroyed = false
    init {
        view.getMapAsync { loaded ->
            if (!destroyed) {
                map = loaded
                loaded.uiSettings.isAttributionEnabled = false // Full OSM attribution is linked below the map.
                loaded.setStyle(Style.Builder().fromUri("asset://campus/style.json")) { ready ->
                    if (!destroyed) { style = ready; pending?.let(::render) }
                }
            }
        }
    }
    fun render(model: CampusView) {
        pending = model
        val ready = style ?: return
        val loaded = map ?: return
        if (hash != model.hash) {
            ready.getSourceAs<GeoJsonSource>("scheme")!!.setGeoJson(model.schemeJson)
            hash = model.hash
            loaded.cameraPosition = CameraPosition.Builder().target(LatLng(model.center.lat, model.center.lon)).zoom(CampusScheme.cameraZoom).build()
        }
        val endpointsChanged = markers != model.markersJson
        val routeChanged = route != model.routeJson
        if (endpointsChanged) {
            ready.getSourceAs<GeoJsonSource>("endpoints")!!.setGeoJson(model.markersJson)
            markers = model.markersJson
        }
        if (routeChanged) {
            ready.getSourceAs<GeoJsonSource>("route")!!.setGeoJson(model.routeJson)
            route = model.routeJson
        }
        if (routeChanged || endpointsChanged) {
            val bounds = model.cameraBounds
            val area = LatLngBounds.from(bounds.north + 0.0002, bounds.east + 0.0002, bounds.south - 0.0002, bounds.west - 0.0002)
            view.post { if (!destroyed && pending === model) loaded.moveCamera(CameraUpdateFactory.newLatLngBounds(area, 36)) }
        }
    }
    fun start() { if (!started && !destroyed) { view.onStart(); started = true } }
    fun resume() { start(); if (!resumed && !destroyed) { view.onResume(); resumed = true } }
    fun pause() { if (resumed) { view.onPause(); resumed = false } }
    fun stop() { pause(); if (started) { view.onStop(); started = false } }
    fun destroy() { if (!destroyed) { stop(); destroyed = true; view.onDestroy() } }
}
