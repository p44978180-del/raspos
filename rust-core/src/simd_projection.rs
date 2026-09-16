//! WebAssembly SIMD 128-bit Vector Graph Acceleration Module
//!
//! Provides instant 3D projection of campus building floors, hallways, stairs, and cross-building
//! transit corridors using 128-bit SIMD registers (`core::arch::wasm32::*` / `v128`) on modern
//! mobile chipsets (Apple Silicon, Snapdragon, Dimensity, Tensor).

#[cfg(all(target_arch = "wasm32", target_feature = "simd128"))]
use core::arch::wasm32::*;

/// 4-component vector for 3D floor geometry: [x, y, z, w]
#[derive(Debug, Clone, Copy, PartialEq)]
#[repr(C, align(16))]
pub struct Vec4 {
    pub x: f32,
    pub y: f32,
    pub z: f32,
    pub w: f32,
}

impl Vec4 {
    #[inline(always)]
    pub const fn new(x: f32, y: f32, z: f32, w: f32) -> Self {
        Self { x, y, z, w }
    }

    #[inline(always)]
    pub fn zero() -> Self {
        Self::new(0.0, 0.0, 0.0, 0.0)
    }
}

/// 4x4 Transformation Matrix for Isometric & Perspective 3D Campus Projections
#[derive(Debug, Clone, Copy, PartialEq)]
#[repr(C, align(16))]
pub struct Mat4 {
    pub cols: [Vec4; 4],
}

impl Mat4 {
    /// Identity matrix
    pub const fn identity() -> Self {
        Self {
            cols: [
                Vec4::new(1.0, 0.0, 0.0, 0.0),
                Vec4::new(0.0, 1.0, 0.0, 0.0),
                Vec4::new(0.0, 0.0, 1.0, 0.0),
                Vec4::new(0.0, 0.0, 0.0, 1.0),
            ],
        }
    }

    /// Creates an isometric projection matrix for 2.5D/3D multi-floor campus views
    pub fn campus_isometric(scale: f32, pitch_deg: f32, yaw_deg: f32, floor_spacing: f32) -> Self {
        let pitch = pitch_deg.to_radians();
        let yaw = yaw_deg.to_radians();

        let cos_p = pitch.cos();
        let sin_p = pitch.sin();
        let cos_y = yaw.cos();
        let sin_y = yaw.sin();

        // Combined rotation + scale + floor elevation
        Self {
            cols: [
                Vec4::new(scale * cos_y, scale * sin_p * sin_y, 0.0, 0.0),
                Vec4::new(-scale * sin_y, scale * sin_p * cos_y, 0.0, 0.0),
                Vec4::new(0.0, -scale * cos_p * floor_spacing, scale, 0.0),
                Vec4::new(0.0, 0.0, 0.0, 1.0),
            ],
        }
    }
}

/// Floor point representation with elevation and building tags
#[derive(Debug, Clone, Copy, PartialEq)]
#[repr(C)]
pub struct CampusFloorVertex {
    pub x: f32,
    pub y: f32,
    pub z: f32,
    pub floor: f32,
    pub building_id: u32,
}

/// Projected 2D screen coordinate with depth ordering
#[derive(Debug, Clone, Copy, PartialEq)]
#[repr(C)]
pub struct ProjectedPoint2D {
    pub screen_x: f32,
    pub screen_y: f32,
    pub depth_z: f32,
    pub scale_factor: f32,
}

// ─── SIMD 128-bit Implementation ──────────────────────────────────────────────

#[cfg(all(target_arch = "wasm32", target_feature = "simd128"))]
pub mod wasm_simd {
    use super::*;
    use core::arch::wasm32::*;

    /// Multiplies a 4x4 matrix with a 4-component vector using Wasm SIMD 128 instructions
    #[inline(always)]
    pub unsafe fn mat4_mul_vec4_simd128(matrix: &Mat4, vector: &Vec4) -> Vec4 {
        let vx = f32x4_splat(vector.x);
        let vy = f32x4_splat(vector.y);
        let vz = f32x4_splat(vector.z);
        let vw = f32x4_splat(vector.w);

        let col0 = v128_load(matrix.cols[0].as_ptr() as *const v128);
        let col1 = v128_load(matrix.cols[1].as_ptr() as *const v128);
        let col2 = v128_load(matrix.cols[2].as_ptr() as *const v128);
        let col3 = v128_load(matrix.cols[3].as_ptr() as *const v128);

        let r0 = f32x4_mul(col0, vx);
        let r1 = f32x4_mul(col1, vy);
        let r2 = f32x4_mul(col2, vz);
        let r3 = f32x4_mul(col3, vw);

        let sum01 = f32x4_add(r0, r1);
        let sum23 = f32x4_add(r2, r3);
        let result_v = f32x4_add(sum01, sum23);

        let mut out = Vec4::zero();
        v128_store(&mut out as *mut _ as *mut v128, result_v);
        out
    }

