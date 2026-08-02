use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};

pub const ACTIVITY_DB_FILE: &str = "activity.db";

const SCHEMA_VERSION: i64 = 1;

const KIND_WORK: &str = "work";
const KIND_BREAK: &str = "break";
const KIND_AWAY: &str = "away";

const STATUS_ACTIVE: &str = "active";
const STATUS_FINISHED: &str = "finished";

#[derive(Debug, PartialEq, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Activity {
    pub id: Option<i64>,
    pub name: String,
    pub category: String,
    pub tags: Vec<String>,
    pub parent_id: Option<i64>,
    pub log_enabled: bool,
    pub status: String,
    pub efficiency: Option<i64>,
    pub usefulness: Option<i64>,
    pub started_ms: i64,
    pub ended_ms: Option<i64>,
}

#[derive(Debug, PartialEq, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Block {
    pub id: Option<i64>,
    pub activity_id: Option<i64>,
    pub kind: String,
    pub start_ms: i64,
    pub end_ms: Option<i64>,
    pub timer_label: String,
}

#[derive(Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ActivityBlockRow {
    pub id: i64,
    pub activity_id: Option<i64>,
    pub kind: String,
    pub start_ms: i64,
    pub end_ms: Option<i64>,
    pub timer_label: String,
    pub activity_name: Option<String>,
    pub activity_category: Option<String>,
    pub tags: Option<Vec<String>>,
    pub status: Option<String>,
    pub efficiency: Option<i64>,
    pub usefulness: Option<i64>,
    pub log_enabled: Option<bool>,
}

#[derive(Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ActivitySummary {
    pub id: i64,
    pub name: String,
    pub category: String,
    pub status: String,
}

#[derive(Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Suggestions {
    pub categories: Vec<String>,
    pub activities: Vec<ActivitySummary>,
}

