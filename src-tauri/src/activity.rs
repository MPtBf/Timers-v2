use std::fmt;

use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};

pub const ACTIVITY_DB_FILE: &str = "activity.db";

const SCHEMA_VERSION: i64 = 2;

const KIND_WORK: &str = "work";

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Block {
    pub id: i64,
    pub name: String,
    pub start_ms: i64,
    pub end_ms: Option<i64>,
}

#[derive(Debug)]
pub enum BlockError {
    Database(rusqlite::Error),
    InvalidName,
    InvalidEnd { start_ms: i64, end_ms: i64 },
    InvalidQueryRange { from_ms: i64, to_ms: i64 },
    AlreadyOpen { existing_id: i64 },
    Overlap { existing_id: i64 },
    NotFound { id: i64 },
    Migration(String),
    UnsupportedSchema { version: i64 },
}

impl fmt::Display for BlockError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            BlockError::Database(e) => write!(f, "database_error: {e}"),
            BlockError::InvalidName => write!(f, "invalid_name"),
            BlockError::InvalidEnd { start_ms, end_ms } => {
                write!(f, "invalid_end: end_ms {end_ms} before start_ms {start_ms}")
            }
            BlockError::InvalidQueryRange { from_ms, to_ms } => {
                write!(f, "invalid_query_range: from {from_ms} > to {to_ms}")
            }
            BlockError::AlreadyOpen { existing_id } => write!(f, "already_open: block {existing_id}"),
            BlockError::Overlap { existing_id } => write!(f, "overlap: block {existing_id}"),
            BlockError::NotFound { id } => write!(f, "block_not_found: {id}"),
            BlockError::Migration(msg) => write!(f, "migration_error: {msg}"),
            BlockError::UnsupportedSchema { version } => write!(f, "unsupported_schema: {version}"),
        }
    }
}

impl std::error::Error for BlockError {}

const CREATE_BLOCKS_TABLE: &str = "CREATE TABLE blocks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL CHECK (length(trim(name)) > 0),
  start_ms INTEGER NOT NULL,
  end_ms INTEGER NULL,
  CHECK (end_ms IS NULL OR end_ms >= start_ms)
)";

const CREATE_START_INDEX: &str = "CREATE INDEX idx_blocks_start ON blocks(start_ms)";

const CREATE_ONE_OPEN_INDEX: &str =
    "CREATE UNIQUE INDEX idx_blocks_one_open ON blocks((1)) WHERE end_ms IS NULL";

fn create_schema(conn: &Connection) -> Result<(), BlockError> {
    conn.execute_batch(CREATE_BLOCKS_TABLE)
        .map_err(BlockError::Database)?;
    create_indexes(conn)
}

fn create_indexes(conn: &Connection) -> Result<(), BlockError> {
    conn.execute_batch(CREATE_START_INDEX)
        .map_err(BlockError::Database)?;
    conn.execute_batch(CREATE_ONE_OPEN_INDEX)
        .map_err(BlockError::Database)?;
    Ok(())
}

/// Returns the current `PRAGMA user_version`, or 0 when unreadable.
fn user_version(conn: &Connection) -> Result<i64, BlockError> {
    conn.query_row("PRAGMA user_version", [], |row| row.get(0))
        .map_err(BlockError::Database)
}

fn set_user_version(conn: &Connection, version: i64) -> Result<(), BlockError> {
    conn.pragma_update(None, "user_version", version)
        .map_err(BlockError::Database)
}

pub fn init(conn: &mut Connection) -> Result<(), BlockError> {
    let version = user_version(conn)?;
    match version {
        0 => {
            create_schema(conn)?;
            set_user_version(conn, SCHEMA_VERSION)?;
            Ok(())
        }
        v if v == SCHEMA_VERSION => {
            validate_schema(conn)?;
            Ok(())
        }
        1 => migrate_v1(conn),
        other => Err(BlockError::UnsupportedSchema { version: other }),
    }
}

