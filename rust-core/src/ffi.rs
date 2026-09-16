//! Foreign Function Interface (FFI) bindings for Android JNI and iOS Objective-C/Swift

use std::os::raw::{c_char, c_int};
use std::ffi::{CStr, CString};
use crate::simd_projection::{Mat4, Vec4, CampusFloorVertex, project_floor_graph_vertices};
use crate::campus_graph_simd::compute_campus_transit_route;
use crate::csp_validator::{StudentAppManifest, validate_manifest_csp_v3};

/// C-ABI: Calculates 3D floor projection using SIMD vector pipeline
#[no_mangle]
pub extern "C" fn rust_simd128_project_floor_vectors(
    points_ptr: *const f32,
    num_points: usize,
    matrix_ptr: *const f32,
    viewport_w: f32,
    viewport_h: f32,
    out_x_ptr: *mut f32,
    out_y_ptr: *mut f32,
) -> c_int {
    if points_ptr.is_null() || matrix_ptr.is_null() || out_x_ptr.is_null() || out_y_ptr.is_null() {
        return -1;
    }

    let mat_slice = unsafe { std::slice::from_raw_parts(matrix_ptr, 16) };
    let matrix = Mat4 {
        cols: [
            Vec4::new(mat_slice[0], mat_slice[1], mat_slice[2], mat_slice[3]),
            Vec4::new(mat_slice[4], mat_slice[5], mat_slice[6], mat_slice[7]),
            Vec4::new(mat_slice[8], mat_slice[9], mat_slice[10], mat_slice[11]),
            Vec4::new(mat_slice[12], mat_slice[13], mat_slice[14], mat_slice[15]),
        ],
    };

    let coords_slice = unsafe { std::slice::from_raw_parts(points_ptr, num_points * 4) };
    let mut vertices = Vec::with_capacity(num_points);
    for i in 0..num_points {
        vertices.push(CampusFloorVertex {
            x: coords_slice[i * 4],
            y: coords_slice[i * 4 + 1],
            z: coords_slice[i * 4 + 2],
            floor: coords_slice[i * 4 + 3],
            building_id: 1,
        });
    }

    let projected = project_floor_graph_vertices(&matrix, &vertices, viewport_w, viewport_h);

    for (i, p) in projected.iter().enumerate() {
        unsafe {
            *out_x_ptr.add(i) = p.screen_x;
            *out_y_ptr.add(i) = p.screen_y;
        }
    }

    0
}

/// C-ABI: Computes multi-floor campus transit route returning JSON string
#[no_mangle]
pub extern "C" fn rust_simd128_find_campus_transition(
    from_bldg: *const c_char,
    from_floor: u8,
    to_bldg: *const c_char,
    to_floor: u8,
    break_minutes: u32,
) -> *mut c_char {
    if from_bldg.is_null() || to_bldg.is_null() {
        return std::ptr::null_mut();
    }

    let c_from = unsafe { CStr::from_ptr(from_bldg) }.to_string_lossy();
    let c_to = unsafe { CStr::from_ptr(to_bldg) }.to_string_lossy();

    let route = compute_campus_transit_route(&c_from, from_floor, &c_to, to_floor, break_minutes);
    let json_str = serde_json::to_string(&route).unwrap_or_else(|_| "{}".to_string());

    CString::new(json_str).unwrap_or_default().into_raw()
}

/// C-ABI: Validates student mini-app manifest JSON against CSP v3
#[no_mangle]
pub extern "C" fn rust_validate_miniapp_csp_v3(manifest_json: *const c_char) -> *mut c_char {
    if manifest_json.is_null() {
        return std::ptr::null_mut();
    }

    let raw = unsafe { CStr::from_ptr(manifest_json) }.to_string_lossy();
    let manifest: Result<StudentAppManifest, _> = serde_json::from_str(&raw);

    let result = match manifest {
        Ok(m) => validate_manifest_csp_v3(&m),
        Err(e) => crate::csp_validator::CSPValidationResult {
            is_valid: false,
            security_score: 0,
            errors: vec![format!("Malformed JSON manifest: {}", e)],
            warnings: vec![],
            effective_csp_header: "".to_string(),
        },
    };

    let out_json = serde_json::to_string(&result).unwrap_or_else(|_| "{}".to_string());
    CString::new(out_json).unwrap_or_default().into_raw()
}

/// C-ABI: Frees strings allocated by Rust
#[no_mangle]
pub extern "C" fn rust_free_string(s: *mut c_char) {
    if !s.is_null() {
        unsafe {
            let _ = CString::from_raw(s);
        }
    }
}
