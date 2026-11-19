import UIKit
import WebKit
import Capacitor

/// The app shows the live site https://madeinegyptgate.com in Capacitor's WKWebView (capacitor.config.json server.url), so every
/// change of the site is in the app at once. Capacitor already does (WebViewDelegationHandler, CAPBridgeViewController):
/// microphone / camera for getUserMedia without a second prompt, inline video without a tap (allowsInlineMediaPlayback,
/// mediaTypesRequiringUserActionForPlayback = []), the file picker of <input type=file>, other hosts in Safari or their app.
/// Added here, like MainActivity.java on Android:
/// - Universal Links (applinks:madeinegyptgate.com in App.entitlements) open the tapped page in the app;
/// - the offline page www/offline.html only when the site cannot be reached, never for a cancelled navigation, with the page to
///   retry (#u=…); capacitor.config.json has no server.errorPath (Capacitor would show it for every failure, cancellations too);
/// - files the site hands out (downloads, a blob: file such as the .ics of the events pages) go to the share sheet.
class MainViewController: CAPBridgeViewController {

    private var webDelegate: MIGWebDelegate?

    override func capacitorDidLoad() {
        super.capacitorDidLoad()
        if let webView = webView, let capacitor = webView.navigationDelegate as? WebViewDelegationHandler {
            let delegate = MIGWebDelegate(inner: capacitor, owner: self)
            webDelegate = delegate // WKWebView holds its navigation delegate weakly
            webView.navigationDelegate = delegate
        }
        // SceneDelegateProxy posts this for every Universal Link (on a cold start once the first view has appeared)
        NotificationCenter.default.addObserver(self, selector: #selector(onUniversalLink(_:)), name: .capacitorOpenUniversalLink, object: nil)
    }

    @objc private func onUniversalLink(_ note: Notification) {
        guard let info = note.object as? [String: Any], let url = info["url"] as? URL else { return }
        openSitePage(url)
    }

    func openSitePage(_ url: URL) {
        guard MIGLinks.isSite(url) else { return }
        webView?.load(URLRequest(url: url))
    }

    /// capacitor://localhost/offline.html#u=<the page that failed>
    func showOffline(failedURL: URL?) {
        guard let webView = webView, let local = bridge?.config.localURL else { return }
        var target = local.appendingPathComponent("offline.html").absoluteString
        if let failed = failedURL, MIGLinks.isSite(failed),
           let encoded = failed.absoluteString.addingPercentEncoding(withAllowedCharacters: .alphanumerics) {
            target += "#u=" + encoded
        }
        if let url = URL(string: target) {
            webView.load(URLRequest(url: url))
        }
    }

    func share(fileAt url: URL) {
        let sheet = UIActivityViewController(activityItems: [url], applicationActivities: nil)
        if let popover = sheet.popoverPresentationController { // iPad
            popover.sourceView = view
            popover.sourceRect = CGRect(x: view.bounds.midX, y: view.bounds.maxY - 40, width: 1, height: 1)
        }
        present(sheet, animated: true, completion: nil)
    }
}

enum MIGLinks {
    /// the platform's own pages (the only ones that load inside the app: server.url + server.allowNavigation)
    static func isSite(_ url: URL) -> Bool {
        guard url.scheme?.lowercased() == "https", let host = url.host?.lowercased() else { return false }
        return host == "madeinegyptgate.com" || host == "www.madeinegyptgate.com"
    }
}

/// Capacitor's navigation delegate with three changes: failed loads (offline page), file downloads, and nothing else.
/// Every other WKNavigationDelegate call is passed to Capacitor's WebViewDelegationHandler unchanged (the methods it implements
/// in Capacitor 8.6; check this list when upgrading Capacitor). The UI delegate (alerts, camera / microphone grants) stays
/// Capacitor's own.
final class MIGWebDelegate: NSObject, WKNavigationDelegate, WKDownloadDelegate {

    private let inner: WebViewDelegationHandler
    private weak var owner: MainViewController?
    private var downloads: [ObjectIdentifier: URL] = [:]

    init(inner: WebViewDelegationHandler, owner: MainViewController) {
        self.inner = inner
        self.owner = owner
        super.init()
    }

    // MARK: passed to Capacitor

    @objc(webView:didStartProvisionalNavigation:)
    func webView(_ webView: WKWebView, didStartProvisionalNavigation navigation: WKNavigation!) {
        inner.webView(webView, didStartProvisionalNavigation: navigation)
    }

    @objc(webView:didFinishNavigation:)
    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        inner.webView(webView, didFinish: navigation)
    }