fn validate_schema(conn: &Connection) -> Result<(), BlockError> {
    let has_table: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='blocks'",
            [],
            |row| row.get(0),
        )
        .map_err(BlockError::Database)?;
    if has_table != 1 {
        return Err(BlockError::Migration(
            "blocks table missing in v2 schema".to_string(),
        ));
    }
    let has_index: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM sqlite_master WHERE type='index' AND name='idx_blocks_start'",
            [],
            |row| row.get(0),
        )
        .map_err(BlockError::Database)?;
    if has_index != 1 {
        return Err(BlockError::Migration(
            "idx_blocks_start missing in v2 schema".to_string(),
        ));
    }
    Ok(())
}

/// Migrates a legacy (version 1) `activities` + `blocks` schema to the v2 blocks-only schema.
///
/// Only closed `work` blocks with a non-blank resolved activity name are copied. Break/away
/// rows, open rows, orphaned rows, and blank-name rows are dropped. Rows whose `end_ms <
/// start_ms` violate the new CHECK constraint and abort the migration (the transaction rolls
/// back, leaving the legacy schema intact).
fn migrate_v1(conn: &mut Connection) -> Result<(), BlockError> {
    let tx = conn.transaction().map_err(BlockError::Database)?;

    tx.execute_batch(
        "CREATE TABLE blocks_new (
           id INTEGER PRIMARY KEY AUTOINCREMENT,
           name TEXT NOT NULL CHECK (length(trim(name)) > 0),
           start_ms INTEGER NOT NULL,
           end_ms INTEGER NULL,
           CHECK (end_ms IS NULL OR end_ms >= start_ms)
         )",
    )
    .map_err(|e| BlockError::Migration(e.to_string()))?;

    tx.execute(
        "INSERT INTO blocks_new (id, name, start_ms, end_ms)
         SELECT b.id, trim(a.name), b.start_ms, b.end_ms
         FROM blocks b
         JOIN activities a ON a.id = b.activity_id
         WHERE b.kind = ?1
           AND b.end_ms IS NOT NULL
           AND trim(a.name) <> ''",
        params![KIND_WORK],
    )
    .map_err(|e| BlockError::Migration(e.to_string()))?;

    tx.execute_batch("DROP TABLE blocks")
        .map_err(|e| BlockError::Migration(e.to_string()))?;
    tx.execute_batch("DROP TABLE activities")
        .map_err(|e| BlockError::Migration(e.to_string()))?;
    tx.execute_batch("ALTER TABLE blocks_new RENAME TO blocks")
        .map_err(|e| BlockError::Migration(e.to_string()))?;

    tx.execute_batch(CREATE_START_INDEX)
        .map_err(|e| BlockError::Migration(e.to_string()))?;
    tx.execute_batch(CREATE_ONE_OPEN_INDEX)
        .map_err(|e| BlockError::Migration(e.to_string()))?;

    tx.pragma_update(None, "user_version", SCHEMA_VERSION)
        .map_err(|e| BlockError::Migration(e.to_string()))?;
    tx.commit().map_err(BlockError::Database)?;
    Ok(())
}

fn is_open(conn: &Connection) -> Result<Option<i64>, BlockError> {
    conn.query_row("SELECT id FROM blocks WHERE end_ms IS NULL", [], |row| {
        row.get(0)
    })
    .optional()
    .map_err(BlockError::Database)
}

