use std::io::{self, Read, Write};

fn main() {
    let mut input = Vec::new();
    io::stdin().read_to_end(&mut input).expect("read document");
    let compacted = timacad_core::compact_doc(&input).unwrap_or_else(|err| {
        eprintln!("{err}");
        std::process::exit(1);
    });
    let mut output = Vec::with_capacity(8 + compacted.snapshot.len() + compacted.json_v4.len());
    output.extend_from_slice(&(compacted.snapshot.len() as u64).to_le_bytes());
    output.extend_from_slice(&compacted.snapshot);
    output.extend_from_slice(compacted.json_v4.as_bytes());
    io::stdout().write_all(&output).expect("write snapshot");
}
