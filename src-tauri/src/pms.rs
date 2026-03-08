/* ============================================================
   PMS BRIDGE — Practice Management System Integration
   Secure middleware that translates ClinicalFlow's JSON payload
   into the SQL schema of target PMS systems (Open Dental first).
   ============================================================ */

use serde::{Deserialize, Serialize};
use tauri::AppHandle;
use std::sync::Mutex;

/* ── Shared State ── */

#[derive(Default)]
pub struct PmsState {
    pub connected: Mutex<bool>,
    pub system: Mutex<String>,       // "opendental" | "dentrix" | "eaglesoft"
    pub last_error: Mutex<Option<String>>,
}

/* ── Data Structures ── */

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct PmsConfig {
    pub system: String,          // "opendental" | "dentrix" | "eaglesoft"
    pub host: String,            // e.g. "localhost" or "192.168.1.50"
    pub port: u16,               // e.g. 3306 for MySQL
    pub database: String,        // e.g. "opendental"
    pub username: String,
    pub password: String,        // encrypted at rest by frontend
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct PerioMeasurement {
    pub tooth_num: i32,
    pub site_index: i32,         // 0-5 (MB, B, DB, ML, L, DL)
    pub depth: i32,
    pub bop: bool,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct PerioExtra {
    pub tooth_num: i32,
    pub mobility: i32,
    pub furcation: i32,
    pub recession: i32,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ProcedureEntry {
    pub tooth_num: String,
    pub cdt_code: String,
    pub description: String,
    pub surfaces: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ClinicalPayload {
    pub patient_id: Option<i64>,       // PMS patient ID (if known)
    pub provider_id: Option<i64>,      // PMS provider ID (if known)
    pub note_text: String,             // Full clinical note
    pub procedures: Vec<ProcedureEntry>,
    pub perio_measurements: Vec<PerioMeasurement>,
    pub perio_extras: Vec<PerioExtra>,
    pub icd10_codes: Vec<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SyncResult {
    pub success: bool,
    pub rows_written: i32,
    pub message: String,
    pub details: Vec<String>,
}

/* ── Test Connection ── */

#[tauri::command]
pub async fn pms_test_connection(
    _app: AppHandle,
    config: PmsConfig,
    state: tauri::State<'_, PmsState>,
) -> Result<SyncResult, String> {
    tracing::info!("PMS: Testing connection to {} at {}:{}", config.system, config.host, config.port);

    match config.system.as_str() {
        "opendental" => {
            let result = _test_mysql_connection(&config).await;
            match &result {
                Ok(_) => {
                    *state.connected.lock().map_err(|e| format!("Lock poisoned: {}", e))? = true;
                    *state.system.lock().map_err(|e| format!("Lock poisoned: {}", e))? = config.system.clone();
                    *state.last_error.lock().map_err(|e| format!("Lock poisoned: {}", e))? = None;
                }
                Err(e) => {
                    *state.connected.lock().map_err(|e| format!("Lock poisoned: {}", e))? = false;
                    *state.last_error.lock().map_err(|e| format!("Lock poisoned: {}", e))? = Some(e.clone());
                }
            }
            result
        }
        other => Err(format!("PMS system '{}' is not yet supported. Open Dental is currently the only supported target.", other)),
    }
}

/* ── Sync Perio Data ── */

#[tauri::command]
pub async fn pms_sync_perio(
    _app: AppHandle,
    config: PmsConfig,
    payload: ClinicalPayload,
    state: tauri::State<'_, PmsState>,
) -> Result<SyncResult, String> {
    if !*state.connected.lock().map_err(|e| format!("Lock poisoned: {}", e))? {
        return Err("Not connected to PMS. Test connection first.".into());
    }

    tracing::info!("PMS: Syncing perio data — {} measurements, {} extras",
        payload.perio_measurements.len(), payload.perio_extras.len());

    match config.system.as_str() {
        "opendental" => _sync_opendental_perio(&config, &payload).await,
        other => Err(format!("PMS system '{}' sync not implemented", other)),
    }
}

/* ── Sync Procedures ── */

#[tauri::command]
pub async fn pms_sync_procedures(
    _app: AppHandle,
    config: PmsConfig,
    payload: ClinicalPayload,
    state: tauri::State<'_, PmsState>,
) -> Result<SyncResult, String> {
    if !*state.connected.lock().map_err(|e| format!("Lock poisoned: {}", e))? {
        return Err("Not connected to PMS. Test connection first.".into());
    }

    tracing::info!("PMS: Syncing {} procedures", payload.procedures.len());

    match config.system.as_str() {
        "opendental" => _sync_opendental_procedures(&config, &payload).await,
        other => Err(format!("PMS system '{}' sync not implemented", other)),
    }
}

/* ── Sync Clinical Note ── */

#[tauri::command]
pub async fn pms_sync_note(
    _app: AppHandle,
    config: PmsConfig,
    payload: ClinicalPayload,
    state: tauri::State<'_, PmsState>,
) -> Result<SyncResult, String> {
    if !*state.connected.lock().map_err(|e| format!("Lock poisoned: {}", e))? {
        return Err("Not connected to PMS. Test connection first.".into());
    }

    tracing::info!("PMS: Syncing clinical note ({} chars)", payload.note_text.len());

    match config.system.as_str() {
        "opendental" => _sync_opendental_note(&config, &payload).await,
        other => Err(format!("PMS system '{}' sync not implemented", other)),
    }
}

/* ── Full Sync (all data at once) ── */

#[tauri::command]
pub async fn pms_sync_all(
    _app: AppHandle,
    config: PmsConfig,
    payload: ClinicalPayload,
    state: tauri::State<'_, PmsState>,
) -> Result<SyncResult, String> {
    if !*state.connected.lock().map_err(|e| format!("Lock poisoned: {}", e))? {
        return Err("Not connected to PMS. Test connection first.".into());
    }

    tracing::info!("PMS: Full sync — perio + procedures + note");

    match config.system.as_str() {
        "opendental" => _sync_opendental_all(&config, &payload).await,
        other => Err(format!("PMS system '{}' sync not implemented", other)),
    }
}

/* ── Get connection status ── */

#[tauri::command]
pub async fn pms_status(
    state: tauri::State<'_, PmsState>,
) -> Result<serde_json::Value, String> {
    let connected = *state.connected.lock().map_err(|e| format!("Lock poisoned: {}", e))?;
    let system = state.system.lock().map_err(|e| format!("Lock poisoned: {}", e))?.clone();
    let last_error = state.last_error.lock().map_err(|e| format!("Lock poisoned: {}", e))?.clone();

    Ok(serde_json::json!({
        "connected": connected,
        "system": system,
        "last_error": last_error
    }))
}

/* ══════════════════════════════════════════════════════════════
   OPEN DENTAL — MySQL Bridge Implementation

   Open Dental uses MySQL/MariaDB with well-documented tables:
   - perio_measure: 6-point probing depths per tooth
   - perioexam: exam metadata (date, provider)
   - procedurelog: CDT procedures
   - procnote: clinical notes attached to procedures
   - commlog: general clinical communication log
   ══════════════════════════════════════════════════════════════ */

/// Percent-encode special characters in a MySQL URL component
fn url_encode_component(s: &str) -> String {
    let mut encoded = String::with_capacity(s.len());
    for c in s.chars() {
        match c {
            ':' | '/' | '@' | '?' | '#' | '%' | ' ' => {
                for b in c.to_string().as_bytes() {
                    encoded.push_str(&format!("%{:02X}", b));
                }
            }
            _ => encoded.push(c),
        }
    }
    encoded
}

/// Validate that the host is a reasonable hostname or IP, not a URL injection vector
fn validate_host(host: &str) -> Result<(), String> {
    if host.is_empty() {
        return Err("Host cannot be empty".to_string());
    }
    if host.contains('/') || host.contains('@') || host.contains('?') || host.contains('#') {
        return Err("Invalid characters in host".to_string());
    }
    if host.len() > 253 {
        return Err("Host too long".to_string());
    }
    Ok(())
}

async fn _build_mysql_url(config: &PmsConfig) -> Result<String, String> {
    validate_host(&config.host)?;
    Ok(format!(
        "mysql://{}:{}@{}:{}/{}",
        url_encode_component(&config.username),
        url_encode_component(&config.password),
        config.host,
        config.port,
        url_encode_component(&config.database),
    ))
}

async fn _test_mysql_connection(config: &PmsConfig) -> Result<SyncResult, String> {
    let url = _build_mysql_url(config).await?;

    let pool = mysql_async::Pool::new(url.as_str());
    let mut conn = pool.get_conn().await.map_err(|e| format!("Connection failed: {}", e))?;

    /* Verify this is actually an Open Dental database by checking for key tables */
    use mysql_async::prelude::*;
    let tables: Vec<String> = conn
        .query("SHOW TABLES LIKE 'perio%'")
        .await
        .map_err(|e| format!("Query failed: {}", e))?;

    let _ = pool.disconnect().await;

    if tables.iter().any(|t| t == "perioexam" || t == "periomeasure") {
        Ok(SyncResult {
            success: true,
            rows_written: 0,
            message: "Connected to Open Dental database successfully.".into(),
            details: vec![format!("Found {} perio-related tables", tables.len())],
        })
    } else {
        Err("Connected to MySQL but this does not appear to be an Open Dental database (perio tables not found).".into())
    }
}

async fn _sync_opendental_perio(config: &PmsConfig, payload: &ClinicalPayload) -> Result<SyncResult, String> {
    let url = _build_mysql_url(config).await?;
    let pool = mysql_async::Pool::new(url.as_str());
    let mut conn = pool.get_conn().await.map_err(|e| format!("Connection failed: {}", e))?;

    use mysql_async::prelude::*;

    let patient_id = payload.patient_id.unwrap_or(0);
    let provider_id = payload.provider_id.unwrap_or(0);

    /* 1. Create a new perioexam row */
    let now = chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string();
    conn.exec_drop(
        "INSERT INTO perioexam (PatNum, ExamDate, ProvNum, DateTMeasureEdit) VALUES (?, ?, ?, ?)",
        (patient_id, &now, provider_id, &now),
    ).await.map_err(|e| format!("Failed to create perio exam: {}", e))?;

    let exam_num: u64 = conn
        .query_first("SELECT LAST_INSERT_ID()")
        .await
        .map_err(|e| format!("Failed to get exam ID: {}", e))?
        .unwrap_or(0);

    /* 2. Insert perio_measure rows
       Open Dental periomeasure schema:
       PerioMeasureNum (auto), PerioExamNum, SequenceType (1=probing, 2=mobility,
       3=furcation, 4=gingival margin/recession, 5=mucogingival junction, 6=BOP),
       IntTooth, ToothValue (encoded: each site is 0-19, packed into positions) */
    let mut rows_written: i32 = 0;

    /* Group measurements by tooth */
    let mut tooth_depths: std::collections::HashMap<i32, Vec<(i32, i32, bool)>> = std::collections::HashMap::new();
    for m in &payload.perio_measurements {
        tooth_depths.entry(m.tooth_num).or_default().push((m.site_index, m.depth, m.bop));
    }

    for (tooth_num, sites) in &tooth_depths {
        /* Probing depths — SequenceType 1
           Open Dental packs 6 sites into MBvalue, Bvalue, DBvalue, MLvalue, Lvalue, DLvalue */
        let mut depth_vals = [0i32; 6];
        let mut bop_vals = [0i32; 6];
        for (idx, depth, bop) in sites {
            if *idx >= 0 && *idx < 6 {
                depth_vals[*idx as usize] = *depth;
                if *bop { bop_vals[*idx as usize] = 1; }
            }
        }

        /* Insert probing depth row */
        conn.exec_drop(
            "INSERT INTO periomeasure (PerioExamNum, SequenceType, IntTooth, MBvalue, Bvalue, DBvalue, MLvalue, Lvalue, DLvalue) VALUES (?, 1, ?, ?, ?, ?, ?, ?, ?)",
            (exam_num, tooth_num, depth_vals[0], depth_vals[1], depth_vals[2], depth_vals[3], depth_vals[4], depth_vals[5]),
        ).await.map_err(|e| format!("Failed to insert probing depth for tooth {}: {}", tooth_num, e))?;
        rows_written += 1;

        /* Insert BOP row if any bleeding — SequenceType 6 */
        if bop_vals.iter().any(|v| *v > 0) {
            conn.exec_drop(
                "INSERT INTO periomeasure (PerioExamNum, SequenceType, IntTooth, MBvalue, Bvalue, DBvalue, MLvalue, Lvalue, DLvalue) VALUES (?, 6, ?, ?, ?, ?, ?, ?, ?)",
                (exam_num, tooth_num, bop_vals[0], bop_vals[1], bop_vals[2], bop_vals[3], bop_vals[4], bop_vals[5]),
            ).await.map_err(|e| format!("Failed to insert BOP for tooth {}: {}", tooth_num, e))?;
            rows_written += 1;
        }
    }

    /* Insert mobility, furcation, recession from perio_extras */
    for extra in &payload.perio_extras {
        if extra.mobility > 0 {
            conn.exec_drop(
                "INSERT INTO periomeasure (PerioExamNum, SequenceType, IntTooth, MBvalue) VALUES (?, 2, ?, ?)",
                (exam_num, extra.tooth_num, extra.mobility),
            ).await.map_err(|e| format!("Failed to insert mobility for tooth {}: {}", extra.tooth_num, e))?;
            rows_written += 1;
        }
        if extra.furcation > 0 {
            conn.exec_drop(
                "INSERT INTO periomeasure (PerioExamNum, SequenceType, IntTooth, MBvalue) VALUES (?, 3, ?, ?)",
                (exam_num, extra.tooth_num, extra.furcation),
            ).await.map_err(|e| format!("Failed to insert furcation for tooth {}: {}", extra.tooth_num, e))?;
            rows_written += 1;
        }
        if extra.recession > 0 {
            conn.exec_drop(
                "INSERT INTO periomeasure (PerioExamNum, SequenceType, IntTooth, MBvalue, Bvalue, DBvalue, MLvalue, Lvalue, DLvalue) VALUES (?, 4, ?, ?, ?, ?, ?, ?, ?)",
                (exam_num, extra.tooth_num, extra.recession, extra.recession, extra.recession, extra.recession, extra.recession, extra.recession),
            ).await.map_err(|e| format!("Failed to insert recession for tooth {}: {}", extra.tooth_num, e))?;
            rows_written += 1;
        }
    }

    let _ = pool.disconnect().await;

    Ok(SyncResult {
        success: true,
        rows_written,
        message: format!("Perio exam #{} synced to Open Dental.", exam_num),
        details: vec![
            format!("{} teeth charted", tooth_depths.len()),
            format!("{} total measurement rows", rows_written),
        ],
    })
}

async fn _sync_opendental_procedures(config: &PmsConfig, payload: &ClinicalPayload) -> Result<SyncResult, String> {
    let url = _build_mysql_url(config).await?;
    let pool = mysql_async::Pool::new(url.as_str());
    let mut conn = pool.get_conn().await.map_err(|e| format!("Connection failed: {}", e))?;

    use mysql_async::prelude::*;

    let patient_id = payload.patient_id.unwrap_or(0);
    let provider_id = payload.provider_id.unwrap_or(0);
    let now = chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string();
    let mut rows_written: i32 = 0;

    for proc in &payload.procedures {
        let tooth_num: i32 = proc.tooth_num.parse().unwrap_or(0);
        let surf = proc.surfaces.clone().unwrap_or_default();

        /* Open Dental procedurelog: status 1 = Treatment Planned, 2 = Complete */
        conn.exec_drop(
            "INSERT INTO procedurelog (PatNum, ProcDate, ProcStatus, ToothNum, Surf, CodeNum, ProvNum, ProcNote) \
             SELECT ?, ?, 1, ?, ?, CodeNum, ?, ? FROM procedurecode WHERE ProcCode = ? LIMIT 1",
            (patient_id, &now, tooth_num, &surf, provider_id, &proc.description, &proc.cdt_code),
        ).await.map_err(|e| format!("Failed to insert procedure {}: {}", proc.cdt_code, e))?;
        rows_written += 1;
    }

    let _ = pool.disconnect().await;

    Ok(SyncResult {
        success: true,
        rows_written,
        message: format!("{} procedures synced to Open Dental as Treatment Planned.", rows_written),
        details: payload.procedures.iter().map(|p| format!("{} — Tooth #{}", p.cdt_code, p.tooth_num)).collect(),
    })
}

async fn _sync_opendental_note(config: &PmsConfig, payload: &ClinicalPayload) -> Result<SyncResult, String> {
    let url = _build_mysql_url(config).await?;
    let pool = mysql_async::Pool::new(url.as_str());
    let mut conn = pool.get_conn().await.map_err(|e| format!("Connection failed: {}", e))?;

    use mysql_async::prelude::*;

    let patient_id = payload.patient_id.unwrap_or(0);
    let now = chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string();

    /* Insert into commlog (communication log) — CommType 224 = clinical note */
    conn.exec_drop(
        "INSERT INTO commlog (PatNum, CommDateTime, CommType, Note, Mode_) VALUES (?, ?, 224, ?, 0)",
        (patient_id, &now, &payload.note_text),
    ).await.map_err(|e| format!("Failed to insert clinical note: {}", e))?;

    let _ = pool.disconnect().await;

    Ok(SyncResult {
        success: true,
        rows_written: 1,
        message: "Clinical note synced to Open Dental commlog.".into(),
        details: vec![format!("Note length: {} characters", payload.note_text.len())],
    })
}

async fn _sync_opendental_all(config: &PmsConfig, payload: &ClinicalPayload) -> Result<SyncResult, String> {
    let mut total_rows = 0;
    let mut all_details = Vec::new();

    /* Sync perio */
    if !payload.perio_measurements.is_empty() {
        let perio_result = _sync_opendental_perio(config, payload).await?;
        total_rows += perio_result.rows_written;
        all_details.extend(perio_result.details);
    }

    /* Sync procedures */
    if !payload.procedures.is_empty() {
        let proc_result = _sync_opendental_procedures(config, payload).await?;
        total_rows += proc_result.rows_written;
        all_details.extend(proc_result.details);
    }

    /* Sync note */
    if !payload.note_text.is_empty() {
        let note_result = _sync_opendental_note(config, payload).await?;
        total_rows += note_result.rows_written;
        all_details.extend(note_result.details);
    }

    Ok(SyncResult {
        success: true,
        rows_written: total_rows,
        message: format!("Full sync complete — {} total rows written to Open Dental.", total_rows),
        details: all_details,
    })
}