pub fn open_block(
    conn: &mut Connection,
    name: &str,
    start_ms: i64,
    end_ms: Option<i64>,
) -> Result<i64, BlockError> {
    let name = name.trim();
    if name.is_empty() {
        return Err(BlockError::InvalidName);
    }
    if let Some(end) = end_ms {
        if end < start_ms {
            return Err(BlockError::InvalidEnd { start_ms, end_ms: end });
        }
        if let Some(existing_id) = overlapping_block(conn, start_ms, end, None)? {
            return Err(BlockError::Overlap { existing_id });
        }
    }
    if end_ms.is_none() {
        if let Some(existing_id) = is_open(conn)? {
            return Err(BlockError::AlreadyOpen { existing_id });
        }
    }
    conn.execute(
        "INSERT INTO blocks (name, start_ms, end_ms) VALUES (?1, ?2, ?3)",
        params![name, start_ms, end_ms],
    )
    .map_err(|e| {
        // A pre-check race is closed by the unique one-open index.
        if is_constraint_violation(&e) {
            BlockError::AlreadyOpen { existing_id: 0 }
        } else {
            BlockError::Database(e)
        }
    })?;
    Ok(conn.last_insert_rowid())
}

fn overlapping_block(
    conn: &Connection,
    start_ms: i64,
    end_ms: i64,
    exclude_id: Option<i64>,
) -> Result<Option<i64>, BlockError> {
    let sql = match exclude_id {
        Some(_) => {
            "SELECT id FROM blocks
             WHERE id != ?4
               AND start_ms < ?2
               AND end_ms IS NOT NULL
               AND end_ms > ?3
               AND ?1 < end_ms"
        }
        None => {
            "SELECT id FROM blocks
             WHERE start_ms < ?2
               AND end_ms IS NOT NULL
               AND end_ms > ?3
               AND ?1 < end_ms"
        }
    };
    let mut stmt = conn.prepare(sql).map_err(BlockError::Database)?;
    let row = match exclude_id {
        Some(id) => stmt
            .query_row(params![start_ms, end_ms, start_ms, id], |row| row.get(0))
            .optional(),
        None => stmt
            .query_row(params![start_ms, end_ms, start_ms], |row| row.get(0))
            .optional(),
    }
    .map_err(BlockError::Database)?;
    Ok(row)
}

pub fn close_block(conn: &mut Connection, end_ms: i64) -> Result<Option<i64>, BlockError> {
    let Some((id, start_ms)) = conn
        .query_row(
            "SELECT id, start_ms FROM blocks WHERE end_ms IS NULL",
            [],
            |row| Ok((row.get::<_, i64>(0)?, row.get::<_, i64>(1)?)),
        )
        .optional()
        .map_err(BlockError::Database)?
    else {
        return Ok(None);
    };
    if end_ms < start_ms {
        return Err(BlockError::InvalidEnd { start_ms, end_ms });
    }
    conn.execute(
        "UPDATE blocks SET end_ms=?1 WHERE id=?2",
        params![end_ms, id],
    )
    .map_err(BlockError::Database)?;
    Ok(Some(id))
}

pub fn delete_block(conn: &mut Connection, id: i64) -> Result<(), BlockError> {
    let n = conn
        .execute("DELETE FROM blocks WHERE id=?1", params![id])
        .map_err(BlockError::Database)?;
    if n == 0 {
        return Err(BlockError::NotFound { id });
    }
    Ok(())
}

pub fn update_block(
    conn: &mut Connection,
    id: i64,
    name: &str,
    start_ms: i64,
    end_ms: Option<i64>,
) -> Result<(), BlockError> {
    let name = name.trim();
    if name.is_empty() {
        return Err(BlockError::InvalidName);
    }
    if let Some(end) = end_ms {
        if end < start_ms {
            return Err(BlockError::InvalidEnd { start_ms, end_ms: end });
        }
    }

    let exists: bool = conn
        .query_row(
            "SELECT EXISTS(SELECT 1 FROM blocks WHERE id=?1)",
            params![id],
            |row| row.get::<_, i64>(0),
        )
        .map_err(BlockError::Database)?
        != 0;
    if !exists {
        return Err(BlockError::NotFound { id });
    }

    if end_ms.is_none() {
        let other_open: Option<i64> = conn
            .query_row(
                "SELECT id FROM blocks WHERE end_ms IS NULL AND id != ?1",
                params![id],
                |row| row.get(0),
            )
            .optional()
            .map_err(BlockError::Database)?;
        if let Some(existing_id) = other_open {
            return Err(BlockError::AlreadyOpen { existing_id });
        }
    } else {
        let end = end_ms.unwrap();
        let overlap: Option<i64> = conn
            .query_row(
                "SELECT id FROM blocks
                 WHERE id != ?1
                   AND start_ms < ?2
                   AND end_ms IS NOT NULL
                   AND end_ms > ?3
                   AND ?3 < end_ms",
                params![id, end, start_ms],
                |row| row.get(0),
            )
            .optional()
            .map_err(BlockError::Database)?;
        if let Some(existing_id) = overlap {
            return Err(BlockError::Overlap { existing_id });
        }
    }

    conn.execute(
        "UPDATE blocks SET name=?1, start_ms=?2, end_ms=?3 WHERE id=?4",
        params![name, start_ms, end_ms, id],
    )
    .map_err(BlockError::Database)?;
    Ok(())
}

