use base64::Engine;
use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use cpal::SampleFormat;
use hound::{WavSpec, WavWriter};
use serde::Serialize;
use std::io::BufWriter;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter, Manager, State};

// --- Constants ---

const MAX_SESSION_SAMPLES: u64 = 16000 * 60 * 60 * 4; // 4 hours at 16kHz
const DEFAULT_CHUNK_SAMPLES: usize = 16000 * 2; // 2 seconds at 16kHz
const MIN_CHUNK_SAMPLES: usize = 16000 * 2; // Floor: 2 seconds
const MAX_CHUNK_SAMPLES: usize = 16000 * 3; // Ceiling: 3 seconds (fallback)
const PERF_WINDOW_SIZE: usize = 10; // Rolling window for inference time tracking
const GROQ_CHUNK_SAMPLES: usize = 16000 * 4; // 4s chunks → 15 RPM (25% headroom under 20 RPM free tier)
const GROQ_API_URL: &str = "https://api.groq.com/openai/v1/audio/transcriptions";

// Groq limits prompt to 896 chars — condensed version of MEDICAL_PROMPT
const GROQ_MEDICAL_PROMPT: &str = "\
Medical clinical transcription. \
Meds: metformin, lisinopril, losartan, amlodipine, atorvastatin, omeprazole, gabapentin, \
hydrochlorothiazide, furosemide, prednisone, azithromycin, amoxicillin, ciprofloxacin, \
fluoxetine, sertraline, escitalopram, duloxetine, bupropion, alprazolam, lorazepam, \
oxycodone, hydrocodone, tramadol, warfarin, apixaban, insulin, levothyroxine, albuterol, \
fluticasone, montelukast, metoprolol. \
Dx: hypertension, atrial fibrillation, myocardial infarction, dyspnea, pneumonia, asthma, \
COPD, diabetes mellitus, hypothyroidism, osteoarthritis, neuropathy, radiculopathy, GERD, \
UTI, chronic kidney disease, anemia, fracture, syncope, migraine, stroke, TIA, DVT, \
pulmonary embolism, BPH. \
Dental: caries, periodontitis, gingivitis, root canal, crown, implant, extraction, \
periapical abscess. Labs: A1c, CBC, BMP, CMP, TSH, creatinine, eGFR.";

// --- Types ---

#[derive(Clone, Serialize)]
pub struct TranscriptChunk {
    pub text: String,
    pub is_partial: bool,
}

#[derive(Clone, Serialize)]
pub struct AudioDevice {
    pub name: String,
    pub id: String,
}

