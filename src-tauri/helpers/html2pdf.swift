import AppKit
import WebKit

guard CommandLine.arguments.count >= 3 else {
    fputs("Usage: html2pdf <input.html> <output.pdf>\n", stderr)
    exit(1)
}

let inputPath = CommandLine.arguments[1]
let outputPath = CommandLine.arguments[2]

class PDFMaker: NSObject, WKNavigationDelegate {
    let outputPath: String
    let webView: WKWebView

    init(outputPath: String) {
        self.outputPath = outputPath
        let config = WKWebViewConfiguration()
        // Standard viewport width — content reflows to @page size during PDF creation
        self.webView = WKWebView(frame: NSRect(x: 0, y: 0, width: 800, height: 600), configuration: config)
        super.init()
        self.webView.navigationDelegate = self
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        // Brief delay to let CSS/fonts settle
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.8) {
            // Don't set rect — CGRect.null (default) creates a paginated PDF
            // using @page CSS rules (size: letter, margin: 0.5in)
            let pdfConfig = WKPDFConfiguration()

            webView.createPDF(configuration: pdfConfig) { result in
                switch result {
                case .success(let data):
                    do {
                        try data.write(to: URL(fileURLWithPath: self.outputPath))
                    } catch {
                        fputs("Write error: \(error)\n", stderr)
                    }
                case .failure(let error):
                    fputs("PDF error: \(error)\n", stderr)
                }
                NSApp.terminate(nil)
            }
        }
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        fputs("Navigation failed: \(error)\n", stderr)
        NSApp.terminate(nil)
    }
}

let app = NSApplication.shared
app.setActivationPolicy(.prohibited) // No dock icon

let maker = PDFMaker(outputPath: outputPath)
let htmlURL = URL(fileURLWithPath: inputPath)
maker.webView.loadFileURL(htmlURL, allowingReadAccessTo: htmlURL.deletingLastPathComponent())

app.run()