pub fn query_blocks(conn: &Connection, from_ms: i64, to_ms: i64) -> Result<Vec<Block>, BlockError> {
    if from_ms > to_ms {
        return Err(BlockError::InvalidQueryRange { from_ms, to_ms });
    }
    let mut stmt = conn
        .prepare(
            "SELECT id, name, start_ms, end_ms FROM blocks
             WHERE start_ms < ?2 AND (end_ms IS NULL OR end_ms > ?1)
             ORDER BY start_ms, id",
        )
        .map_err(BlockError::Database)?;
    let rows = stmt
        .query_map(params![from_ms, to_ms], |row| {
            Ok(Block {
                id: row.get(0)?,
                name: row.get(1)?,
                start_ms: row.get(2)?,
                end_ms: row.get(3)?,
            })
        })
        .map_err(BlockError::Database)?;
    rows.collect::<Result<Vec<_>, _>>().map_err(BlockError::Database)
}

pub fn suggestions(conn: &Connection) -> Result<Vec<String>, BlockError> {
    let mut stmt = conn
        .prepare("SELECT name FROM blocks GROUP BY name ORDER BY MAX(start_ms) DESC, name")
        .map_err(BlockError::Database)?;
    let names = stmt
        .query_map([], |row| row.get::<_, String>(0))
        .map_err(BlockError::Database)?;
    names.collect::<Result<Vec<_>, _>>().map_err(BlockError::Database)
}

pub fn reconcile(conn: &mut Connection) -> Result<usize, BlockError> {
    conn.execute("DELETE FROM blocks WHERE end_ms IS NULL", [])
        .map_err(BlockError::Database)
}