// cpal::Stream is !Send+!Sync but we only access it behind a Mutex
// and only on the main thread. This wrapper makes it usable in Tauri State.
struct StreamWrapper(#[allow(dead_code)] cpal::Stream);
unsafe impl Send for StreamWrapper {}
unsafe impl Sync for StreamWrapper {}

// --- Shared Recording State ---

pub struct RecordingState {
    is_recording: Arc<AtomicBool>,
    is_paused: Arc<AtomicBool>,
    chunk_buffer: Arc<Mutex<Vec<i16>>>,
    session_samples: Arc<Mutex<Vec<i16>>>,
    stream_handle: Arc<Mutex<Option<StreamWrapper>>>,
    whisper_task: Arc<Mutex<Option<tokio::task::JoinHandle<()>>>>,
    sample_rate: Arc<Mutex<u32>>,
    wav_writer: Arc<Mutex<Option<WavWriter<BufWriter<std::fs::File>>>>>,
    wav_path: Arc<Mutex<Option<String>>>,
    total_samples: Arc<Mutex<u64>>,
    pub whisper_server_process: Arc<Mutex<Option<std::process::Child>>>,
    whisper_server_port: Arc<Mutex<u16>>,
    whisper_language: Arc<Mutex<String>>,
    // Adaptive performance monitoring
    current_chunk_samples: Arc<AtomicU64>,
    inference_times: Arc<Mutex<Vec<f64>>>,
    // Recording mode tracking (for stop_recording final chunk routing)
    recording_mode: Arc<Mutex<String>>,
    groq_api_key: Arc<Mutex<String>>,
}

impl Default for RecordingState {
    fn default() -> Self {
        Self {
            is_recording: Arc::new(AtomicBool::new(false)),
            is_paused: Arc::new(AtomicBool::new(false)),
            chunk_buffer: Arc::new(Mutex::new(Vec::new())),
            session_samples: Arc::new(Mutex::new(Vec::new())),
            stream_handle: Arc::new(Mutex::new(None)),
            whisper_task: Arc::new(Mutex::new(None)),
            sample_rate: Arc::new(Mutex::new(16000)),
            wav_writer: Arc::new(Mutex::new(None)),
            wav_path: Arc::new(Mutex::new(None)),
            total_samples: Arc::new(Mutex::new(0)),
            whisper_server_process: Arc::new(Mutex::new(None)),
            whisper_server_port: Arc::new(Mutex::new(0)),
            whisper_language: Arc::new(Mutex::new("en".to_string())),
            current_chunk_samples: Arc::new(AtomicU64::new(DEFAULT_CHUNK_SAMPLES as u64)),
            inference_times: Arc::new(Mutex::new(Vec::with_capacity(PERF_WINDOW_SIZE))),
            recording_mode: Arc::new(Mutex::new(String::new())),
            groq_api_key: Arc::new(Mutex::new(String::new())),
        }
    }
}

// --- Helper: resample to 16kHz mono i16 ---

fn resample_to_16k_mono(samples: &[i16], source_rate: u32, channels: u16) -> Vec<i16> {
    // First: mix to mono if stereo
    let mono: Vec<i16> = if channels > 1 {
        samples
            .chunks(channels as usize)
            .map(|frame| {
                let sum: i32 = frame.iter().map(|&s| s as i32).sum();
                (sum / channels as i32) as i16
            })
            .collect()
    } else {
        samples.to_vec()
    };

    // Then: resample if needed
    if source_rate == 16000 {
        return mono;
    }

    let ratio = 16000.0 / source_rate as f64;
    let new_len = (mono.len() as f64 * ratio) as usize;
    let mut resampled = Vec::with_capacity(new_len);
    for i in 0..new_len {
        let src_idx = i as f64 / ratio;
        let idx = src_idx as usize;
        if idx + 1 < mono.len() {
            let frac = src_idx - idx as f64;
            let val = mono[idx] as f64 * (1.0 - frac) + mono[idx + 1] as f64 * frac;
            resampled.push(val as i16);
        } else if idx < mono.len() {
            resampled.push(mono[idx]);
        }
    }
    resampled
}

// --- Helper: write samples to WAV file (batch, used for temp chunks) ---

fn write_wav(path: &PathBuf, samples: &[i16], sample_rate: u32) -> Result<(), String> {
    let spec = WavSpec {
        channels: 1,
        sample_rate,
        bits_per_sample: 16,
        sample_format: hound::SampleFormat::Int,
    };
    let mut writer = WavWriter::create(path, spec).map_err(|e| e.to_string())?;
    for &s in samples {
        writer.write_sample(s).map_err(|e| e.to_string())?;
    }
    writer.finalize().map_err(|e| e.to_string())?;
    Ok(())
}

// --- Helper: start continuous WAV writer (streaming, crash-safe) ---

fn start_continuous_wav(output_path: &str, sample_rate: u32) -> Result<WavWriter<BufWriter<std::fs::File>>, String> {
    let spec = WavSpec {
        channels: 1,
        sample_rate,
        bits_per_sample: 16,
        sample_format: hound::SampleFormat::Int,
    };
    let file = std::fs::File::create(output_path)
        .map_err(|e| format!("Failed to create WAV file: {}", e))?;
    let buf_writer = BufWriter::new(file);
    WavWriter::new(buf_writer, spec)
        .map_err(|e| format!("Failed to create WAV writer: {}", e))
}

// --- Helper: find whisper model path ---

fn find_whisper_model(app: &AppHandle) -> Result<PathBuf, String> {
    // Check bundled resources first
    let resource_path = app
        .path()
        .resource_dir()
        .map_err(|e| e.to_string())?;

    // Try several possible model locations
    let exe_dir = std::env::current_exe()
        .ok()
        .and_then(|p| p.parent().map(|d| d.to_path_buf()));

    // Prefer large-v3-turbo — best accuracy-to-speed ratio for clinical use
    // Multilingual models (.bin) listed before English-only (.en.bin) for non-English support
    let model_names = [
        "ggml-large-v3-turbo.bin",
        "ggml-large-v3-turbo-q5_0.bin",
        "ggml-small.bin",
        "ggml-small.en.bin",
        "ggml-base.bin",
        "ggml-base.en.bin",
        "ggml-tiny.bin",
        "ggml-tiny.en.bin",
    ];

    let mut candidates: Vec<PathBuf> = Vec::new();
    for name in &model_names {
        candidates.push(resource_path.join(format!("resources/models/{}", name)));
        candidates.push(resource_path.join(format!("models/{}", name)));
    }

    // Dev mode: model may be relative to the src-tauri directory
    if let Ok(manifest_dir) = std::env::var("CARGO_MANIFEST_DIR") {
        for name in &model_names {
            candidates.push(PathBuf::from(&manifest_dir).join(format!("resources/models/{}", name)));
        }
    }

    // Also check relative to exe
    if let Some(ref exe) = exe_dir {
        for name in &model_names {
            candidates.push(exe.join(format!("../../src-tauri/resources/models/{}", name)));
            candidates.push(exe.join(format!("../resources/models/{}", name)));
        }
    }

    for path in &candidates {
        if path.exists() {
            return Ok(path.clone());
        }
    }

    // Fallback: check /tmp/whisper.cpp/models (dev mode)
    let dev_paths = [
        PathBuf::from("/tmp/whisper.cpp/models/ggml-large-v3-turbo.bin"),
        PathBuf::from("/tmp/whisper.cpp/models/ggml-large-v3-turbo-q5_0.bin"),
        PathBuf::from("/tmp/whisper.cpp/models/ggml-small.bin"),
        PathBuf::from("/tmp/whisper.cpp/models/ggml-small.en.bin"),
        PathBuf::from("/tmp/whisper.cpp/models/ggml-base.bin"),
        PathBuf::from("/tmp/whisper.cpp/models/ggml-base.en.bin"),
        PathBuf::from("/tmp/whisper.cpp/models/ggml-tiny.bin"),
        PathBuf::from("/tmp/whisper.cpp/models/ggml-tiny.en.bin"),
    ];
    for path in &dev_paths {
        if path.exists() {
            return Ok(path.clone());
        }
    }

    Err("No Whisper model found. Please place a ggml model in resources/models/".to_string())
}

// --- Helper: find whisper-cli binary (kept for potential CLI fallback) ---

#[allow(dead_code)]
fn find_whisper_binary(app: &AppHandle) -> Result<PathBuf, String> {
    // Check sidecar location (Tauri bundles it here)
    let resource_path = app
        .path()
        .resource_dir()
        .map_err(|e| e.to_string())?;

    // Sidecar binaries are placed next to the executable
    let exe_dir = std::env::current_exe()
        .map_err(|e| e.to_string())?
        .parent()
        .ok_or("Cannot get exe directory")?
        .to_path_buf();

    let candidates = [
        exe_dir.join("whisper-cli"),
        exe_dir.join("whisper-cli.exe"),
        resource_path.join("binaries/whisper-cli"),
        // Dev mode fallback
        PathBuf::from("/tmp/whisper.cpp/build/bin/whisper-cli"),
    ];

    for path in &candidates {
        if path.exists() {
            return Ok(path.clone());
        }
    }

    Err("whisper-cli binary not found. Please compile whisper.cpp and place the binary in src-tauri/binaries/".to_string())
}

// --- Helper: find whisper-server binary ---

fn find_whisper_server_binary(app: &AppHandle) -> Result<PathBuf, String> {
    let exe_dir = std::env::current_exe()
        .map_err(|e| e.to_string())?
        .parent()
        .ok_or("Cannot get exe directory")?
        .to_path_buf();

    let resource_path = app
        .path()
        .resource_dir()
        .map_err(|e| e.to_string())?;

    let candidates = [
        exe_dir.join("whisper-server"),
        exe_dir.join("whisper-server.exe"),
        resource_path.join("binaries/whisper-server"),
        PathBuf::from("/tmp/whisper.cpp/build/bin/whisper-server"),
    ];

    for path in &candidates {
        if path.exists() {
            return Ok(path.clone());
        }
    }

    Err("whisper-server binary not found. Please compile whisper.cpp server and place the binary in src-tauri/binaries/".to_string())
}

// --- Helper: find a free port for the whisper server ---

fn find_free_port() -> u16 {
    std::net::TcpListener::bind("127.0.0.1:0")
        .and_then(|listener| listener.local_addr())
        .map(|addr| addr.port())
        .unwrap_or(18080)
}

// --- Helper: start whisper-server process, wait for readiness ---

fn start_whisper_server(
    server_bin: &PathBuf,
    model_path: &PathBuf,
    port: u16,
    language: &str,
) -> Result<std::process::Child, String> {
    // Cap threads at 6 to avoid overwhelming E-cores on Apple Silicon
    let threads = std::thread::available_parallelism()
        .map(|n| n.get())
        .unwrap_or(8)
        .min(6)
        .max(4);

    tracing::info!(
        "[whisper-server] Starting on port {} with {} threads, lang={}, model: {:?}",
        port, threads, language, model_path
    );

    let child = std::process::Command::new(server_bin)
        .arg("-m")
        .arg(model_path)
        .arg("--port")
        .arg(port.to_string())
        .arg("--host")
        .arg("127.0.0.1")
        .arg("--no-timestamps")
        .arg("--flash-attn")
        .arg("--language")
        .arg(language)
        .arg("-t")
        .arg(threads.to_string())
        .arg("--prompt")
        .arg(MEDICAL_PROMPT)
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to start whisper-server: {}", e))?;

    Ok(child)
}

// --- Helper: wait for whisper-server to be ready (health check) ---

async fn wait_for_whisper_server(port: u16, timeout_secs: u64) -> Result<(), String> {
    let url = format!("http://127.0.0.1:{}/", port);
    let start = std::time::Instant::now();
    let timeout = std::time::Duration::from_secs(timeout_secs);

    loop {
        if start.elapsed() > timeout {
            return Err(format!(
                "whisper-server failed to start within {} seconds",
                timeout_secs
            ));
        }

        match reqwest::Client::new()
            .get(&url)
            .timeout(std::time::Duration::from_secs(2))
            .send()
            .await
        {
            Ok(resp) if resp.status().is_success() || resp.status().as_u16() == 200 => {
                tracing::info!(
                    "[whisper-server] Ready on port {} (took {:.1}s)",
                    port,
                    start.elapsed().as_secs_f64()
                );
                return Ok(());
            }
            _ => {
                tokio::time::sleep(tokio::time::Duration::from_millis(500)).await;
            }
        }
    }
}

// --- Helper: send WAV chunk to whisper-server via HTTP POST ---

async fn send_to_whisper_server(port: u16, wav_path: &PathBuf, language: &str) -> Result<String, String> {
    let wav_bytes = std::fs::read(wav_path)
        .map_err(|e| format!("Failed to read WAV file: {}", e))?;

    let part = reqwest::multipart::Part::bytes(wav_bytes)
        .file_name("chunk.wav")
        .mime_str("audio/wav")
        .map_err(|e| format!("Failed to create multipart: {}", e))?;

    let form = reqwest::multipart::Form::new()
        .part("file", part)
        .text("response_format", "text")
        .text("temperature", "0.0")
        .text("language", language.to_string());

    let url = format!("http://127.0.0.1:{}/inference", port);

    let resp = reqwest::Client::new()
        .post(&url)
        .multipart(form)
        .timeout(std::time::Duration::from_secs(5))
        .send()
        .await
        .map_err(|e| format!("whisper-server request failed: {}", e))?;

    if !resp.status().is_success() {
        return Err(format!("whisper-server returned status {}", resp.status()));
    }

    let text = resp
        .text()
        .await
        .map_err(|e| format!("Failed to read whisper-server response: {}", e))?;

    // Clean up the response: trim whitespace and join lines
    let cleaned: String = text
        .lines()
        .map(|l| l.trim())
        .filter(|l| !l.is_empty())
        .collect::<Vec<&str>>()
        .join(" ");

    Ok(cleaned)
}

// --- Helper: send audio to Groq cloud API ---

async fn send_to_groq(api_key: &str, wav_path: &PathBuf, language: &str) -> Result<String, String> {
    let wav_bytes = std::fs::read(wav_path)
        .map_err(|e| format!("Failed to read WAV file: {}", e))?;

    let part = reqwest::multipart::Part::bytes(wav_bytes)
        .file_name("chunk.wav")
        .mime_str("audio/wav")
        .map_err(|e| format!("Failed to create multipart: {}", e))?;

    let form = reqwest::multipart::Form::new()
        .part("file", part)
        .text("model", "whisper-large-v3-turbo")
        .text("response_format", "text")
        .text("language", language.to_string())
        .text("temperature", "0.0")
        .text("prompt", GROQ_MEDICAL_PROMPT.to_string());

    let resp = reqwest::Client::new()
        .post(GROQ_API_URL)
        .header("Authorization", format!("Bearer {}", api_key))
        .multipart(form)
        .timeout(std::time::Duration::from_secs(10))
        .send()
        .await
        .map_err(|e| format!("Groq API request failed: {}", e))?;

    if resp.status().as_u16() == 429 {
        return Err("rate_limited".to_string());
    }

    if !resp.status().is_success() {
        let status = resp.status();
        let body = resp.text().await.unwrap_or_default();
        return Err(format!("Groq API returned status {}: {}", status, body));
    }

    let text = resp
        .text()
        .await
        .map_err(|e| format!("Failed to read Groq response: {}", e))?;

    let cleaned: String = text
        .lines()
        .map(|l| l.trim())
        .filter(|l| !l.is_empty())
        .collect::<Vec<&str>>()
        .join(" ");

    Ok(cleaned)
}

// --- Helper: kill the whisper-server process ---

fn kill_whisper_server(process: &mut std::process::Child) {
    tracing::info!("[whisper-server] Shutting down (PID: {})", process.id());
    let _ = process.kill();
    let _ = process.wait();
}

// --- Helper: ensure whisper server is running (persistent, reused across recordings) ---

async fn ensure_whisper_server(
    app: &AppHandle,
    state: &State<'_, RecordingState>,
    language: &str,
) -> Result<u16, String> {
    let current_port = *state.whisper_server_port.lock().unwrap();
    let current_lang = state.whisper_language.lock().unwrap().clone();

    // If we have a server, check if it's alive and correct language
    if current_port > 0 {
        let needs_restart = current_lang != language;

        if !needs_restart {
            // Health check: quick GET to see if server is responsive
            let health_ok = reqwest::Client::new()
                .get(format!("http://127.0.0.1:{}/", current_port))
                .timeout(std::time::Duration::from_secs(2))
                .send()
                .await
                .map(|r| r.status().is_success())
                .unwrap_or(false);

            if health_ok {
                tracing::info!("[whisper-server] Reusing existing server on port {} (healthy)", current_port);
                return Ok(current_port);
            }
            tracing::warn!("[whisper-server] Existing server on port {} is unresponsive, restarting", current_port);
        } else {
            tracing::info!("[whisper-server] Language changed ({} → {}), restarting", current_lang, language);
        }

        // Kill the old server
        if let Some(mut child) = state.whisper_server_process.lock().unwrap().take() {
            kill_whisper_server(&mut child);
        }
        *state.whisper_server_port.lock().unwrap() = 0;
    }

    // Start a new server
    let server_bin = find_whisper_server_binary(app)
        .map_err(|e| { tracing::error!("{}", e); e })?;
    let model_path = find_whisper_model(app)
        .map_err(|e| { tracing::error!("{}", e); e })?;

    tracing::info!("Found whisper-server: {:?}, model: {:?}", server_bin, model_path);

    let port = find_free_port();
    let mut child = start_whisper_server(&server_bin, &model_path, port, language)?;

    let _ = app.emit("whisper_status", "Loading speech model...");

    match tokio::time::timeout(
        tokio::time::Duration::from_secs(30),
        wait_for_whisper_server(port, 30),
    )
    .await
    {
        Ok(Ok(())) => {
            tracing::info!("[whisper-server] Server ready on port {}", port);
            let _ = app.emit("whisper_status", "Speech model ready");
        }
        Ok(Err(e)) => {
            kill_whisper_server(&mut child);
            return Err(e);
        }
        Err(_) => {
            kill_whisper_server(&mut child);
            return Err("whisper-server timed out loading model (30s)".to_string());
        }
    }

    *state.whisper_server_process.lock().unwrap() = Some(child);
    *state.whisper_server_port.lock().unwrap() = port;
    *state.whisper_language.lock().unwrap() = language.to_string();

    Ok(port)
}

// --- Medical vocabulary prompt for Whisper conditioning ---

const MEDICAL_PROMPT: &str = "\
Medical clinical encounter transcription. \
Medications: metformin, lisinopril, losartan, amlodipine, atorvastatin, omeprazole, pantoprazole, \
gabapentin, amitriptyline, sumatriptan, topiramate, hydrochlorothiazide, furosemide, spironolactone, \
prednisone, methylprednisolone, azithromycin, amoxicillin, cephalexin, cefdinir, ciprofloxacin, \
doxycycline, fluoxetine, sertraline, escitalopram, duloxetine, bupropion, trazodone, alprazolam, \
lorazepam, diazepam, clonazepam, oxycodone, hydrocodone, morphine, tramadol, ibuprofen, naproxen, \
acetaminophen, aspirin, warfarin, apixaban, rivaroxaban, insulin, glipizide, glimepiride, sitagliptin, \
levothyroxine, albuterol, fluticasone, montelukast, tiotropium, clopidogrel, metoprolol, carvedilol, \
diltiazem, verapamil, digoxin, hydralazine, clonidine, tamsulosin, finasteride. \
Conditions: hypertension, hypotension, tachycardia, bradycardia, arrhythmia, atrial fibrillation, \
myocardial infarction, angina, dyspnea, pneumonia, bronchitis, asthma, COPD, emphysema, \
diabetes mellitus, hyperglycemia, hypoglycemia, hypothyroidism, hyperthyroidism, osteoarthritis, \
rheumatoid arthritis, fibromyalgia, neuropathy, radiculopathy, sciatica, stenosis, spondylosis, \
gastroesophageal reflux, GERD, peptic ulcer, colitis, diverticulitis, cholecystitis, pancreatitis, \
urinary tract infection, pyelonephritis, hematuria, proteinuria, chronic kidney disease, anemia, \
thrombocytopenia, leukocytosis, cellulitis, abscess, laceration, contusion, fracture, dislocation, \
concussion, syncope, vertigo, tinnitus, migraine, seizure, cerebrovascular accident, stroke, TIA, \
deep vein thrombosis, pulmonary embolism, edema, ascites, cirrhosis, hepatitis, psoriasis, eczema, \
dermatitis, melanoma, carcinoma, lymphoma, benign prostatic hyperplasia. \
Anatomy: cervical, thoracic, lumbar, sacral, bilateral, anterior, posterior, lateral, medial, proximal, \
distal, dorsal, plantar, supine, prone, tenderness, crepitus, effusion, erythema, induration, ecchymosis. \
Vitals: systolic, diastolic, blood pressure, heart rate, respiratory rate, oxygen saturation, BMI, \
temperature, pulse oximetry. \
Labs: hemoglobin A1c, CBC, BMP, CMP, TSH, lipid panel, urinalysis, creatinine, BUN, eGFR, ALT, AST. \
Dental: caries, mesial, distal, occlusal, buccal, lingual, incisal, facial, \
periodontitis, gingivitis, periapical, endodontic, root canal therapy, pulpitis, \
composite restoration, amalgam, porcelain, ceramic crown, implant, abutment, pontic, \
impacted, extraction, alveolar, furcation, edentulous, malocclusion, bruxism, \
temporomandibular, mandibular, maxillary, premolar, molar, bicuspid, canine, incisor, \
radiograph, periapical abscess, bone loss, pocket depth, clinical attachment loss, \
fixed partial denture, removable partial denture, silver diamine fluoride.";

// --- Helper: detect whisper hallucinations on silence/low-energy audio ---

fn is_hallucination(text: &str) -> bool {
    let t = text.trim();
    // Empty or very short single-word outputs are suspect
    if t.is_empty() { return true; }
    // Whisper meta-tags
    if t.starts_with('[') || t.starts_with('(') && t.ends_with(')') { return true; }
    // Known hallucination patterns (case-insensitive)
    let lower = t.to_lowercase();
    const HALLUCINATIONS: &[&str] = &[
        "[blank_audio]", "(silence)", "(blank audio)", "(no audio)",
        "(audience applauding)", "(audience laughing)", "(applause)",
        "(music)", "(music playing)", "(laughter)", "(laughing)",
        "(sighing)", "(coughing)", "(breathing)", "(clapping)",
        "(footsteps)", "(wind blowing)", "(birds chirping)",
        "thank you.", "thanks for watching.", "thanks for listening.",
        "we're done.", "goodbye.", "bye.", "see you next time.",
        "subscribe", "like and subscribe", "click the bell",
        "please subscribe", "hit the like button",
        "thank you for watching", "thanks for watching",
        "the end.", "that's it.", "that's all.",
        "you", "bye-bye.", "so,", "okay.",
    ];
    for h in HALLUCINATIONS {
        if lower == *h { return true; }
    }
    // Parenthesized stage directions are always hallucinations
    if lower.starts_with('(') && lower.ends_with(')') { return true; }
    // Repeated single word/phrase (e.g. "Thank you. Thank you. Thank you.")
    let words: Vec<&str> = t.split_whitespace().collect();
    if words.len() <= 3 && words.len() > 0 {
        let first = words[0].to_lowercase();
        if words.iter().all(|w| w.to_lowercase().trim_matches(|c: char| !c.is_alphanumeric()) == first.trim_matches(|c: char| !c.is_alphanumeric())) {
            return true;
        }
    }
    // Non-ASCII gibberish: if >20% of chars are non-ASCII, likely hallucination
    // (CJK, Cyrillic, Arabic etc. when expecting English medical transcription)
    let total_alpha: usize = t.chars().filter(|c| c.is_alphabetic()).count();
    if total_alpha > 0 {
        let non_ascii: usize = t.chars().filter(|c| c.is_alphabetic() && !c.is_ascii()).count();
        if non_ascii as f64 / total_alpha as f64 > 0.2 {
            return true;
        }
    }
    // Repeated punctuation/dots (". . . . . ." or "...")
    let stripped: String = t.chars().filter(|c| !c.is_whitespace() && *c != '.').collect();
    if stripped.len() < 3 && t.len() > 5 {
        return true;
    }
    false
}

// --- Helper: run whisper-cli on a chunk (kept for potential CLI fallback) ---

#[allow(dead_code)]
fn run_whisper(whisper_bin: &PathBuf, model_path: &PathBuf, wav_path: &PathBuf) -> Result<String, String> {
    let output = std::process::Command::new(whisper_bin)
        .arg("-m")
        .arg(model_path)
        .arg("-f")
        .arg(wav_path)
        .arg("--no-timestamps")
        .arg("--no-prints")
        .arg("--prompt")
        .arg(MEDICAL_PROMPT)
        .arg("-t")
        .arg(std::thread::available_parallelism().map(|n| n.get()).unwrap_or(8).max(4).to_string())
        .output()
        .map_err(|e| format!("Failed to run whisper-cli: {}", e))?;

    let stderr_str = String::from_utf8_lossy(&output.stderr);
    if !stderr_str.is_empty() {
        tracing::debug!("[whisper] stderr: {}", stderr_str.chars().take(500).collect::<String>());
    }

    if !output.status.success() {
        return Err(format!("whisper-cli failed: {}", stderr_str));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    tracing::debug!("[whisper] raw stdout: {} chars", stdout.len());
    // whisper-cli outputs text with possible leading/trailing whitespace
    let text: String = stdout
        .lines()
        .map(|l| l.trim())
        .filter(|l| !l.is_empty())
        .collect::<Vec<&str>>()
        .join(" ");

    tracing::debug!("[whisper] parsed text: {} chars", text.len());
    Ok(text)
}

// --- Tauri Commands ---

#[tauri::command]
pub async fn start_recording(
    app: AppHandle,
    state: State<'_, RecordingState>,
    mode: Option<String>,
    language: Option<String>,
    groq_api_key: Option<String>,
) -> Result<(), String> {
    let mode = mode.unwrap_or_else(|| "whisper".to_string());
    let lang = language.unwrap_or_else(|| "en".to_string());
    if state.is_recording.load(Ordering::SeqCst) {
        return Err("Already recording".to_string());
    }

    // Store mode and groq key for stop_recording final chunk routing
    *state.recording_mode.lock().unwrap() = mode.clone();
    *state.groq_api_key.lock().unwrap() = groq_api_key.clone().unwrap_or_default();

    // Store language for use in processing loop
    *state.whisper_language.lock().unwrap() = lang.clone();

    // Ensure whisper server is running (only for whisper mode — not groq or stream)
    let whisper_port: u16 = if mode == "whisper" {
        ensure_whisper_server(&app, &state, &lang).await?
    } else {
        0 // not used in stream or groq mode
    };

    // Reset adaptive chunk size for new recording
    state.current_chunk_samples.store(DEFAULT_CHUNK_SAMPLES as u64, Ordering::SeqCst);
    state.inference_times.lock().unwrap().clear();

    // Get the default input device
    let host = cpal::default_host();
    let device = host
        .default_input_device()
        .ok_or_else(|| { tracing::error!("No input device available"); "No input device available".to_string() })?;

    let config = device
        .default_input_config()
        .map_err(|e| format!("Failed to get input config: {}", e))?;

    let source_rate = config.sample_rate().0;
    let channels = config.channels();

    *state.sample_rate.lock().unwrap() = source_rate;

    // Clear buffers
    state.chunk_buffer.lock().unwrap().clear();
    state.session_samples.lock().unwrap().clear();
    *state.total_samples.lock().unwrap() = 0;

    // Start continuous WAV writer for crash safety
    let data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let sessions_dir = data_dir.join("sessions");
    std::fs::create_dir_all(&sessions_dir).map_err(|e| e.to_string())?;

    let wav_filename = format!("recording_{}.wav", chrono::Local::now().format("%Y%m%d_%H%M%S"));
    let wav_path_str = sessions_dir.join(&wav_filename).to_string_lossy().to_string();

    let writer = start_continuous_wav(&wav_path_str, 16000)?;
    *state.wav_writer.lock().unwrap() = Some(writer);
    *state.wav_path.lock().unwrap() = Some(wav_path_str.clone());

    tracing::info!("Recording started, continuous WAV: {}", wav_path_str);

    // Reset paused flag (but DON'T set is_recording yet — wait until stream is built)
    state.is_paused.store(false, Ordering::SeqCst);

    let chunk_buf = state.chunk_buffer.clone();
    let session_buf = state.session_samples.clone();
    let is_paused = state.is_paused.clone();
    let wav_writer_cb = state.wav_writer.clone();
    let total_samples_cb = state.total_samples.clone();

    // Build the cpal input stream
    let stream = match config.sample_format() {
        SampleFormat::I16 => device.build_input_stream(
            &config.into(),
            move |data: &[i16], _: &cpal::InputCallbackInfo| {
                if is_paused.load(Ordering::SeqCst) {
                    return;
                }
                let resampled = resample_to_16k_mono(data, source_rate, channels);

                // Write to continuous WAV file (crash-safe)
                if let Ok(mut guard) = wav_writer_cb.lock() {
                    if let Some(ref mut writer) = *guard {
                        for &s in &resampled {
                            if writer.write_sample(s).is_err() { break; }
                        }
                        if let Ok(mut total) = total_samples_cb.lock() {
                            let prev = *total;
                            *total += resampled.len() as u64;
                            // Flush every ~10 seconds at 16kHz for crash safety
                            if *total / 160000 > prev / 160000 {
                                let _ = writer.flush();
                            }
                        }
                    }
                }

                chunk_buf.lock().unwrap().extend_from_slice(&resampled);
                session_buf.lock().unwrap().extend_from_slice(&resampled);
            },
            |err| tracing::error!("Audio input error: {}", err),
            None,
        ),
        SampleFormat::F32 => {
            let chunk_buf = state.chunk_buffer.clone();
            let session_buf = state.session_samples.clone();
            let is_paused = state.is_paused.clone();
            let wav_writer_cb = state.wav_writer.clone();
            let total_samples_cb = state.total_samples.clone();
            device.build_input_stream(
                &config.into(),
                move |data: &[f32], _: &cpal::InputCallbackInfo| {
                    if is_paused.load(Ordering::SeqCst) {
                        return;
                    }
                    // Convert f32 to i16
                    let i16_data: Vec<i16> = data
                        .iter()
                        .map(|&s| (s * 32767.0).clamp(-32768.0, 32767.0) as i16)
                        .collect();
                    let resampled = resample_to_16k_mono(&i16_data, source_rate, channels);

                    // Write to continuous WAV file (crash-safe)
                    if let Ok(mut guard) = wav_writer_cb.lock() {
                        if let Some(ref mut writer) = *guard {
                            for &s in &resampled {
                                if writer.write_sample(s).is_err() { break; }
                            }
                            if let Ok(mut total) = total_samples_cb.lock() {
                                let prev = *total;
                                *total += resampled.len() as u64;
                                if *total / 160000 > prev / 160000 {
                                    let _ = writer.flush();
                                }
                            }
                        }
                    }

                    chunk_buf.lock().unwrap().extend_from_slice(&resampled);
                    session_buf.lock().unwrap().extend_from_slice(&resampled);
                },
                |err| tracing::error!("Audio input error: {}", err),
                None,
            )
        }
        _ => return Err(format!("Unsupported sample format: {:?}", config.sample_format())),
    }
    .map_err(|e| format!("Failed to build input stream: {}", e))?;

    stream
        .play()
        .map_err(|e| format!("Failed to start stream: {}", e))?;

    // NOW set is_recording — only after stream is successfully built and playing
    state.is_recording.store(true, Ordering::SeqCst);

    *state.stream_handle.lock().unwrap() = Some(StreamWrapper(stream));

    // Spawn the processing loop — mode determines behavior
    let is_recording = state.is_recording.clone();
    let is_paused_w = state.is_paused.clone();
    let chunk_buffer = state.chunk_buffer.clone();
    let app_handle = app.clone();
    let wav_writer_loop = state.wav_writer.clone();
    let total_samples_loop = state.total_samples.clone();
    let whisper_lang = lang.clone();

    let task = if mode == "stream" {
        // ── STREAM MODE: emit raw PCM audio to frontend for Deepgram ──
        tracing::info!("[audio] Starting in STREAM mode (audio → frontend → Deepgram)");
        tokio::spawn(async move {
            loop {
                if !is_recording.load(Ordering::SeqCst) { break; }
                tokio::time::sleep(tokio::time::Duration::from_millis(200)).await;
                if is_paused_w.load(Ordering::SeqCst) { continue; }

                // Check max session duration
                {
                    let total = *total_samples_loop.lock().unwrap();
                    if total >= MAX_SESSION_SAMPLES {
                        tracing::warn!("Max session duration reached (4 hours), auto-stopping");
                        is_recording.store(false, Ordering::SeqCst);
                        if let Some(writer) = wav_writer_loop.lock().unwrap().take() {
                            let _ = writer.finalize();
                        }
                        let _ = app_handle.emit("recording_max_duration", ());
                        break;
                    }
                }

                let samples: Vec<i16> = {
                    let mut buf = chunk_buffer.lock().unwrap();
                    if buf.is_empty() { continue; }
                    let data = buf.clone();
                    buf.clear();
                    data
                };

                // Convert i16 samples to little-endian bytes, then base64 encode
                let bytes: Vec<u8> = samples.iter()
                    .flat_map(|s| s.to_le_bytes())
                    .collect();
                let b64 = base64::engine::general_purpose::STANDARD.encode(&bytes);
                let _ = app_handle.emit("audio-pcm", b64);
            }
        })
    } else if mode == "groq" {
        // ── GROQ MODE: process audio chunks through Groq cloud API ──
        tracing::info!("[audio] Starting in GROQ mode (audio → Groq cloud API → transcription)");
        let silence_threshold: f64 = 300.0; // Higher than whisper — cloud calls are expensive on silence
        let groq_key = groq_api_key.unwrap_or_default();

        tokio::spawn(async move {
            loop {
                if !is_recording.load(Ordering::SeqCst) { break; }
                tokio::time::sleep(tokio::time::Duration::from_millis(150)).await;
                if is_paused_w.load(Ordering::SeqCst) { continue; }

                // Check max session duration
                {
                    let total = *total_samples_loop.lock().unwrap();
                    if total >= MAX_SESSION_SAMPLES {
                        tracing::warn!("Max session duration reached (4 hours), auto-stopping");
                        is_recording.store(false, Ordering::SeqCst);
                        if let Some(writer) = wav_writer_loop.lock().unwrap().take() {
                            let _ = writer.finalize();
                        }
                        let _ = app_handle.emit("recording_max_duration", ());
                        break;
                    }
                }

                let buf_len = chunk_buffer.lock().unwrap().len();
                if buf_len < GROQ_CHUNK_SAMPLES { continue; }

                let overlap = 5000; // ~0.3s overlap at 16kHz
                let chunk: Vec<i16> = {
                    let mut buf = chunk_buffer.lock().unwrap();
                    let chunk = buf[..GROQ_CHUNK_SAMPLES].to_vec();
                    let drain_to = GROQ_CHUNK_SAMPLES - overlap;
                    buf.drain(..drain_to);
                    chunk
                };

                // Energy-based silence detection
                let rms = {
                    let sum_sq: f64 = chunk.iter().map(|&s| (s as f64) * (s as f64)).sum();
                    (sum_sq / chunk.len() as f64).sqrt()
                };
                if rms < silence_threshold {
                    tracing::debug!("[groq] Skipping silent chunk (RMS={:.0} < {})", rms, silence_threshold);
                    continue;
                }

                let tmp_dir = std::env::temp_dir();
                let wav_path = tmp_dir.join("clinicalflow_groq_chunk.wav");
                if let Err(e) = write_wav(&wav_path, &chunk, 16000) {
                    tracing::error!("[groq] Failed to write chunk WAV: {}", e);
                    continue;
                }

                let chunk_duration = chunk.len() as f64 / 16000.0;
                tracing::info!("[groq] Processing chunk: {:.1}s of audio (RMS={:.0})", chunk_duration, rms);
                let t0 = std::time::Instant::now();

                let result = send_to_groq(&groq_key, &wav_path, &whisper_lang).await;

                let processing_time = t0.elapsed().as_secs_f64();
                tracing::info!("[groq] Processing took {:.2}s for {:.1}s chunk", processing_time, chunk_duration);

                match result {
                    Ok(text) => {
                        let text = text.trim().to_string();
                        tracing::info!("[groq] Transcribed: {} chars", text.len());
                        if !text.is_empty() && !is_hallucination(&text) {
                            let _ = app_handle.emit("transcription", TranscriptChunk {
                                text,
                                is_partial: false,
                            });
                        } else if !text.is_empty() {
                            tracing::debug!("[groq] Filtered hallucination: {}", text);
                        }
                    }
                    Err(e) if e == "rate_limited" => {
                        tracing::warn!("[groq] Rate limited (429) — chunk skipped. Consider Groq Developer tier.");
                        let _ = app_handle.emit("whisper_error",
                            "Groq rate limited — chunk skipped. Recording continues.".to_string());
                    }
                    Err(e) => {
                        tracing::error!("[groq] Failed on chunk: {}. Recording continues.", e);
                        let _ = app_handle.emit("whisper_error",
                            "Groq transcription error. Recording continues.".to_string());
                    }
                }

                let _ = std::fs::remove_file(&wav_path);
            }
        })
    } else {
        // ── WHISPER MODE: process audio chunks through whisper-server HTTP API ──
        tracing::info!("[audio] Starting in WHISPER mode (audio → whisper-server HTTP → transcription)");
        let silence_threshold: f64 = 200.0; // RMS below this = silence
        let current_chunk = state.current_chunk_samples.clone();
        let inference_times = state.inference_times.clone();

        tokio::spawn(async move {
            loop {
                if !is_recording.load(Ordering::SeqCst) { break; }
                tokio::time::sleep(tokio::time::Duration::from_millis(150)).await;
                if is_paused_w.load(Ordering::SeqCst) { continue; }

                // Check max session duration
                {
                    let total = *total_samples_loop.lock().unwrap();
                    if total >= MAX_SESSION_SAMPLES {
                        tracing::warn!("Max session duration reached (4 hours), auto-stopping");
                        is_recording.store(false, Ordering::SeqCst);
                        if let Some(writer) = wav_writer_loop.lock().unwrap().take() {
                            let _ = writer.finalize();
                        }
                        let _ = app_handle.emit("recording_max_duration", ());
                        break;
                    }
                }

                let chunk_samples = current_chunk.load(Ordering::SeqCst) as usize;
                let buf_len = chunk_buffer.lock().unwrap().len();
                if buf_len < chunk_samples {
                    if buf_len > 0 && buf_len % 8000 < 150 {
                        // Log occasionally while waiting for chunk to fill
                        tracing::info!("[whisper] Buffer: {}/{} samples ({:.1}s/{:.1}s)", buf_len, chunk_samples, buf_len as f64 / 16000.0, chunk_samples as f64 / 16000.0);
                    }
                    continue;
                }

                let overlap = 5000; // ~0.3s overlap at 16kHz
                let chunk: Vec<i16> = {
                    let mut buf = chunk_buffer.lock().unwrap();
                    let chunk = buf[..chunk_samples].to_vec();
                    let drain_to = if chunk_samples > overlap { chunk_samples - overlap } else { chunk_samples };
                    buf.drain(..drain_to);
                    chunk
                };

                // ── Energy-based silence detection: skip chunks with no speech ──
                let rms = {
                    let sum_sq: f64 = chunk.iter().map(|&s| (s as f64) * (s as f64)).sum();
                    (sum_sq / chunk.len() as f64).sqrt()
                };
                if rms < silence_threshold {
                    tracing::info!("[whisper] Skipping silent chunk (RMS={:.0} < {})", rms, silence_threshold);
                    continue;
                }

                let tmp_dir = std::env::temp_dir();
                let wav_path = tmp_dir.join("clinicalflow_chunk.wav");
                if let Err(e) = write_wav(&wav_path, &chunk, 16000) {
                    tracing::error!("Failed to write chunk WAV: {}", e);
                    continue;
                }

                let chunk_duration = chunk.len() as f64 / 16000.0;
                tracing::info!("[whisper-server] Processing chunk: {:.1}s of audio (RMS={:.0})", chunk_duration, rms);
                let t0 = std::time::Instant::now();

                let result = send_to_whisper_server(whisper_port, &wav_path, &whisper_lang).await;

                let processing_time = t0.elapsed().as_secs_f64();
                tracing::info!("[whisper-server] Processing took {:.2}s for {:.1}s chunk", processing_time, chunk_duration);

                // ── Adaptive performance monitoring ──
                {
                    let mut times = inference_times.lock().unwrap();
                    if times.len() >= PERF_WINDOW_SIZE {
                        times.remove(0);
                    }
                    times.push(processing_time);

                    if times.len() >= 3 {
                        let avg = times.iter().sum::<f64>() / times.len() as f64;
                        if avg > chunk_duration {
                            // Falling behind — increase chunk size to recover
                            let new_chunk = (chunk_samples + 8000).min(MAX_CHUNK_SAMPLES);
                            if new_chunk != chunk_samples {
                                tracing::warn!(
                                    "[whisper-server] Adaptive: avg inference {:.2}s > chunk {:.1}s, increasing to {:.1}s",
                                    avg, chunk_duration, new_chunk as f64 / 16000.0
                                );
                                current_chunk.store(new_chunk as u64, Ordering::SeqCst);
                                let _ = app_handle.emit("whisper_status", "Transcription running slower than realtime");
                            }
                        } else if avg < chunk_duration * 0.5 && chunk_samples > MIN_CHUNK_SAMPLES {
                            // Plenty of headroom — could decrease (but stay at floor)
                            let new_chunk = (chunk_samples - 4000).max(MIN_CHUNK_SAMPLES);
                            if new_chunk != chunk_samples {
                                tracing::info!(
                                    "[whisper-server] Adaptive: avg inference {:.2}s << chunk {:.1}s, decreasing to {:.1}s",
                                    avg, chunk_duration, new_chunk as f64 / 16000.0
                                );
                                current_chunk.store(new_chunk as u64, Ordering::SeqCst);
                            }
                        }
                    }
                }

                match result {
                    Ok(text) => {
                        let text = text.trim().to_string();
                        tracing::info!("[whisper-server] Transcribed: {} chars", text.len());
                        if !text.is_empty() && !is_hallucination(&text) {
                            let _ = app_handle.emit("transcription", TranscriptChunk {
                                text,
                                is_partial: false,
                            });
                        } else if !text.is_empty() {
                            tracing::debug!("[whisper-server] Filtered hallucination: {}", text);
                        }
                    }
                    Err(e) => {
                        tracing::error!("[whisper-server] Failed on chunk: {}. Recording continues.", e);
                        let _ = app_handle.emit("whisper_error",
                            "Transcription error on last segment. Recording continues.".to_string());
                    }
                }

                let _ = std::fs::remove_file(&wav_path);
            }
        })
    };

    *state.whisper_task.lock().unwrap() = Some(task);

    Ok(())
}

#[tauri::command]
pub async fn stop_recording(
    app: AppHandle,
    state: State<'_, RecordingState>,
) -> Result<String, String> {
    if !state.is_recording.load(Ordering::SeqCst) {
        return Err("Not recording".to_string());
    }

    // Signal stop
    state.is_recording.store(false, Ordering::SeqCst);

    // Stop the audio stream
    {
        let mut handle = state.stream_handle.lock().unwrap();
        *handle = None; // dropping the stream stops it
    }

    // Finalize the continuous WAV writer (writes correct header length)
    let total_samples = *state.total_samples.lock().unwrap();
    {
        if let Some(writer) = state.wav_writer.lock().unwrap().take() {
            writer.finalize().map_err(|e| format!("Failed to finalize WAV: {}", e))?;
        }
    }
    let wav_path_result = state.wav_path.lock().unwrap().take().unwrap_or_default();

    tracing::info!("Recording stopped. Total samples: {}, duration: {:.1}s, file: {}",
        total_samples, total_samples as f64 / 16000.0, wav_path_result);

    // Wait for whisper task to finish
    let task_handle = {
        state.whisper_task.lock().unwrap().take()
    };
    if let Some(t) = task_handle {
        let _ = tokio::time::timeout(tokio::time::Duration::from_secs(5), t).await;
    }

    // Process any remaining audio in the chunk buffer
    let remaining: Vec<i16> = {
        let mut buf = state.chunk_buffer.lock().unwrap();
        let data = buf.clone();
        buf.clear();
        data
    };

    let rec_mode = state.recording_mode.lock().unwrap().clone();
    let server_port = *state.whisper_server_port.lock().unwrap();
    let final_lang = state.whisper_language.lock().unwrap().clone();
    let final_groq_key = state.groq_api_key.lock().unwrap().clone();

    if remaining.len() > 8000 {
        let tmp_dir = std::env::temp_dir();
        let tmp_wav_path = tmp_dir.join("clinicalflow_final_chunk.wav");
        if write_wav(&tmp_wav_path, &remaining, 16000).is_ok() {
            let result = if rec_mode == "groq" && !final_groq_key.is_empty() {
                send_to_groq(&final_groq_key, &tmp_wav_path, &final_lang).await
            } else if server_port > 0 {
                send_to_whisper_server(server_port, &tmp_wav_path, &final_lang).await
            } else {
                Err("No transcription backend available for final chunk".to_string())
            };
            match result {
                Ok(text) => {
                    let text = text.trim().to_string();
                    if !text.is_empty() && !is_hallucination(&text) {
                        let _ = app.emit(
                            "transcription",
                            TranscriptChunk {
                                text,
                                is_partial: false,
                            },
                        );
                    }
                }
                Err(e) => {
                    tracing::error!("[{}] Failed on final chunk: {}", rec_mode, e);
                }
            }
            let _ = std::fs::remove_file(&tmp_wav_path);
        }
    }

    // NOTE: whisper-server is intentionally kept alive for reuse across recordings.
    // It will be shut down on app quit or via the shutdown_whisper_server command.

    // Clear session_samples buffer (continuous WAV writer already saved everything)
    state.session_samples.lock().unwrap().clear();

    if wav_path_result.is_empty() {
        return Ok(String::new());
    }

    Ok(wav_path_result)
}

#[tauri::command]
pub async fn pause_recording(state: State<'_, RecordingState>) -> Result<(), String> {
    if !state.is_recording.load(Ordering::SeqCst) {
        return Err("Not recording".to_string());
    }
    state.is_paused.store(true, Ordering::SeqCst);
    tracing::debug!("Recording paused");
    Ok(())
}

#[tauri::command]
pub async fn resume_recording(state: State<'_, RecordingState>) -> Result<(), String> {
    if !state.is_recording.load(Ordering::SeqCst) {
        return Err("Not recording".to_string());
    }
    state.is_paused.store(false, Ordering::SeqCst);
    tracing::debug!("Recording resumed");
    Ok(())
}

#[tauri::command]
pub async fn get_audio_devices() -> Result<Vec<AudioDevice>, String> {
    let host = cpal::default_host();
    let devices = host
        .input_devices()
        .map_err(|e| format!("Failed to enumerate devices: {}", e))?;

    let mut result = Vec::new();
    for device in devices {
        let name = device.name().unwrap_or_else(|_| "Unknown".to_string());
        result.push(AudioDevice {
            id: name.clone(),
            name,
        });
    }
    Ok(result)
}

/// Shut down the persistent whisper server. Called on app quit or mode switch to online.
#[tauri::command]
pub async fn shutdown_whisper_server(state: State<'_, RecordingState>) -> Result<(), String> {
    if let Some(mut child) = state.whisper_server_process.lock().unwrap().take() {
        kill_whisper_server(&mut child);
    }
    *state.whisper_server_port.lock().unwrap() = 0;
    tracing::info!("[whisper-server] Shut down via command");
    Ok(())
}
