//! Desktop writes, the only ones the app makes outside its own data
//! directory, and each one asked for by the reader:
//!
//! - **Save a copy** of something the app made (a filled-in form, pages
//!   put together). The reader picks the place in the system's save
//!   dialog, opened from here; the web layer never names a path to
//!   write to, so the fs plugin stays read-only.
//! - **Rename** the document on show, in its own folder. The new name
//!   must be a plain file name of a document type the app opens, and
//!   another file of that name is never replaced.

use std::path::{Path, PathBuf};

use crate::error::{AppError, AppResult, ErrorKind};
use crate::open;

/// Longest file name most file systems take, in bytes.
const MAX_NAME: usize = 255;

/// Characters no file name may hold on Windows (and `/` anywhere).
const FORBIDDEN: &[char] = &['<', '>', ':', '"', '/', '\\', '|', '?', '*'];

/// Names Windows keeps for devices, with or without an extension.
const RESERVED: &[&str] = &[
    "con", "prn", "aux", "nul", "com1", "com2", "com3", "com4", "com5", "com6", "com7", "com8",
    "com9", "lpt1", "lpt2", "lpt3", "lpt4", "lpt5", "lpt6", "lpt7", "lpt8", "lpt9",
];

/// A new name for a file, checked: a plain name (no folder in it) that
/// every desktop system accepts.
pub fn valid_name(name: &str) -> AppResult<String> {
    let name = name.trim();
    let bad = |why: &str| Err(AppError::new(ErrorKind::InvalidName, why));
    if name.is_empty() || name == "." || name == ".." {
        return bad("empty name");
    }
    if name.len() > MAX_NAME {
        return bad("name too long");
    }
    if name.chars().any(|c| c.is_control() || FORBIDDEN.contains(&c)) {
        return bad("name has a character file names cannot hold");
    }
    // Windows drops a trailing dot or space without saying so.
    if name.ends_with('.') || name.ends_with(' ') {
        return bad("name ends with a dot or a space");
    }
    let stem = name.split('.').next().unwrap_or("").to_ascii_lowercase();
    if RESERVED.contains(&stem.as_str()) {
        return bad("name is kept by the system");
    }
    Ok(name.to_owned())
}

/// Rename the document at `path` to `new_name`, in the same folder.
/// Returns the new path.
pub fn rename(path: &str, new_name: &str) -> AppResult<PathBuf> {
    let from = open::validated(path)?;
    let name = valid_name(new_name)?;
    let folder = from
        .parent()
        .ok_or_else(|| AppError::new(ErrorKind::Path, "no folder"))?;
    let to = folder.join(&name);
    if !open::is_document(&to) {
        return Err(AppError::new(
            ErrorKind::InvalidName,
            "the name must keep a document's extension",
        ));
    }
    if to == from {
        return Ok(to);
    }
    // Another file already has the name. A change of case alone is the
    // same file on Windows and macOS, and is allowed.
    if to.exists() && !same_file(&from, &to) {
        return Err(AppError::new(ErrorKind::Exists, "a file has that name"));
    }
    std::fs::rename(&from, &to)?;
    Ok(to)
}

fn same_file(a: &Path, b: &Path) -> bool {
    match (a.canonicalize(), b.canonicalize()) {
        (Ok(x), Ok(y)) => x == y,
        _ => false,
    }
}

/// The extension of a suggested file name, for the dialog's filter.
pub fn extension_of(name: &str) -> Option<String> {
    Path::new(name)
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_ascii_lowercase())
        .filter(|e| !e.is_empty() && e.len() <= 8 && e.chars().all(|c| c.is_ascii_alphanumeric()))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    fn scratch(tag: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "paperwren-save-{tag}-{}",
            std::process::id()
        ));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn names_are_checked() {
        assert_eq!(valid_name("  Report 2026.pdf ").unwrap(), "Report 2026.pdf");
        for bad in ["", " ", "..", "a/b.pdf", "a\\b.pdf", "a:b.pdf", "x.pdf.", "nul.txt", "CON"] {
            assert!(valid_name(bad).is_err(), "{bad:?} should be refused");
        }
        assert!(valid_name(&"a".repeat(300)).is_err());
        assert!(valid_name("tab\there.pdf").is_err());
    }

    #[test]
    fn renames_in_place_and_never_replaces() {
        let dir = scratch("rename");
        let a = dir.join("first.pdf");
        let b = dir.join("taken.pdf");
        fs::write(&a, b"%PDF-1.4 a").unwrap();
        fs::write(&b, b"%PDF-1.4 b").unwrap();

        let err = rename(a.to_str().unwrap(), "taken.pdf").unwrap_err();
        assert_eq!(err.kind, ErrorKind::Exists);
        assert_eq!(fs::read(&b).unwrap(), b"%PDF-1.4 b");

        // A name without a document's extension, or one in another folder.
        assert!(rename(a.to_str().unwrap(), "first").is_err());
        assert!(rename(a.to_str().unwrap(), "../first.pdf").is_err());

        let to = rename(a.to_str().unwrap(), "Renamed.pdf").unwrap();
        assert_eq!(to, dir.join("Renamed.pdf"));
        assert!(!a.exists());
        assert_eq!(fs::read(&to).unwrap(), b"%PDF-1.4 a");
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn extension_for_the_dialog() {
        assert_eq!(extension_of("x.PDF").as_deref(), Some("pdf"));
        assert_eq!(extension_of("pages.zip").as_deref(), Some("zip"));
        assert_eq!(extension_of("noext"), None);
    }
}
