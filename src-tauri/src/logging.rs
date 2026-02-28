use std::path::PathBuf;
use tracing_appender::rolling;
use tracing_subscriber::{fmt, layer::SubscriberExt, util::SubscriberInitExt, EnvFilter};

pub fn init_logging(log_dir: PathBuf) -> Result<(), String> {
    std::fs::create_dir_all(&log_dir)
        .map_err(|e| format!("Failed to create log dir: {}", e))?;

    // Daily rotating log file: clinicalflow-YYYY-MM-DD.log
    let file_appender = rolling::daily(&log_dir, "clinicalflow");

    // File layer: all logs go to file, no ANSI colors
    let file_layer = fmt::layer()
        .with_writer(file_appender)
        .with_ansi(false)
        .with_target(true)
        .with_thread_ids(false)
        .with_level(true);

    // Stdout layer: for dev mode only
    let stdout_layer = fmt::layer()
        .with_writer(std::io::stdout)
        .with_target(true);

    // Filter: DEBUG in dev, INFO in production
    let filter = if cfg!(debug_assertions) {
        EnvFilter::new("debug,hyper=warn,reqwest=warn,tao=warn,wry=warn")
    } else {
        EnvFilter::new("info,hyper=warn,reqwest=warn,tao=warn,wry=warn")
    };

    tracing_subscriber::registry()
        .with(filter)
        .with(file_layer)
        .with(stdout_layer)
        .init();

    tracing::info!("ClinicalFlow v{} logging initialized", env!("CARGO_PKG_VERSION"));
    tracing::info!("Log directory: {}", log_dir.display());

    Ok(())
}