pub fn init(conn: &Connection) -> Result<(), String> {
    let version: i64 = conn
        .query_row("PRAGMA user_version", [], |row| row.get(0))
        .map_err(|e| e.to_string())?;
    if version < SCHEMA_VERSION {
        conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS activities (
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
             CREATE TABLE IF NOT EXISTS blocks (
               id INTEGER PRIMARY KEY AUTOINCREMENT,
               activity_id INTEGER NULL,
               kind TEXT NOT NULL,
               start_ms INTEGER NOT NULL,
               end_ms INTEGER NULL,
               timer_label TEXT NOT NULL
             );
             CREATE INDEX IF NOT EXISTS idx_blocks_start ON blocks(start_ms);",
        )
        .map_err(|e| e.to_string())?;
        conn.pragma_update(None, "user_version", SCHEMA_VERSION)
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

pub fn upsert_activity(conn: &mut Connection, activity: &Activity) -> Result<i64, String> {
    validate_activity(activity)?;
    let tags_json = serde_json::to_string(&activity.tags).map_err(|e| e.to_string())?;
    match activity.id {
        Some(id) => {
            let n = conn
                .execute(
                    "UPDATE activities SET name=?1, category=?2, tags=?3, parent_id=?4,
                     log_enabled=?5, status=?6, efficiency=?7, usefulness=?8,
                     started_ms=?9, ended_ms=?10 WHERE id=?11",
                    params![
                        activity.name,
                        activity.category,
                        tags_json,
                        activity.parent_id,
                        activity.log_enabled,
                        activity.status,
                        activity.efficiency,
                        activity.usefulness,
                        activity.started_ms,
                        activity.ended_ms,
                        id
                    ],
                )
                .map_err(|e| e.to_string())?;
            if n == 0 {
                return Err(format!("activity {id} not found"));
            }
            Ok(id)
        }
        None => {
            conn.execute(
                "INSERT INTO activities
                 (name, category, tags, parent_id, log_enabled, status, efficiency, usefulness, started_ms, ended_ms)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
                params![
                    activity.name,
                    activity.category,
                    tags_json,
                    activity.parent_id,
                    activity.log_enabled,
                    activity.status,
                    activity.efficiency,
                    activity.usefulness,
                    activity.started_ms,
                    activity.ended_ms
                ],
            )
            .map_err(|e| e.to_string())?;
            Ok(conn.last_insert_rowid())
        }
    }
}

pub fn open_block(conn: &mut Connection, block: &Block) -> Result<i64, String> {
    validate_kind(&block.kind)?;
    let activity_id = effective_activity_id(block)?;
    let owner: Option<String> = conn
        .query_row(
            "SELECT timer_label FROM blocks WHERE end_ms IS NULL",
            [],
            |row| row.get(0),
        )
        .optional()
        .map_err(|e| e.to_string())?;
    if let Some(label) = owner {
        return Err(format!("timer {label} already has an open block"));
    }
    conn.execute(
        "INSERT INTO blocks (activity_id, kind, start_ms, end_ms, timer_label)
         VALUES (?1, ?2, ?3, ?4, ?5)",
        params![
            activity_id,
            block.kind,
            block.start_ms,
            block.end_ms,
            block.timer_label
        ],
    )
    .map_err(|e| e.to_string())?;
    Ok(conn.last_insert_rowid())
}

pub fn close_block(conn: &mut Connection, timer_label: &str, end_ms: i64) -> Result<Option<i64>, String> {
    let open: Option<(i64, i64)> = conn
        .query_row(
            "SELECT id, start_ms FROM blocks WHERE timer_label=?1 AND end_ms IS NULL",
            params![timer_label],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .optional()
        .map_err(|e| e.to_string())?;
    let Some((id, start_ms)) = open else {
        return Ok(None);
    };
    if end_ms < start_ms {
        return Err(format!("end_ms {end_ms} before start_ms {start_ms}"));
    }
    conn.execute(
        "UPDATE blocks SET end_ms=?1 WHERE id=?2",
        params![end_ms, id],
    )
    .map_err(|e| e.to_string())?;
    Ok(Some(id))
}

pub fn finish_activity(
    conn: &mut Connection,
    activity_id: i64,
    efficiency: Option<i64>,
    usefulness: Option<i64>,
    ended_ms: i64,
) -> Result<(), String> {
    validate_rating("efficiency", efficiency)?;
    validate_rating("usefulness", usefulness)?;
    let n = conn
        .execute(
            "UPDATE activities SET status=?1, efficiency=?2, usefulness=?3, ended_ms=?4 WHERE id=?5",
            params![STATUS_FINISHED, efficiency, usefulness, ended_ms, activity_id],
        )
        .map_err(|e| e.to_string())?;
    if n == 0 {
        return Err(format!("activity {activity_id} not found"));
    }
    Ok(())
}

pub fn update_block(conn: &mut Connection, block: &Block) -> Result<(), String> {
    let id = block
        .id
        .ok_or_else(|| "block id is required for update".to_string())?;
    validate_kind(&block.kind)?;
    let activity_id = effective_activity_id(block)?;
    if let Some(end) = block.end_ms {
        if end < block.start_ms {
            return Err(format!("end_ms {end} before start_ms {}", block.start_ms));
        }
    }
    let n = conn
        .execute(
            "UPDATE blocks SET activity_id=?1, kind=?2, start_ms=?3, end_ms=?4, timer_label=?5 WHERE id=?6",
            params![
                activity_id,
                block.kind,
                block.start_ms,
                block.end_ms,
                block.timer_label,
                id
            ],
        )
        .map_err(|e| e.to_string())?;
    if n == 0 {
        return Err(format!("block {id} not found"));
    }
    Ok(())
}

pub fn delete_block(conn: &mut Connection, id: i64) -> Result<(), String> {
    conn.execute("DELETE FROM blocks WHERE id=?1", params![id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

pub fn delete_activity(conn: &mut Connection, id: i64) -> Result<(), String> {
    conn.execute("DELETE FROM blocks WHERE activity_id=?1", params![id])
        .map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM activities WHERE id=?1", params![id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

fn row_to_activity_block(row: &rusqlite::Row) -> rusqlite::Result<ActivityBlockRow> {
    let tags_json: Option<String> = row.get(8)?;
    let tags = tags_json.map(|t| serde_json::from_str::<Vec<String>>(&t).unwrap_or_default());
    Ok(ActivityBlockRow {
        id: row.get(0)?,
        activity_id: row.get(1)?,
        kind: row.get(2)?,
        start_ms: row.get(3)?,
        end_ms: row.get(4)?,
        timer_label: row.get(5)?,
        activity_name: row.get(6)?,
        activity_category: row.get(7)?,
        tags,
        status: row.get(9)?,
        efficiency: row.get(10)?,
        usefulness: row.get(11)?,
        log_enabled: row.get(12)?,
    })
}

pub fn query_blocks(conn: &Connection, from_ms: i64, to_ms: i64) -> Result<Vec<ActivityBlockRow>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT b.id, b.activity_id, b.kind, b.start_ms, b.end_ms, b.timer_label,
                    a.name, a.category, a.tags, a.status, a.efficiency, a.usefulness, a.log_enabled
             FROM blocks b
             LEFT JOIN activities a ON a.id = b.activity_id
             WHERE b.start_ms < ?2 AND (b.end_ms IS NULL OR b.end_ms > ?1)
             ORDER BY b.start_ms, b.id",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![from_ms, to_ms], row_to_activity_block)
        .map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

pub fn get_open_block(conn: &Connection, timer_label: &str) -> Result<Option<ActivityBlockRow>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT b.id, b.activity_id, b.kind, b.start_ms, b.end_ms, b.timer_label,
                    a.name, a.category, a.tags, a.status, a.efficiency, a.usefulness, a.log_enabled
             FROM blocks b
             LEFT JOIN activities a ON a.id = b.activity_id
             WHERE b.timer_label = ?1 AND b.end_ms IS NULL
             ORDER BY b.id
             LIMIT 1",
        )
        .map_err(|e| e.to_string())?;
    let mut rows = stmt
        .query_map(params![timer_label], row_to_activity_block)
        .map_err(|e| e.to_string())?;
    rows.next().transpose().map_err(|e| e.to_string())
}

pub fn get_global_open_block(conn: &Connection) -> Result<Option<ActivityBlockRow>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT b.id, b.activity_id, b.kind, b.start_ms, b.end_ms, b.timer_label,
                    a.name, a.category, a.tags, a.status, a.efficiency, a.usefulness, a.log_enabled
             FROM blocks b
             LEFT JOIN activities a ON a.id = b.activity_id
             WHERE b.end_ms IS NULL
             ORDER BY b.id
             LIMIT 1",
        )
        .map_err(|e| e.to_string())?;
    let mut rows = stmt
        .query_map([], row_to_activity_block)
        .map_err(|e| e.to_string())?;
    rows.next().transpose().map_err(|e| e.to_string())
}

pub fn suggestions(conn: &Connection) -> Result<Suggestions, String> {
    let mut cat_stmt = conn
        .prepare("SELECT DISTINCT category FROM activities ORDER BY category")
        .map_err(|e| e.to_string())?;
    let categories = cat_stmt
        .query_map([], |row| row.get::<_, String>(0))
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    let mut act_stmt = conn
        .prepare(
            "SELECT id, name, category, status FROM activities ORDER BY started_ms DESC LIMIT 100",
        )
        .map_err(|e| e.to_string())?;
    let activities = act_stmt
        .query_map([], |row| {
            Ok(ActivitySummary {
                id: row.get(0)?,
                name: row.get(1)?,
                category: row.get(2)?,
                status: row.get(3)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    Ok(Suggestions {
        categories,
        activities,
    })
}

pub fn reconcile(conn: &mut Connection, cutoff_ms: i64) -> Result<usize, String> {
    let n = conn
        .execute(
            "UPDATE blocks SET end_ms = start_ms WHERE end_ms IS NULL AND start_ms < ?1",
            params![cutoff_ms],
        )
        .map_err(|e| e.to_string())?;
    Ok(n)
}

fn effective_activity_id(block: &Block) -> Result<Option<i64>, String> {
    match block.kind.as_str() {
        KIND_WORK => Ok(Some(
            block
                .activity_id
                .ok_or_else(|| "work block requires activity_id".to_string())?,
        )),
        _ => Ok(None),
    }
}

fn validate_activity(activity: &Activity) -> Result<(), String> {    if activity.name.trim().is_empty() {
        return Err("activity name must not be empty".to_string());
    }
    if activity.category.trim().is_empty() {
        return Err("activity category must not be empty".to_string());
    }
    validate_status(&activity.status)?;
    validate_rating("efficiency", activity.efficiency)?;
    validate_rating("usefulness", activity.usefulness)?;
    Ok(())
}

fn validate_status(status: &str) -> Result<(), String> {
    if status == STATUS_ACTIVE || status == STATUS_FINISHED {
        Ok(())
    } else {
        Err(format!("invalid status: {status}"))
    }
}

fn validate_kind(kind: &str) -> Result<(), String> {
    if kind == KIND_WORK || kind == KIND_BREAK || kind == KIND_AWAY {
        Ok(())
    } else {
        Err(format!("invalid block kind: {kind}"))
    }
}

fn validate_rating(name: &str, value: Option<i64>) -> Result<(), String> {
    match value {
        Some(v) if !(0..=100).contains(&v) => Err(format!("{name} rating {v} out of range 0..100")),
        _ => Ok(()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn db() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        init(&conn).unwrap();
        conn
    }

    fn activity(id: Option<i64>, name: &str, category: &str) -> Activity {
        Activity {
            id,
            name: name.to_string(),
            category: category.to_string(),
            tags: vec![],
            parent_id: None,
            log_enabled: true,
            status: STATUS_ACTIVE.to_string(),
            efficiency: None,
            usefulness: None,
            started_ms: 1_000,
            ended_ms: None,
        }
    }

    fn work_block(timer_label: &str, activity_id: Option<i64>, start: i64, end: Option<i64>) -> Block {
        Block {
            id: None,
            activity_id,
            kind: KIND_WORK.to_string(),
            start_ms: start,
            end_ms: end,
            timer_label: timer_label.to_string(),
        }
    }

    fn break_block(timer_label: &str, start: i64, end: Option<i64>) -> Block {
        Block {
            id: None,
            activity_id: None,
            kind: KIND_BREAK.to_string(),
            start_ms: start,
            end_ms: end,
            timer_label: timer_label.to_string(),
        }
    }

    #[test]
    fn init_creates_tables_and_is_idempotent() {
        let conn = db();
        let version: i64 = conn
            .query_row("PRAGMA user_version", [], |row| row.get(0))
            .unwrap();
        assert_eq!(version, SCHEMA_VERSION);
        init(&conn).unwrap();
    }

    #[test]
    fn upsert_insert_returns_increasing_ids() {
        let mut conn = db();
        let a1 = upsert_activity(&mut conn, &activity(None, "Парсер", "Работа")).unwrap();
        let a2 = upsert_activity(&mut conn, &activity(None, "Почта", "Работа")).unwrap();
        assert!(a2 > a1);
    }

    #[test]
    fn upsert_update_changes_fields_keeps_row_count() {
        let mut conn = db();
        let id = upsert_activity(&mut conn, &activity(None, "Парсер", "Работа")).unwrap();
        let mut edited = activity(Some(id), "Парсер v2", "Личное");
        edited.efficiency = Some(80);
        edited.tags = vec!["глубокий".to_string()];
        upsert_activity(&mut conn, &edited).unwrap();

        let rows = query_blocks(&conn, 0, 10_000).unwrap();
        assert_eq!(rows.len(), 0);
        let count: i64 = conn
            .query_row("SELECT COUNT(*) FROM activities", [], |row| row.get(0))
            .unwrap();
        assert_eq!(count, 1);
        let stored: (String, String, String, Option<i64>) = conn
            .query_row(
                "SELECT name, category, tags, efficiency FROM activities WHERE id=?1",
                params![id],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
            )
            .unwrap();
        assert_eq!(stored.0, "Парсер v2");
        assert_eq!(stored.1, "Личное");
        assert_eq!(stored.2, "[\"глубокий\"]");
        assert_eq!(stored.3, Some(80));
    }

    #[test]
    fn upsert_update_missing_id_errors() {
        let mut conn = db();
        let err = upsert_activity(&mut conn, &activity(Some(999), "X", "Y")).unwrap_err();
        assert!(err.contains("not found"));
    }

    #[test]
    fn upsert_rejects_empty_name_and_category() {
        let mut conn = db();
        assert!(upsert_activity(&mut conn, &activity(None, "  ", "Работа")).is_err());
        assert!(upsert_activity(&mut conn, &activity(None, "Парсер", "")).is_err());
    }

    #[test]
    fn upsert_rejects_bad_status_and_ratings() {
        let mut conn = db();
        let mut bad_status = activity(None, "X", "Y");
        bad_status.status = "weird".to_string();
        assert!(upsert_activity(&mut conn, &bad_status).is_err());

        let mut bad_eff = activity(None, "X", "Y");
        bad_eff.efficiency = Some(101);
        assert!(upsert_activity(&mut conn, &bad_eff).is_err());

        let mut bad_use = activity(None, "X", "Y");
        bad_use.usefulness = Some(-1);
        assert!(upsert_activity(&mut conn, &bad_use).is_err());
    }

    #[test]
    fn open_work_block_requires_activity() {
        let mut conn = db();
        let err = open_block(&mut conn, &work_block("timer-1", None, 0, None)).unwrap_err();
        assert!(err.contains("activity_id"));
    }

    #[test]
    fn open_break_block_forces_null_activity() {
        let mut conn = db();
        let id = upsert_activity(&mut conn, &activity(None, "Парсер", "Работа")).unwrap();
        let mut b = break_block("timer-1", 0, None);
        b.activity_id = Some(id);
        let block_id = open_block(&mut conn, &b).unwrap();
        let stored: Option<i64> = conn
            .query_row(
                "SELECT activity_id FROM blocks WHERE id=?1",
                params![block_id],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(stored, None);
    }

    #[test]
    fn open_second_block_same_label_errors() {
        let mut conn = db();
        let id = upsert_activity(&mut conn, &activity(None, "Парсер", "Работа")).unwrap();
        open_block(&mut conn, &work_block("timer-1", Some(id), 0, None)).unwrap();
        let err = open_block(&mut conn, &break_block("timer-1", 100, None)).unwrap_err();
        assert!(err.contains("open block"));
    }

    #[test]
    fn open_block_on_second_timer_while_another_has_open_block_errors() {
        let mut conn = db();
        let id = upsert_activity(&mut conn, &activity(None, "Парсер", "Работа")).unwrap();
        open_block(&mut conn, &work_block("timer-1", Some(id), 0, None)).unwrap();
        let err = open_block(&mut conn, &work_block("timer-2", Some(id), 100, None)).unwrap_err();
        assert!(err.contains("timer-1"));
        assert!(err.contains("open block"));
    }

    #[test]
    fn open_block_allowed_after_other_timer_closes() {
        let mut conn = db();
        let id = upsert_activity(&mut conn, &activity(None, "Парсер", "Работа")).unwrap();
        open_block(&mut conn, &work_block("timer-1", Some(id), 0, None)).unwrap();
        close_block(&mut conn, "timer-1", 50).unwrap();
        let b2 = open_block(&mut conn, &work_block("timer-2", Some(id), 100, None)).unwrap();
        let got = get_global_open_block(&conn).unwrap().unwrap();
        assert_eq!(got.id, b2);
        assert_eq!(got.timer_label, "timer-2");
    }

    #[test]
    fn get_global_open_block_returns_single_open_any_timer() {
        let mut conn = db();
        assert_eq!(get_global_open_block(&conn).unwrap(), None);
        let id = upsert_activity(&mut conn, &activity(None, "Парсер", "Работа")).unwrap();
        let b = open_block(&mut conn, &work_block("timer-1", Some(id), 0, None)).unwrap();
        let got = get_global_open_block(&conn).unwrap().unwrap();
        assert_eq!(got.id, b);
        assert_eq!(got.activity_name.as_deref(), Some("Парсер"));
        close_block(&mut conn, "timer-1", 50).unwrap();
        assert_eq!(get_global_open_block(&conn).unwrap(), None);
    }

    #[test]
    fn pause_break_block_replaces_work_within_same_timer() {
        let mut conn = db();
        let id = upsert_activity(&mut conn, &activity(None, "Парсер", "Работа")).unwrap();
        open_block(&mut conn, &work_block("timer-1", Some(id), 0, None)).unwrap();
        close_block(&mut conn, "timer-1", 50).unwrap();
        open_block(&mut conn, &break_block("timer-1", 50, None)).unwrap();
        let got = get_global_open_block(&conn).unwrap().unwrap();
        assert_eq!(got.kind, KIND_BREAK);
        assert_eq!(got.activity_id, None);
    }

    #[test]
    fn open_block_rejects_bad_kind() {
        let mut conn = db();
        let mut b = break_block("timer-1", 0, None);
        b.kind = "rest".to_string();
        assert!(open_block(&mut conn, &b).is_err());
    }

    #[test]
    fn close_block_closes_open_one_and_returns_id() {
        let mut conn = db();
        let id = upsert_activity(&mut conn, &activity(None, "Парсер", "Работа")).unwrap();
        let block_id = open_block(&mut conn, &work_block("timer-1", Some(id), 1_000, None)).unwrap();
        let closed = close_block(&mut conn, "timer-1", 5_000).unwrap();
        assert_eq!(closed, Some(block_id));
        let end: Option<i64> = conn
            .query_row(
                "SELECT end_ms FROM blocks WHERE id=?1",
                params![block_id],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(end, Some(5_000));
    }

    #[test]
    fn close_block_with_nothing_open_returns_none() {
        let mut conn = db();
        assert_eq!(close_block(&mut conn, "timer-1", 5_000).unwrap(), None);
    }

    #[test]
    fn close_block_end_before_start_errors() {
        let mut conn = db();
        let id = upsert_activity(&mut conn, &activity(None, "Парсер", "Работа")).unwrap();
        open_block(&mut conn, &work_block("timer-1", Some(id), 10_000, None)).unwrap();
        let err = close_block(&mut conn, "timer-1", 1_000).unwrap_err();
        assert!(err.contains("before start"));
    }

    #[test]
    fn finish_sets_status_ratings_and_ended() {
        let mut conn = db();
        let id = upsert_activity(&mut conn, &activity(None, "Парсер", "Работа")).unwrap();
        finish_activity(&mut conn, id, Some(80), Some(60), 9_000).unwrap();
        let (status, eff, useful, ended): (String, Option<i64>, Option<i64>, Option<i64>) = conn
            .query_row(
                "SELECT status, efficiency, usefulness, ended_ms FROM activities WHERE id=?1",
                params![id],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
            )
            .unwrap();
        assert_eq!(status, STATUS_FINISHED);
        assert_eq!((eff, useful, ended), (Some(80), Some(60), Some(9_000)));
    }

    #[test]
    fn finish_rejects_out_of_range_ratings() {
        let mut conn = db();
        let id = upsert_activity(&mut conn, &activity(None, "Парсер", "Работа")).unwrap();
        assert!(finish_activity(&mut conn, id, Some(150), None, 1).is_err());
        assert!(finish_activity(&mut conn, id, None, Some(-3), 1).is_err());
    }

    #[test]
    fn finish_missing_activity_errors() {
        let mut conn = db();
        assert!(finish_activity(&mut conn, 999, Some(1), None, 1).is_err());
    }

    #[test]
    fn query_filters_by_range_and_orders() {
        let mut conn = db();
        let id = upsert_activity(&mut conn, &activity(None, "Парсер", "Работа")).unwrap();
        let b1 = open_block(&mut conn, &work_block("timer-1", Some(id), 1_000, None)).unwrap();
        close_block(&mut conn, "timer-1", 2_000).unwrap();
        open_block(&mut conn, &work_block("timer-2", Some(id), 5_000, None)).unwrap();
        close_block(&mut conn, "timer-2", 6_000).unwrap();
        open_block(&mut conn, &work_block("timer-3", Some(id), 9_000, None)).unwrap();
        close_block(&mut conn, "timer-3", 10_000).unwrap();

        let inside = query_blocks(&conn, 4_000, 8_000).unwrap();
        assert_eq!(inside.len(), 1);
        assert_eq!(inside[0].id, b1 + 1);
    }

    #[test]
    fn query_joins_activity_fields_and_keeps_breaks_null() {
        let mut conn = db();
        let id = upsert_activity(&mut conn, &activity(None, "Парсер", "Работа")).unwrap();
        let work_id = open_block(&mut conn, &work_block("timer-1", Some(id), 1_000, None)).unwrap();
        close_block(&mut conn, "timer-1", 2_000).unwrap();
        open_block(&mut conn, &break_block("timer-1", 2_000, None)).unwrap();
        close_block(&mut conn, "timer-1", 3_000).unwrap();

        let rows = query_blocks(&conn, 0, 10_000).unwrap();
        assert_eq!(rows.len(), 2);

        let work = rows.iter().find(|r| r.id == work_id).unwrap();
        assert_eq!(work.activity_name.as_deref(), Some("Парсер"));
        assert_eq!(work.activity_category.as_deref(), Some("Работа"));
        assert_eq!(work.status.as_deref(), Some(STATUS_ACTIVE));

        let brk = rows.iter().find(|r| r.id != work_id).unwrap();
        assert_eq!(brk.kind, KIND_BREAK);
        assert_eq!(brk.activity_id, None);
        assert_eq!(brk.activity_name, None);
        assert_eq!(brk.efficiency, None);
    }

    #[test]
    fn query_includes_open_blocks() {
        let mut conn = db();
        let id = upsert_activity(&mut conn, &activity(None, "Парсер", "Работа")).unwrap();
        open_block(&mut conn, &work_block("timer-1", Some(id), 1_000, None)).unwrap();
        let rows = query_blocks(&conn, 0, 10_000).unwrap();
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0].end_ms, None);
    }

    #[test]
    fn suggestions_return_distinct_categories_and_activities() {
        let mut conn = db();
        upsert_activity(&mut conn, &activity(None, "Парсер", "Работа")).unwrap();
        upsert_activity(&mut conn, &activity(None, "Почта", "Работа")).unwrap();
        upsert_activity(&mut conn, &activity(None, "Тренировка", "Спорт")).unwrap();

        let s = suggestions(&conn).unwrap();
        assert_eq!(s.categories, vec!["Работа".to_string(), "Спорт".to_string()]);
        assert_eq!(s.activities.len(), 3);
        assert!(s.activities.iter().all(|a| a.name != "" && !a.category.is_empty()));
    }

    #[test]
    fn reconcile_closes_only_stale_open_blocks() {
        let mut conn = db();
        let id = upsert_activity(&mut conn, &activity(None, "Парсер", "Работа")).unwrap();
        let stale = open_block(&mut conn, &work_block("timer-1", Some(id), 1_000, None)).unwrap();
        close_block(&mut conn, "timer-1", 1_500).unwrap();
        let fresh = open_block(&mut conn, &work_block("timer-2", Some(id), 8_000, None)).unwrap();
        close_block(&mut conn, "timer-2", 8_500).unwrap();
        conn.execute(
            "INSERT INTO blocks (activity_id, kind, start_ms, end_ms, timer_label) VALUES (?1, 'work', ?2, NULL, 'timer-3')",
            params![id, 2_000],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO blocks (activity_id, kind, start_ms, end_ms, timer_label) VALUES (?1, 'work', ?2, NULL, 'timer-4')",
            params![id, 9_000],
        )
        .unwrap();

        let closed = reconcile(&mut conn, 5_000).unwrap();
        assert_eq!(closed, 1);

        let stale_end: Option<i64> = conn
            .query_row(
                "SELECT end_ms FROM blocks WHERE id=?1",
                params![stale],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(stale_end, Some(1_500));
        let fresh_end: Option<i64> = conn
            .query_row(
                "SELECT end_ms FROM blocks WHERE id=?1",
                params![fresh],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(fresh_end, Some(8_500));
        let legacy_stale_end: Option<i64> = conn
            .query_row(
                "SELECT end_ms FROM blocks WHERE timer_label='timer-3'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(legacy_stale_end, Some(2_000));
        let legacy_fresh_end: Option<i64> = conn
            .query_row(
                "SELECT end_ms FROM blocks WHERE timer_label='timer-4'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(legacy_fresh_end, None);
    }

    #[test]
    fn delete_block_removes_single_row() {
        let mut conn = db();
        let id = upsert_activity(&mut conn, &activity(None, "Парсер", "Работа")).unwrap();
        let b1 = open_block(&mut conn, &work_block("timer-1", Some(id), 1_000, None)).unwrap();
        close_block(&mut conn, "timer-1", 2_000).unwrap();
        let b2 = open_block(&mut conn, &work_block("timer-2", Some(id), 3_000, None)).unwrap();
        close_block(&mut conn, "timer-2", 4_000).unwrap();

        delete_block(&mut conn, b1).unwrap();
        let rows = query_blocks(&conn, 0, 10_000).unwrap();
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0].id, b2);
    }

    #[test]
    fn get_open_block_returns_none_when_closed_or_absent() {
        let mut conn = db();
        let id = upsert_activity(&mut conn, &activity(None, "Парсер", "Работа")).unwrap();
        open_block(&mut conn, &work_block("timer-1", Some(id), 1_000, None)).unwrap();
        close_block(&mut conn, "timer-1", 2_000).unwrap();

        assert_eq!(get_open_block(&conn, "timer-1").unwrap(), None);
        assert_eq!(get_open_block(&conn, "timer-9").unwrap(), None);
    }

    #[test]
    fn get_open_block_returns_joined_open_work_block() {
        let mut conn = db();
        let id = upsert_activity(&mut conn, &activity(None, "Парсер", "Работа")).unwrap();
        let bid = open_block(&mut conn, &work_block("timer-1", Some(id), 1_000, None)).unwrap();

        let got = get_open_block(&conn, "timer-1").unwrap().unwrap();
        assert_eq!(got.id, bid);
        assert_eq!(got.activity_id, Some(id));
        assert_eq!(got.kind, KIND_WORK);
        assert_eq!(got.end_ms, None);
        assert_eq!(got.activity_name.as_deref(), Some("Парсер"));
        assert_eq!(got.activity_category.as_deref(), Some("Работа"));
    }

    #[test]
    fn get_open_block_returns_open_break_with_null_activity() {
        let mut conn = db();
        let id = upsert_activity(&mut conn, &activity(None, "Парсер", "Работа")).unwrap();
        open_block(&mut conn, &work_block("timer-1", Some(id), 1_000, None)).unwrap();
        close_block(&mut conn, "timer-1", 2_000).unwrap();
        open_block(&mut conn, &break_block("timer-1", 2_000, None)).unwrap();

        let got = get_open_block(&conn, "timer-1").unwrap().unwrap();
        assert_eq!(got.kind, KIND_BREAK);
        assert_eq!(got.activity_id, None);
        assert_eq!(got.activity_name, None);
    }

    #[test]
    fn suggestions_include_activity_status() {
        let mut conn = db();
        upsert_activity(&mut conn, &activity(None, "Парсер", "Работа")).unwrap();
        let s = suggestions(&conn).unwrap();
        assert_eq!(s.activities.len(), 1);
        assert_eq!(s.activities[0].status, STATUS_ACTIVE);
    }

    #[test]
    fn delete_activity_cascades_blocks() {
        let mut conn = db();
        let id = upsert_activity(&mut conn, &activity(None, "Парсер", "Работа")).unwrap();
        open_block(&mut conn, &work_block("timer-1", Some(id), 1_000, None)).unwrap();
        close_block(&mut conn, "timer-1", 2_000).unwrap();

        delete_activity(&mut conn, id).unwrap();
        assert_eq!(query_blocks(&conn, 0, 10_000).unwrap().len(), 0);
        let count: i64 = conn
            .query_row("SELECT COUNT(*) FROM activities", [], |row| row.get(0))
            .unwrap();
        assert_eq!(count, 0);
    }

    #[test]
    fn update_block_changes_times_and_kind() {
        let mut conn = db();
        let id = upsert_activity(&mut conn, &activity(None, "Парсер", "Работа")).unwrap();
        let b = open_block(&mut conn, &work_block("timer-1", Some(id), 1_000, None)).unwrap();
        close_block(&mut conn, "timer-1", 2_000).unwrap();

        let mut edited = work_block("timer-1", Some(id), 1_500, Some(2_500));
        edited.id = Some(b);
        update_block(&mut conn, &edited).unwrap();

        let rows = query_blocks(&conn, 0, 10_000).unwrap();
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0].start_ms, 1_500);
        assert_eq!(rows[0].end_ms, Some(2_500));
    }

    #[test]
    fn update_block_validates_id_kind_and_times() {
        let mut conn = db();
        let id = upsert_activity(&mut conn, &activity(None, "Парсер", "Работа")).unwrap();
        let b = open_block(&mut conn, &work_block("timer-1", Some(id), 1_000, None)).unwrap();

        let no_id = work_block("timer-1", Some(id), 1_000, Some(2_000));
        assert!(update_block(&mut conn, &no_id).is_err());

        let mut bad_end = work_block("timer-1", Some(id), 5_000, Some(2_000));
        bad_end.id = Some(b);
        assert!(update_block(&mut conn, &bad_end).is_err());

        let mut missing = work_block("timer-1", Some(id), 1_000, Some(2_000));
        missing.id = Some(999);
        assert!(update_block(&mut conn, &missing).is_err());
    }
}
