//! Binary CRDT Delta Compressor using Varints and Compact Bitmasks
//! Minimizes network overhead for mobile offline synchronization.

pub struct DeltaCompressor;

impl DeltaCompressor {
    pub fn encode_varint_u64(mut value: u64, buf: &mut Vec<u8>) {
        while value >= 0x80 {
            buf.push(((value & 0x7F) as u8) | 0x80);
            value >>= 7;
        }
        buf.push((value & 0x7F) as u8);
    }

    pub fn decode_varint_u64(slice: &[u8]) -> Option<(u64, usize)> {
        let mut result = 0u64;
        let mut shift = 0;
        for (i, &byte) in slice.iter().enumerate() {
            if shift >= 64 { return None; }
            result |= ((byte & 0x7F) as u64) << shift;
            if (byte & 0x80) == 0 {
                return Some((result, i + 1));
            }
            shift += 7;
        }
        None
    }
}
