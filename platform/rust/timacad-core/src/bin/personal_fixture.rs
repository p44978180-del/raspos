use std::io::{self, Write};

fn main() {
    let bytes = timacad_core::personal_fixture_bytes().unwrap_or_else(|err| {
        eprintln!("{err}");
        std::process::exit(1);
    });
    io::stdout().write_all(&bytes).expect("write fixture");
}
