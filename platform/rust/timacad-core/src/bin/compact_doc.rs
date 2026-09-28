use std::io::{self, Read, Write};

fn main() {
    let mut input = Vec::new();
    io::stdin().read_to_end(&mut input).expect("read document");
    let result = if input.starts_with(b"TMB1") {
        parse_batch(&input[4..]).and_then(|updates| timacad_core::compact_updates(&updates))
    } else { timacad_core::compact_doc(&input) };
    let compacted = result.unwrap_or_else(|err| {
        eprintln!("{err}");
        std::process::exit(1);
    });
    let mut output = Vec::with_capacity(8 + compacted.snapshot.len() + compacted.json_v4.len());
    output.extend_from_slice(&(compacted.snapshot.len() as u64).to_le_bytes());
    output.extend_from_slice(&compacted.snapshot);
    output.extend_from_slice(compacted.json_v4.as_bytes());
    io::stdout().write_all(&output).expect("write snapshot");
}

fn parse_batch(mut input: &[u8]) -> Result<Vec<Vec<u8>>, String> {
    if input.len() < 4 || input.len() > 64 * 1024 * 1024 { return Err("invalid compact batch size".into()); }
    let count = u32::from_le_bytes(input[..4].try_into().unwrap()) as usize;
    input = &input[4..];
    if count == 0 || count > 100_000 { return Err("invalid compact batch count".into()); }
    let mut updates = Vec::with_capacity(count);
    for _ in 0..count {
        if input.len() < 4 { return Err("truncated compact batch".into()); }
        let len = u32::from_le_bytes(input[..4].try_into().unwrap()) as usize;
        input = &input[4..];
        if len > input.len() { return Err("truncated compact update".into()); }
        updates.push(input[..len].to_vec());
        input = &input[len..];
    }
    if !input.is_empty() { return Err("trailing compact batch data".into()); }
    Ok(updates)
}
