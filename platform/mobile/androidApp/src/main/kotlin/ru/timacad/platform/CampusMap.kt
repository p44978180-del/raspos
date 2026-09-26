package ru.timacad.platform

import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import org.maplibre.android.MapLibre
import org.maplibre.android.camera.CameraPosition
import org.maplibre.android.geometry.LatLng
import org.maplibre.android.maps.MapView
import org.maplibre.android.maps.Style

@Composable
fun CampusMap(modifier: Modifier = Modifier) {
    val context = LocalContext.current
    val mapView = remember {
        MapLibre.getInstance(context)
        MapView(context).apply { onCreate(null) }
    }
    DisposableEffect(mapView) {
        mapView.onStart()
        mapView.onResume()
        mapView.getMapAsync { map ->
            map.setStyle(Style.Builder().fromUri("asset://campus/style.json")) {
                map.cameraPosition = CameraPosition.Builder()
                    .target(LatLng(55.8334, 37.5502))
                    .zoom(16.6)
                    .build()
            }
        }
        onDispose {
            mapView.onPause()
            mapView.onStop()
            mapView.onDestroy()
        }
    }
    AndroidView(factory = { mapView }, modifier = modifier.fillMaxWidth().height(240.dp))
}
