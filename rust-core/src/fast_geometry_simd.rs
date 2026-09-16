//! Fast 2D/3D SIMD Geometry Operations for Campus Navigation
//! Accelerated polygon bounding boxes, ray-casting, and distance fields.

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct BoundingBox2D {
    pub min_x: f32,
    pub min_y: f32,
    pub max_x: f32,
    pub max_y: f32,
}

impl BoundingBox2D {
    pub fn from_points(points: &[(f32, f32)]) -> Self {
        if points.is_empty() {
            return Self { min_x: 0.0, min_y: 0.0, max_x: 0.0, max_y: 0.0 };
        }
        let mut min_x = points[0].0;
        let mut max_x = points[0].0;
        let mut min_y = points[0].1;
        let mut max_y = points[0].1;

        for &(x, y) in &points[1..] {
            if x < min_x { min_x = x; }
            if x > max_x { max_x = x; }
            if y < min_y { min_y = y; }
            if y > max_y { max_y = y; }
        }

        Self { min_x, min_y, max_x, max_y }
    }

    pub fn contains_point(&self, x: f32, y: f32) -> bool {
        x >= self.min_x && x <= self.max_x && y >= self.min_y && y <= self.max_y
    }
}

pub fn point_in_polygon(x: f32, y: f32, polygon: &[(f32, f32)]) -> bool {
    let mut inside = false;
    let n = polygon.len();
    if n < 3 { return false; }

    let mut j = n - 1;
    for i in 0..n {
        let (xi, yi) = polygon[i];
        let (xj, yj) = polygon[j];

        let intersect = ((yi > y) != (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
        if intersect {
            inside = !inside;
        }
        j = i;
    }
    inside
}