    @objc(webViewWebContentProcessDidTerminate:)
    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        inner.webViewWebContentProcessDidTerminate(webView)
    }

    @objc(webView:didReceiveAuthenticationChallenge:completionHandler:)
    func webView(_ webView: WKWebView, didReceive challenge: URLAuthenticationChallenge, completionHandler: @escaping @MainActor (URLSession.AuthChallengeDisposition, URLCredential?) -> Void) {
        inner.webView(webView, didReceive: challenge, completionHandler: completionHandler)
    }

    @objc(webView:decidePolicyForNavigationAction:decisionHandler:)
    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        if navigationAction.shouldPerformDownload { // <a download>, e.g. the .ics of an event
            decisionHandler(.download)
            return
        }
        inner.webView(webView, decidePolicyFor: navigationAction, decisionHandler: decisionHandler)
    }

    // MARK: failed loads

    @objc(webView:didFailProvisionalNavigation:withError:)
    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        inner.webView(webView, didFailProvisionalNavigation: navigation, withError: error) // logs only (no errorPath set)
        failed(error)
    }

    @objc(webView:didFailNavigation:withError:)
    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        inner.webView(webView, didFail: navigation, withError: error)
        failed(error)
    }

    /// The offline page for network failures only: not for a cancelled navigation (-999, a second tap or a Universal Link
    /// replacing the first page) and not for WebKit's own interruptions (a download, an unsupported page)
    private func failed(_ error: Error) {
        let ns = error as NSError
        guard ns.domain == NSURLErrorDomain, ns.code != NSURLErrorCancelled, ns.code != NSURLErrorUnsupportedURL else { return }
        let failing = ns.userInfo[NSURLErrorFailingURLErrorKey] as? URL
        if let failing = failing, !MIGLinks.isSite(failing) { return }
        owner?.showOffline(failedURL: failing)
    }

    // MARK: downloads

    @objc(webView:decidePolicyForNavigationResponse:decisionHandler:)
    func webView(_ webView: WKWebView, decidePolicyFor navigationResponse: WKNavigationResponse, decisionHandler: @escaping (WKNavigationResponsePolicy) -> Void) {
        if navigationResponse.isForMainFrame && (!navigationResponse.canShowMIMEType || MIGWebDelegate.isAttachment(navigationResponse.response)) {
            decisionHandler(.download)
        } else {
            decisionHandler(.allow)
        }
    }

    @objc(webView:navigationAction:didBecomeDownload:)
    func webView(_ webView: WKWebView, navigationAction: WKNavigationAction, didBecome download: WKDownload) {
        download.delegate = self
    }

    @objc(webView:navigationResponse:didBecomeDownload:)
    func webView(_ webView: WKWebView, navigationResponse: WKNavigationResponse, didBecome download: WKDownload) {
        download.delegate = self
    }

    @objc(download:decideDestinationUsingResponse:suggestedFilename:completionHandler:)
    func download(_ download: WKDownload, decideDestinationUsing response: URLResponse, suggestedFilename: String, completionHandler: @escaping (URL?) -> Void) {
        let folder = FileManager.default.temporaryDirectory.appendingPathComponent("downloads", isDirectory: true)
        try? FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true, attributes: nil)
        let file = folder.appendingPathComponent(MIGWebDelegate.safeName(suggestedFilename))
        try? FileManager.default.removeItem(at: file)
        downloads[ObjectIdentifier(download)] = file
        completionHandler(file)
    }

    @objc(downloadDidFinish:)
    func downloadDidFinish(_ download: WKDownload) {
        guard let file = downloads.removeValue(forKey: ObjectIdentifier(download)) else { return }
        owner?.share(fileAt: file)
    }

    @objc(download:didFailWithError:resumeData:)
    func download(_ download: WKDownload, didFailWithError error: Error, resumeData: Data?) {
        downloads.removeValue(forKey: ObjectIdentifier(download))
    }

    static func isAttachment(_ response: URLResponse) -> Bool {
        guard let http = response as? HTTPURLResponse, let disposition = http.value(forHTTPHeaderField: "Content-Disposition") else {
            return false
        }
        return disposition.lowercased().hasPrefix("attachment")
    }

    /// letters of any script, digits, . _ - and spaces; at most 80 characters
    static func safeName(_ name: String) -> String {
        let allowed = CharacterSet.alphanumerics.union(CharacterSet(charactersIn: "._- "))
        var scalars = String.UnicodeScalarView()
        for scalar in name.unicodeScalars {
            scalars.append(allowed.contains(scalar) ? scalar : "_")
        }
        var cleaned = String(scalars).trimmingCharacters(in: .whitespaces)
        if cleaned.isEmpty || cleaned.hasPrefix(".") {
            cleaned = "file" + cleaned
        }
        return cleaned.count > 80 ? String(cleaned.suffix(80)) : cleaned
    }
}