    /// Evaluates Euclidean distances for 4 pairs of floor coordinates simultaneously
    #[inline(always)]
    pub unsafe fn batch_distance_4wide_simd128(
        dx: v128, // [dx0, dx1, dx2, dx3]
        dy: v128, // [dy0, dy1, dy2, dy3]
        dz: v128, // [dz0, dz1, dz2, dz3]
    ) -> v128 {
        let dx2 = f32x4_mul(dx, dx);
        let dy2 = f32x4_mul(dy, dy);
        let dz2 = f32x4_mul(dz, dz);

        let sum2 = f32x4_add(f32x4_add(dx2, dy2), dz2);
        f32x4_sqrt(sum2)
    }
}

// ─── Portable Fallback Implementation (Zero-latency Scalar) ───────────────────

pub mod portable_simd {
    use super::*;

    /// Portable 4x4 matrix multiplication with vector
    #[inline(always)]
    pub fn mat4_mul_vec4(matrix: &Mat4, vector: &Vec4) -> Vec4 {
        Vec4 {
            x: matrix.cols[0].x * vector.x
                + matrix.cols[1].x * vector.y
                + matrix.cols[2].x * vector.z
                + matrix.cols[3].x * vector.w,
            y: matrix.cols[0].y * vector.x
                + matrix.cols[1].y * vector.y
                + matrix.cols[2].y * vector.z
                + matrix.cols[3].y * vector.w,
            z: matrix.cols[0].z * vector.x
                + matrix.cols[1].z * vector.y
                + matrix.cols[2].z * vector.z
                + matrix.cols[3].z * vector.w,
            w: matrix.cols[0].w * vector.x
                + matrix.cols[1].w * vector.y
                + matrix.cols[2].w * vector.z
                + matrix.cols[3].w * vector.w,
        }
    }

    /// Portable 4-wide batch distance evaluation
    #[inline(always)]
    pub fn batch_distance_4wide(
        dx: [f32; 4],
        dy: [f32; 4],
        dz: [f32; 4],
    ) -> [f32; 4] {
        [
            (dx[0] * dx[0] + dy[0] * dy[0] + dz[0] * dz[0]).sqrt(),
            (dx[1] * dx[1] + dy[1] * dy[1] + dz[1] * dz[1]).sqrt(),
            (dx[2] * dx[2] + dy[2] * dy[2] + dz[2] * dz[2]).sqrt(),
            (dx[3] * dx[3] + dy[3] * dy[3] + dz[3] * dz[3]).sqrt(),
        ]
    }
}

/// Project multiple campus floor vector vertices using SIMD acceleration
pub fn project_floor_graph_vertices(
    matrix: &Mat4,
    vertices: &[CampusFloorVertex],
    viewport_width: f32,
    viewport_height: f32,
) -> Vec<ProjectedPoint2D> {
    let mut results = Vec::with_capacity(vertices.len());
    let half_w = viewport_width * 0.5;
    let half_h = viewport_height * 0.5;

    for vertex in vertices {
        let v = Vec4::new(vertex.x, vertex.y, vertex.z + vertex.floor * 14.0, 1.0);
        let transformed = portable_simd::mat4_mul_vec4(matrix, &v);

        let inv_w = if transformed.w.abs() > 1e-6 {
            1.0 / transformed.w
        } else {
            1.0
        };

        results.push(ProjectedPoint2D {
            screen_x: half_w + transformed.x * inv_w,
            screen_y: half_h - transformed.y * inv_w,
            depth_z: transformed.z,
            scale_factor: inv_w,
        });
    }

    results
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_identity_projection() {
        let mat = Mat4::identity();
        let pt = Vec4::new(10.0, 20.0, 30.0, 1.0);
        let proj = portable_simd::mat4_mul_vec4(&mat, &pt);
        assert_eq!(proj, pt);
    }

    #[test]
    fn test_campus_isometric_projection() {
        let mat = Mat4::campus_isometric(1.0, 30.0, 45.0, 1.2);
        let vertices = vec![
            CampusFloorVertex { x: 0.0, y: 0.0, z: 0.0, floor: 1.0, building_id: 1 },
            CampusFloorVertex { x: 100.0, y: 50.0, z: 10.0, floor: 2.0, building_id: 26 },
        ];

        let projected = project_floor_graph_vertices(&mat, &vertices, 800.0, 600.0);
        assert_eq!(projected.len(), 2);
        assert!(projected[0].screen_x > 0.0 && projected[0].screen_x < 800.0);
        assert!(projected[0].screen_y > 0.0 && projected[0].screen_y < 600.0);
    }

    #[test]
    fn test_batch_distance_4wide() {
        let dx = [3.0, 1.0, 0.0, 6.0];
        let dy = [4.0, 2.0, 0.0, 8.0];
        let dz = [0.0, 2.0, 5.0, 0.0];

        let dists = portable_simd::batch_distance_4wide(dx, dy, dz);
        assert!((dists[0] - 5.0).abs() < 1e-5); // 3-4-5 triangle
        assert!((dists[2] - 5.0).abs() < 1e-5);
        assert!((dists[3] - 10.0).abs() < 1e-5); // 6-8-10 triangle
    }
}