fn is_constraint_violation(e: &rusqlite::Error) -> bool {
    matches!(
        e,
        rusqlite::Error::SqliteFailure(err, _)
            if err.code == rusqlite::ErrorCode::ConstraintViolation
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    fn db() -> Connection {
        let mut conn = Connection::open_in_memory().unwrap();
        init(&mut conn).unwrap();
        conn
    }

    fn legacy_db() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(
            "CREATE TABLE activities (
               id INTEGER PRIMARY KEY AUTOINCREMENT,
               name TEXT NOT NULL,
               category TEXT NOT NULL,
               tags TEXT NOT NULL DEFAULT '[]',
               parent_id INTEGER NULL,
               log_enabled INTEGER NOT NULL DEFAULT 1,
               status TEXT NOT NULL DEFAULT 'active',
               efficiency INTEGER NULL,
               usefulness INTEGER NULL,
               started_ms INTEGER NOT NULL,
               ended_ms INTEGER NULL
             );
             CREATE TABLE blocks (
               id INTEGER PRIMARY KEY AUTOINCREMENT,
               activity_id INTEGER NULL,
               kind TEXT NOT NULL,
               start_ms INTEGER NOT NULL,
               end_ms INTEGER NULL,
               timer_label TEXT NOT NULL
             );
             PRAGMA user_version = 1;",
        )
        .unwrap();
        conn
    }

    #[test]
    fn init_creates_blocks_schema_and_sets_version() {
        let conn = db();
        let version: i64 = conn
            .query_row("PRAGMA user_version", [], |row| row.get(0))
            .unwrap();
        assert_eq!(version, SCHEMA_VERSION);

        let cols: Vec<String> = conn
            .prepare("PRAGMA table_info(blocks)")
            .unwrap()
            .query_map([], |row| row.get::<_, String>(1))
            .unwrap()
            .collect::<Result<_, _>>()
            .unwrap();
        assert_eq!(cols, vec!["id", "name", "start_ms", "end_ms"]);

        let idx: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM sqlite_master WHERE type='index' AND name='idx_blocks_start'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(idx, 1);
    }

    #[test]
    fn init_is_idempotent_on_v2() {
        let mut conn = db();
        init(&mut conn).unwrap();
        let version: i64 = conn
            .query_row("PRAGMA user_version", [], |row| row.get(0))
            .unwrap();
        assert_eq!(version, SCHEMA_VERSION);
    }

    #[test]
    fn init_rejects_unsupported_schema_version() {
        let conn = Connection::open_in_memory().unwrap();
        conn.pragma_update(None, "user_version", 99).unwrap();
        let mut conn = conn;
        match init(&mut conn) {
            Err(BlockError::UnsupportedSchema { version }) => assert_eq!(version, 99),
            other => panic!("expected unsupported schema, got {other:?}"),
        }
    }

    #[test]
    fn migrate_v1_copies_closed_work_blocks() {
        let mut conn = legacy_db();
        conn.execute(
            "INSERT INTO activities (id, name, category, started_ms) VALUES (1, 'Парсер', 'Работа', 0)",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO blocks (id, activity_id, kind, start_ms, end_ms, timer_label)
             VALUES (10, 1, 'work', 1000, 5000, 'timer-1')",
            [],
        )
        .unwrap();

        init(&mut conn).unwrap();

        let rows = query_blocks(&conn, 0, 10_000).unwrap();
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0].id, 10);
        assert_eq!(rows[0].name, "Парсер");
        assert_eq!(rows[0].start_ms, 1000);
        assert_eq!(rows[0].end_ms, Some(5000));
    }

    #[test]
    fn migrate_v1_drops_break_away_open_and_blank_rows() {
        let mut conn = legacy_db();
        conn.execute(
            "INSERT INTO activities (id, name, category, started_ms)
             VALUES (1, 'Парсер', 'Работа', 0), (2, '   ', 'Работа', 0)",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO blocks (id, activity_id, kind, start_ms, end_ms, timer_label)
             VALUES (1, 1, 'work', 1000, 2000, 't'),
                    (2, 1, 'break', 2000, 3000, 't'),
                    (3, 1, 'away', 3000, 4000, 't'),
                    (4, 1, 'work', 4000, NULL, 't'),
                    (5, 2, 'work', 5000, 6000, 't'),
                    (6, NULL, 'work', 6000, 7000, 't')",
            [],
        )
        .unwrap();

        init(&mut conn).unwrap();

        let rows = query_blocks(&conn, 0, 10_000).unwrap();
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0].id, 1);
    }

    #[test]
    fn migrate_v1_rolls_back_on_end_before_start() {
        let mut conn = legacy_db();
        conn.execute(
            "INSERT INTO activities (id, name, category, started_ms) VALUES (1, 'Парсер', 'Работа', 0)",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO blocks (id, activity_id, kind, start_ms, end_ms, timer_label)
             VALUES (1, 1, 'work', 5000, 1000, 't')",
            [],
        )
        .unwrap();

        assert!(init(&mut conn).is_err());

        // Legacy tables remain intact after rollback.
        let has_legacy: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='activities'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(has_legacy, 1);
    }

    #[test]
    fn open_block_inserts_and_returns_id() {
        let mut conn = db();
        let id = open_block(&mut conn, "Парсер", 1000, None).unwrap();
        assert!(id > 0);
        let stored: (String, i64, Option<i64>) = conn
            .query_row(
                "SELECT name, start_ms, end_ms FROM blocks WHERE id=?1",
                params![id],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
            )
            .unwrap();
        assert_eq!(stored, ("Парсер".to_string(), 1000, None));
    }

    #[test]
    fn open_block_trims_name() {
        let mut conn = db();
        let id = open_block(&mut conn, "  Парсер  ", 1000, None).unwrap();
        let name: String = conn
            .query_row("SELECT name FROM blocks WHERE id=?1", params![id], |row| {
                row.get(0)
            })
            .unwrap();
        assert_eq!(name, "Парсер");
    }

    #[test]
    fn open_block_rejects_empty_or_blank_name() {
        let mut conn = db();
        assert!(matches!(
            open_block(&mut conn, "", 1000, None),
            Err(BlockError::InvalidName)
        ));
        assert!(matches!(
            open_block(&mut conn, "   ", 1000, None),
            Err(BlockError::InvalidName)
        ));
    }

    #[test]
    fn open_block_rejects_second_open() {
        let mut conn = db();
        let first = open_block(&mut conn, "Парсер", 1000, None).unwrap();
        match open_block(&mut conn, "Почта", 2000, None) {
            Err(BlockError::AlreadyOpen { existing_id }) => assert_eq!(existing_id, first),
            other => panic!("expected already_open, got {other:?}"),
        }
    }

    #[test]
    fn open_block_with_explicit_end_creates_closed_block() {
        let mut conn = db();
        let id = open_block(&mut conn, "Еда", 6_600_000, Some(7_800_000)).unwrap();
        let stored: (String, i64, Option<i64>) = conn
            .query_row(
                "SELECT name, start_ms, end_ms FROM blocks WHERE id=?1",
                params![id],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
            )
            .unwrap();
        assert_eq!(stored, ("Еда".to_string(), 6_600_000, Some(7_800_000)));
    }

    #[test]
    fn open_block_with_end_does_not_conflict_with_open_block() {
        let mut conn = db();
        open_block(&mut conn, "Работа", 1_000, None).unwrap();
        // A closed block may be created even while another block is open.
        let id = open_block(&mut conn, "Еда", 6_600_000, Some(7_800_000)).unwrap();
        assert!(id > 0);
    }

    #[test]
    fn open_block_with_end_rejects_end_before_start() {
        let mut conn = db();
        assert!(matches!(
            open_block(&mut conn, "Еда", 7_800_000, Some(6_600_000)),
            Err(BlockError::InvalidEnd { .. })
        ));
    }

    #[test]
    fn open_block_with_end_rejects_overlap() {
        let mut conn = db();
        open_block(&mut conn, "A", 1_000, Some(3_000)).unwrap();
        assert!(matches!(
            open_block(&mut conn, "B", 2_000, Some(4_000)),
            Err(BlockError::Overlap { .. })
        ));
    }

    #[test]
    fn unique_index_blocks_second_open_at_db_level() {
        let mut conn = db();
        open_block(&mut conn, "Парсер", 1000, None).unwrap();
        let direct = conn.execute(
            "INSERT INTO blocks (name, start_ms, end_ms) VALUES ('X', 2000, NULL)",
            [],
        );
        assert!(direct.is_err());
    }

    #[test]
    fn check_constraint_rejects_end_before_start() {
        let conn = db();
        let direct = conn.execute(
            "INSERT INTO blocks (name, start_ms, end_ms) VALUES ('X', 5000, 1000)",
            [],
        );
        assert!(direct.is_err());
    }

    #[test]
    fn close_block_sets_end_and_returns_id() {
        let mut conn = db();
        let id = open_block(&mut conn, "Парсер", 1000, None).unwrap();
        let closed = close_block(&mut conn, 5000).unwrap();
        assert_eq!(closed, Some(id));
        let end: Option<i64> = conn
            .query_row("SELECT end_ms FROM blocks WHERE id=?1", params![id], |row| {
                row.get(0)
            })
            .unwrap();
        assert_eq!(end, Some(5000));
    }

    #[test]
    fn close_block_with_nothing_open_returns_none() {
        let mut conn = db();
        assert_eq!(close_block(&mut conn, 5000).unwrap(), None);
    }

    #[test]
    fn close_block_end_before_start_errors() {
        let mut conn = db();
        open_block(&mut conn, "Парсер", 10_000, None).unwrap();
        assert!(matches!(
            close_block(&mut conn, 1000),
            Err(BlockError::InvalidEnd { .. })
        ));
    }

    #[test]
    fn delete_block_removes_row() {
        let mut conn = db();
        let id = open_block(&mut conn, "Парсер", 1000, None).unwrap();
        close_block(&mut conn, 2000).unwrap();
        delete_block(&mut conn, id).unwrap();
        assert_eq!(query_blocks(&conn, 0, 10_000).unwrap().len(), 0);
    }

    #[test]
    fn delete_open_block_leaves_no_open_block() {
        let mut conn = db();
        let id = open_block(&mut conn, "Парсер", 1000, None).unwrap();
        delete_block(&mut conn, id).unwrap();
        assert_eq!(close_block(&mut conn, 2000).unwrap(), None);
    }

    #[test]
    fn delete_block_unknown_returns_not_found() {
        let mut conn = db();
        assert!(matches!(
            delete_block(&mut conn, 999),
            Err(BlockError::NotFound { id: 999 })
        ));
    }

    #[test]
    fn update_block_changes_name_and_times() {
        let mut conn = db();
        let id = open_block(&mut conn, "Парсер", 1000, None).unwrap();
        close_block(&mut conn, 2000).unwrap();
        update_block(&mut conn, id, "Парсер v2", 1500, Some(2500)).unwrap();
        let stored: (String, i64, Option<i64>) = conn
            .query_row(
                "SELECT name, start_ms, end_ms FROM blocks WHERE id=?1",
                params![id],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
            )
            .unwrap();
        assert_eq!(stored, ("Парсер v2".to_string(), 1500, Some(2500)));
    }

    #[test]
    fn update_block_rejects_empty_name() {
        let mut conn = db();
        let id = open_block(&mut conn, "Парсер", 1000, None).unwrap();
        close_block(&mut conn, 2000).unwrap();
        assert!(matches!(
            update_block(&mut conn, id, "  ", 1000, Some(2000)),
            Err(BlockError::InvalidName)
        ));
    }

    #[test]
    fn update_block_rejects_end_before_start() {
        let mut conn = db();
        let id = open_block(&mut conn, "Парсер", 1000, None).unwrap();
        close_block(&mut conn, 2000).unwrap();
        assert!(matches!(
            update_block(&mut conn, id, "Парсер", 5000, Some(2000)),
            Err(BlockError::InvalidEnd { .. })
        ));
    }

    #[test]
    fn update_block_rejects_unknown_id() {
        let mut conn = db();
        assert!(matches!(
            update_block(&mut conn, 999, "Парсер", 1000, Some(2000)),
            Err(BlockError::NotFound { id: 999 })
        ));
    }

    #[test]
    fn update_block_open_when_another_open_is_rejected() {
        let mut conn = db();
        open_block(&mut conn, "Парсер", 1000, None).unwrap();
        let second = open_block(&mut conn, "Почта", 2000, None);
        assert!(second.is_err());
        // close the single open and reopen a closed block as open
        close_block(&mut conn, 3000).unwrap();
        let closed = open_block(&mut conn, "Почта", 4000, None).unwrap();
        close_block(&mut conn, 5000).unwrap();
        // now try to make `closed` open while another is open
        let _other = open_block(&mut conn, "Другое", 6000, None).unwrap();
        assert!(matches!(
            update_block(&mut conn, closed, "Почта", 4000, None),
            Err(BlockError::AlreadyOpen { .. })
        ));
    }

    #[test]
    fn update_block_overlap_is_rejected() {
        let mut conn = db();
        let a = open_block(&mut conn, "A", 1000, None).unwrap();
        close_block(&mut conn, 3000).unwrap();
        let b = open_block(&mut conn, "B", 4000, None).unwrap();
        close_block(&mut conn, 6000).unwrap();

        // Try to extend B's start into A's range [1000,3000).
        assert!(matches!(
            update_block(&mut conn, b, "B", 2000, Some(6000)),
            Err(BlockError::Overlap { .. })
        ));
        let _ = a;
    }

    #[test]
    fn query_filters_by_half_open_range_and_orders() {
        let mut conn = db();
        let a = open_block(&mut conn, "A", 1000, None).unwrap();
        close_block(&mut conn, 2000).unwrap();
        let b = open_block(&mut conn, "B", 5000, None).unwrap();
        close_block(&mut conn, 6000).unwrap();
        let c = open_block(&mut conn, "C", 9000, None).unwrap();
        close_block(&mut conn, 10_000).unwrap();

        let inside = query_blocks(&conn, 4000, 8000).unwrap();
        assert_eq!(inside.len(), 1);
        assert_eq!(inside[0].id, b);
        let _ = (a, c);
    }

    #[test]
    fn query_includes_open_block_with_null_end() {
        let mut conn = db();
        open_block(&mut conn, "Парсер", 1000, None).unwrap();
        let rows = query_blocks(&conn, 0, 10_000).unwrap();
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0].end_ms, None);
    }

    #[test]
    fn query_rejects_inverted_range() {
        let conn = db();
        assert!(matches!(
            query_blocks(&conn, 5000, 1000),
            Err(BlockError::InvalidQueryRange { .. })
        ));
    }

    #[test]
    fn query_equal_range_returns_empty() {
        let mut conn = db();
        open_block(&mut conn, "Парсер", 1000, None).unwrap();
        close_block(&mut conn, 2000).unwrap();
        assert_eq!(query_blocks(&conn, 2000, 2000).unwrap().len(), 0);
    }

    #[test]
    fn suggestions_are_distinct_and_ordered_by_recency() {
        let mut conn = db();
        let a = open_block(&mut conn, "Парсер", 1000, None).unwrap();
        close_block(&mut conn, 2000).unwrap();
        let b = open_block(&mut conn, "Почта", 3000, None).unwrap();
        close_block(&mut conn, 4000).unwrap();
        let c = open_block(&mut conn, "Парсер", 5000, None).unwrap();
        close_block(&mut conn, 6000).unwrap();
        let _ = (a, b, c);

        let names = suggestions(&conn).unwrap();
        assert_eq!(names, vec!["Парсер".to_string(), "Почта".to_string()]);
    }

    #[test]
    fn reconcile_deletes_all_open_blocks() {
        let mut conn = db();
        open_block(&mut conn, "Парсер", 1000, None).unwrap();
        close_block(&mut conn, 2000).unwrap();
        open_block(&mut conn, "Почта", 3000, None).unwrap();

        let removed = reconcile(&mut conn).unwrap();
        assert_eq!(removed, 1);
        assert_eq!(query_blocks(&conn, 0, 10_000).unwrap().len(), 1);
    }

    #[test]
    fn reconcile_is_idempotent_and_keeps_closed() {
        let mut conn = db();
        open_block(&mut conn, "Парсер", 1000, None).unwrap();
        close_block(&mut conn, 2000).unwrap();

        assert_eq!(reconcile(&mut conn).unwrap(), 0);
        assert_eq!(query_blocks(&conn, 0, 10_000).unwrap().len(), 1);
    }
}
