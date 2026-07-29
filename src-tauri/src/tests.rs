#[cfg(test)]
mod tests {
    // Compile-time checks only.
    // Runtime tests require a real Tauri window, handled via E2E (Level 2).
    // The `windows` crate DLLs can't be resolved in `cargo test` on this toolchain.

    #[test]
    fn module_compiles() {
        assert!(true);
    }
}
