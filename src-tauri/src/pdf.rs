use headless_chrome::{Browser, LaunchOptions, types::PrintToPdfOptions};
use std::path::Path;

/// Convert HTML content to a PDF file using a headless Chromium-based browser.
/// Works cross-platform: finds Chrome, Chromium, or Edge (ships with Windows 10/11).
pub fn html_to_pdf(html_content: &str, output_path: &Path) -> Result<(), String> {
    let options = LaunchOptions {
        headless: true,
        sandbox: true,
        ..Default::default()
    };

    let browser = Browser::new(options).map_err(|e| {
        format!(
            "Failed to launch browser for PDF generation: {}. \
             Please ensure Chrome, Edge, or Chromium is installed.",
            e
        )
    })?;

    let tab = browser
        .new_tab()
        .map_err(|e| format!("Failed to create browser tab: {}", e))?;

    // Write HTML to a temp file next to the output (more reliable than data URIs for large content)
    let temp_html = output_path.with_extension("_temp.html");
    std::fs::write(&temp_html, html_content)
        .map_err(|e| format!("Failed to write temp HTML for PDF: {}", e))?;

    let file_url = format!("file://{}", temp_html.display());
    tab.navigate_to(&file_url)
        .map_err(|e| format!("Failed to navigate to HTML: {}", e))?;

    tab.wait_until_navigated()
        .map_err(|e| format!("PDF navigation timeout: {}", e))?;

    // Generate PDF — US Letter, 0.4in margins, print backgrounds
    let pdf_options = PrintToPdfOptions {
        landscape: Some(false),
        print_background: Some(true),
        margin_top: Some(0.4),
        margin_bottom: Some(0.4),
        margin_left: Some(0.4),
        margin_right: Some(0.4),
        paper_width: Some(8.5),
        paper_height: Some(11.0),
        ..Default::default()
    };

    let pdf_data = tab
        .print_to_pdf(Some(pdf_options))
        .map_err(|e| format!("Failed to generate PDF: {}", e))?;

    std::fs::write(output_path, &pdf_data)
        .map_err(|e| format!("Failed to write PDF file: {}", e))?;

    // Clean up temp file
    let _ = std::fs::remove_file(&temp_html);

    Ok(())
}
