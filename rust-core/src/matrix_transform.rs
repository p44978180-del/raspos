//! 4x4 Matrix Transformations and Isometric Camera Projections
//! Complements simd_projection.rs with full 3D transformation matrices.

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Matrix4x4 {
    pub m: [f32; 16],
}

impl Matrix4x4 {
    pub fn identity() -> Self {
        Self {
            m: [
                1.0, 0.0, 0.0, 0.0,
                0.0, 1.0, 0.0, 0.0,
                0.0, 0.0, 1.0, 0.0,
                0.0, 0.0, 0.0, 1.0,
            ],
        }
    }

    pub fn translation(tx: f32, ty: f32, tz: f32) -> Self {
        Self {
            m: [
                1.0, 0.0, 0.0, 0.0,
                0.0, 1.0, 0.0, 0.0,
                0.0, 0.0, 1.0, 0.0,
                tx,  ty,  tz,  1.0,
            ],
        }
    }

    pub fn multiply(&self, other: &Self) -> Self {
        let mut result = [0.0f32; 16];
        for row in 0..4 {
            for col in 0..4 {
                let mut sum = 0.0f32;
                for k in 0..4 {
                    sum += self.m[row * 4 + k] * other.m[k * 4 + col];
                }
                result[row * 4 + col] = sum;
            }
        }
        Self { m: result }
    }

    pub fn transform_point(&self, p: (f32, f32, f32)) -> (f32, f32, f32) {
        let x = p.0 * self.m[0] + p.1 * self.m[4] + p.2 * self.m[8] + self.m[12];
        let y = p.0 * self.m[1] + p.1 * self.m[5] + p.2 * self.m[9] + self.m[13];
        let z = p.0 * self.m[2] + p.1 * self.m[6] + p.2 * self.m[10] + self.m[14];
        let w = p.0 * self.m[3] + p.1 * self.m[7] + p.2 * self.m[11] + self.m[15];
        if w != 0.0 && w != 1.0 {
            (x / w, y / w, z / w)
        } else {
            (x, y, z)
        }
    }
}
