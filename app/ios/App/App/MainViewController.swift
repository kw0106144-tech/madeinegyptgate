import UIKit
import WebKit
import SafariServices
import QuickLook
import Capacitor

/// The app shows the live site https://madeinegyptgate.com in Capacitor's WKWebView (capacitor.config.json server.url), so every
/// change of the site is in the app at once. Capacitor already does (WebViewDelegationHandler, CAPBridgeViewController): inline
/// video without a tap (allowsInlineMediaPlayback, mediaTypesRequiringUserActionForPlayback = []), the file picker of
/// <input type=file>, other hosts in Safari or their own app. Added here, like MainActivity.java on Android, so that the app behaves
/// like the site in Safari:
/// - the site's new windows (a link with target=_blank, window.open: Bassem's «افتحها في صفحة جديدة», the terms under the
///   registration form …) open as a sheet over the page that opened it, which keeps running under it like a browser tab under a
///   new one (a live call goes on); window.close(), «إغلاق» / Close or a swipe down closes the sheet (MIGWindowController);
/// - another site's page opened during a live call shows in an in-app Safari sheet over the call, so the app stays in front and the
///   call keeps its microphone; outside a call Safari, as before (openOtherSite);
/// - Universal Links (applinks:madeinegyptgate.com in App.entitlements) open the tapped page in the app; during a live call it opens
///   over the call (a new tab), and a link that starts a call of its own asks first (openSitePage);
/// - the page's alert() / confirm() / prompt() in the page's language with the site's name as the title, shown over whatever sheet
///   is on top (MIGUIDelegate); microphone / camera only for the platform's own pages;
/// - the back / forward swipe and pull to refresh (never during a live call), a page-load bar, the brand red behind the status bar;
/// - the place in the site is kept: when iOS ended the app in the background (switching to Mail for the sign-in code …) it reopens
///   the same page, for 12 hours (MIGPlace);
/// - the offline page www/offline.html only when the site cannot be reached, never for a cancelled navigation, with the page to
///   retry (#u=…); capacitor.config.json has no server.errorPath (Capacitor would show it for every failure, cancellations too);
/// - files the site hands out (downloads, a blob: file such as the .ics of the events pages) open in Quick Look when it can show
///   them (Add to Calendar for a meeting, PDFs, pictures), else in the share sheet; window.print() shows the system print sheet;
/// - phone / e-mail links on Janna's or Bassem's shared screen (a frame) open Phone or Mail, as Safari does.
class MainViewController: CAPBridgeViewController {

    /// the site's header red #8E0B20 (also the window, the splash and the status bar)
    static let brandRed = UIColor(red: 142.0 / 255.0, green: 11.0 / 255.0, blue: 32.0 / 255.0, alpha: 1)

    /// the app's own words: Arabic on an Arabic iPhone, English on any other (CFBundleLocalizations ar + en)
    static var arabicUI: Bool {
        return (Bundle.main.preferredLocalizations.first ?? "en").lowercased().hasPrefix("ar")
    }

    /// set by SceneDelegate before the view loads: the app was started by a Universal Link, so that page wins over the kept one
    var launchedByLink = false

    /// downloads of every window
    let files = MIGFiles()
    /// the UI delegate of the main page and of every sheet
    private(set) var pageUI: MIGUIDelegate?
    private var webDelegate: MIGWebDelegate?
    private let printer = MIGPrintHandler()
    private let sheetStyle = MIGSheetStyle()
    /// the pages open in sheets, bottom to top
    private var windows: [MIGWindowController] = []
    private let statusShade = UIView()
    private let loadBar = UIProgressView(progressViewStyle: .bar)
    private var loadWatch: NSKeyValueObservation?
    private let pull = UIRefreshControl()
    /// the language of each page (html lang), for the buttons of its dialogs
    private let langs = NSMapTable<WKWebView, NSString>.weakToStrongObjects()
    /// the history entry the main page showed last (skipBlankStep)
    private weak var lastItem: WKBackForwardListItem?

    override func capacitorDidLoad() {
        super.capacitorDidLoad()
        files.owner = self
        printer.owner = self
        if let webView = webView {
            if let capacitor = webView.navigationDelegate as? WebViewDelegationHandler {
                let delegate = MIGWebDelegate(inner: capacitor, owner: self)
                webDelegate = delegate // WKWebView holds its navigation delegate weakly
                webView.navigationDelegate = delegate
            }
            let ui = MIGUIDelegate(capacitor: webView.uiDelegate as? WebViewDelegationHandler, owner: self)
            pageUI = ui // WKWebView holds its UI delegate weakly
            webView.uiDelegate = ui
            webView.allowsBackForwardNavigationGestures = true // Safari's edge swipe (WebKit takes the right edge on an Arabic iPhone)
            webView.scrollView.bounces = true // Capacitor turns it off; Safari bounces, and pull to refresh needs it
            webView.scrollView.alwaysBounceVertical = true
            pull.tintColor = .white // on the brand red that shows above the page while it is pulled
            pull.addTarget(self, action: #selector(onPull), for: .valueChanged)
            webView.scrollView.refreshControl = pull
            let scripts = webView.configuration.userContentController // the same controller as Capacitor's (a shared object)
            printer.install(in: scripts)
            scripts.addUserScript(WKUserScript(source: MIGLinks.safeAreaJS, injectionTime: .atDocumentStart, forMainFrameOnly: true))
            loadWatch = webView.observe(\.estimatedProgress, options: [.new]) { [weak self] view, _ in
                self?.showLoad(of: view)
            }
        }
        // SceneDelegateProxy posts this for every Universal Link (on a cold start once the first view has appeared)
        NotificationCenter.default.addObserver(self, selector: #selector(onUniversalLink(_:)), name: .capacitorOpenUniversalLink, object: nil)
        NotificationCenter.default.addObserver(self, selector: #selector(onBackground(_:)), name: UIScene.didEnterBackgroundNotification, object: nil)
    }

    override func viewDidLoad() {
        super.viewDidLoad() // Capacitor starts loading server.url here
        statusShade.backgroundColor = MainViewController.brandRed
        statusShade.isUserInteractionEnabled = false
        view.addSubview(statusShade)
        loadBar.progressTintColor = MainViewController.brandRed
        loadBar.trackTintColor = .clear
        loadBar.isUserInteractionEnabled = false
        loadBar.alpha = 0
        view.addSubview(loadBar)
        restorePlace()
    }

    /// The status bar's white icons (plugins.StatusBar style DARK) always on the brand red, as on Android: a red strip over the top
    /// safe area, with the page-load bar right under it. With contentInset "always" the page starts below that area, but it
    /// scrolls through it, and the site's sticky header is white.
    override func viewDidLayoutSubviews() {
        super.viewDidLayoutSubviews()
        let top = view.safeAreaInsets.top
        statusShade.frame = CGRect(x: 0, y: 0, width: view.bounds.width, height: top)
        loadBar.frame = CGRect(x: 0, y: top, width: view.bounds.width, height: 3)
        let count = view.subviews.count
        if count < 2 || view.subviews[count - 1] !== loadBar || view.subviews[count - 2] !== statusShade {
            view.bringSubviewToFront(statusShade)
            view.bringSubviewToFront(loadBar)
        }
    }

    override func viewSafeAreaInsetsDidChange() {
        super.viewSafeAreaInsetsDidChange()
        view.setNeedsLayout()
    }

    // MARK: presenting

    /// the controller to present from: the top of the chain of presented controllers (a page's sheet, Quick Look, an alert …)
    func topController() -> UIViewController {
        var top: UIViewController = self
        while let next = top.presentedViewController, !next.isBeingDismissed {
            top = next
        }
        return top
    }

    /// presents over everything on screen; waits (2 s at most) while UIKit is still presenting or dismissing something
    func presentOnTop(_ controller: UIViewController, tries: Int = 0, failed: (() -> Void)? = nil) {
        let top = topController()
        if top.presentedViewController != nil || top.isBeingPresented || top.viewIfLoaded?.window == nil {
            guard tries < 10 else {
                failed?()
                return
            }
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.2) { [weak self] in
                guard let self = self else {
                    failed?()
                    return
                }
                self.presentOnTop(controller, tries: tries + 1, failed: failed)
            }
            return
        }
        top.present(controller, animated: true, completion: nil)
    }

    private var isForeground: Bool {
        return view.window?.windowScene?.activationState == .foregroundActive
    }

    // MARK: new windows (MIGUIDelegate)

    /// window.open / a link with target=_blank. A page of the site → a sheet with a web view of its own over the page that opened it;
    /// window.opener, window.name, the signed-in session and the MIGApp user agent come with the configuration WebKit hands over.
    /// Another site → openOtherSite; mailto: / tel: / whatsapp: … → their app; about:blank (data/bassem-tab.js front() asks for a
    /// window by its name), blob:, data: → no window.
    func newWindow(from opener: WKWebView, configuration: WKWebViewConfiguration, action: WKNavigationAction) -> WKWebView? {
        guard let url = action.request.url, let scheme = url.scheme?.lowercased() else { return nil }
        if scheme != "http" && scheme != "https" {
            if !MIGLinks.pageSchemes.contains(scheme) && scheme != "javascript" {
                openApp(url)
            }
            return nil
        }
        guard MIGLinks.isSiteHost(url.host) else {
            openOtherSite(url)
            return nil
        }
        if windows.count >= MIGWindowController.most, let top = windows.last {
            top.webView.load(action.request)
            return nil
        }
        // No Capacitor bridge in a window of its own (as on Android: the bridge is only in the main page): a content controller of
        // its own, with the print bridge only. WebKit checks only that the returned web view was made from this configuration (its
        // related web view), not which content controller it has.
        let controller = WKUserContentController()
        printer.install(in: controller)
        configuration.userContentController = controller
        let window = MIGWindowController(configuration: configuration, owner: self)
        presentWindow(window)
        return window.webView
    }

    /// a page of the site in a sheet of its own, without an opener: a link from another app while a call is open (a new tab), a
    /// link preview the member tapped during a call
    private func openWindow(_ url: URL) {
        if windows.count >= MIGWindowController.most, let top = windows.last {
            top.webView.load(URLRequest(url: url))
            return
        }
        guard let main = webView else { return }
        let shared = main.configuration
        let configuration = WKWebViewConfiguration()
        configuration.websiteDataStore = shared.websiteDataStore // signed in: the same cookies and storage
        configuration.applicationNameForUserAgent = shared.applicationNameForUserAgent // … MIGApp/1.0 (ios)
        configuration.allowsInlineMediaPlayback = shared.allowsInlineMediaPlayback
        configuration.allowsAirPlayForMediaPlayback = shared.allowsAirPlayForMediaPlayback
        configuration.mediaTypesRequiringUserActionForPlayback = shared.mediaTypesRequiringUserActionForPlayback
        if #available(iOS 15.4, *) {
            configuration.preferences.isElementFullscreenEnabled = shared.preferences.isElementFullscreenEnabled
        }
        let controller = WKUserContentController()
        printer.install(in: controller)
        configuration.userContentController = controller
        let window = MIGWindowController(configuration: configuration, owner: self)
        presentWindow(window)
        window.webView.load(URLRequest(url: url))
    }

    private func presentWindow(_ window: MIGWindowController) {
        windows.append(window)
        let sheet = UINavigationController(rootViewController: window)
        sheet.modalPresentationStyle = .pageSheet // never .fullScreen: that takes the page under it (a live call) out of the window
        sheet.presentationController?.delegate = window
        MIGWindowController.paint(sheet.navigationBar)
        presentOnTop(sheet) { [weak self, weak window] in
            if let self = self, let window = window {
                self.forget(window)
            }
        }
    }

    /// window.close() of a page in a sheet, or its «إغلاق» / Close: that sheet goes, with the ones over it
    func closeWindow(_ web: WKWebView) {
        guard let index = windows.firstIndex(where: { $0.webView === web }) else { return }
        let sheet = windows[index].navigationController
        drop(from: index)
        if let sheet = sheet, sheet.presentingViewController != nil, !sheet.isBeingDismissed {
            sheet.dismiss(animated: true, completion: nil)
        }
    }

    /// a sheet the member swiped away, or one that could not be shown
    func forget(_ window: MIGWindowController) {
        guard let index = windows.firstIndex(where: { $0 === window }) else { return }
        drop(from: index)
    }

    private func drop(from index: Int) {
        let gone = windows[index...]
        windows.removeSubrange(index...)
        for window in gone {
            window.tearDown() // its web view goes with the sheet: the page closes and its opener sees window.closed
        }
    }

    /// a sheet whose page turned into a file (a download link with target=_blank) and shows nothing: closed once the file is there,
    /// as a browser drops such a tab
    func closeIfEmpty(_ web: WKWebView?) {
        guard let web = web, web !== webView, web.backForwardList.currentItem == nil else { return }
        closeWindow(web)
    }

    private func closeAllWindows() {
        if !windows.isEmpty {
            drop(from: 0)
        }
        if presentedViewController != nil {
            dismiss(animated: true, completion: nil)
        }
    }

    // MARK: links the app takes over

    /// Navigations the app takes over instead of loading them where they point (true = cancel the navigation):
    /// - a phone / e-mail / SMS / FaceTime link in a frame (Janna's / Bassem's shared screen): WKWebView cannot load it there, and
    ///   Safari opens Phone or Mail;
    /// - another site's page at the top level or in a new window: openOtherSite.
    func handOff(_ action: WKNavigationAction) -> Bool {
        guard let url = action.request.url, let scheme = url.scheme?.lowercased() else { return false }
        if let frame = action.targetFrame, !frame.isMainFrame {
            guard MIGLinks.phoneSchemes.contains(scheme) else { return false }
            openApp(url)
            return true
        }
        guard scheme == "http" || scheme == "https", !MIGLinks.isSiteHost(url.host) else { return false }
        openOtherSite(url)
        return true
    }

    /// Another site's page (an official source in Bassem's results, a web search result, a page Janna opens …). During a live call:
    /// an in-app Safari sheet over the call, as a browser opens a tab and stays in front (iOS would suspend the app, and the call
    /// with it, if Safari came to the front). Outside a call: Safari, as Capacitor does.
    func openOtherSite(_ url: URL) {
        callViews { [weak self] calls in
            guard let self = self, self.isForeground else { return }
            if calls.isEmpty {
                UIApplication.shared.open(url, options: [:], completionHandler: nil)
                return
            }
            let safari = SFSafariViewController(url: url)
            safari.modalPresentationStyle = .pageSheet // never .fullScreen: that takes the call's web view out of the window
            safari.presentationController?.delegate = self.sheetStyle
            safari.preferredBarTintColor = MainViewController.brandRed
            safari.preferredControlTintColor = .white
            safari.dismissButtonStyle = .close
            self.presentOnTop(safari)
        }
    }

    /// mailto: / tel: / sms: / whatsapp: / app-settings: … in the phone's app for it (WKWebView cannot load them)
    func openApp(_ url: URL) {
        guard isForeground else { return }
        UIApplication.shared.open(url, options: [:], completionHandler: nil)
    }

    /// a link preview the member tapped (long press, ios.allowsLinkPreview): in the app, never in Safari (WebKit's default)
    func openLink(_ url: URL, from web: WKWebView) {
        let scheme = url.scheme?.lowercased() ?? ""
        guard scheme == "http" || scheme == "https" else {
            openApp(url)
            return
        }
        guard MIGLinks.isSiteHost(url.host) else {
            openOtherSite(url)
            return
        }
        callViews { [weak self, weak web] calls in
            guard let self = self, let web = web else { return }
            if calls.isEmpty {
                web.load(URLRequest(url: url))
            } else {
                self.openWindow(url) // the call's page stays
            }
        }
    }

    /// The pages with a live call open (Janna / Bassem: data/janna-live.js JANNA_LIVE.isOpen(), html.jnl-on), asked in the main page
    /// and in every sheet; answers on the main queue, within 1.5 s (a page that does not answer counts as no call).
    func callViews(_ done: @escaping ([WKWebView]) -> Void) {
        var views = windows.map { $0.webView }
        if let main = webView {
            views.insert(main, at: 0)
        }
        let tally = MIGTally(count: views.count, done: done)
        if views.isEmpty {
            tally.finish()
            return
        }
        for view in views {
            view.evaluateJavaScript(MIGLinks.callOpenJS) { result, _ in
                tally.answer(view, open: (result as? Bool) == true)
            }
        }
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.5) {
            tally.finish()
        }
    }

    // MARK: Universal Links

    @objc private func onUniversalLink(_ note: Notification) {
        guard let info = note.object as? [String: Any], let url = info["url"] as? URL else { return }
        openSitePage(url)
    }

    /// A page of the site tapped in another app (the «ابعتلي» e-mail, a meeting link in WhatsApp …). A browser opens it in a new
    /// tab: while a call is open (or other pages are open in sheets) it opens in a sheet over them; a link that starts a call of its
    /// own (…live=1, a meeting page) asks first, since it ends the open one; otherwise the main page loads it, as before.
    func openSitePage(_ url: URL) {
        guard MIGLinks.isSite(url) else { return }
        callViews { [weak self] calls in
            guard let self = self else { return }
            let startsCall = MIGLinks.startsCall(url)
            if !calls.isEmpty {
                if startsCall {
                    self.askToEndCall(then: url)
                } else {
                    self.openWindow(url)
                }
            } else if !self.windows.isEmpty && !startsCall {
                self.openWindow(url)
            } else {
                self.closeAllWindows()
                self.webView?.load(URLRequest(url: url))
            }
        }
    }

    private func askToEndCall(then url: URL) {
        let ar = MainViewController.arabicUI
        let alert = UIAlertController(title: nil, message: ar ? "تنهي المكالمة الحالية وتفتح الرابط؟" : "End the current call and open the link?", preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: ar ? "لا، أكمل المكالمة" : "No, stay on the call", style: .cancel, handler: nil))
        alert.addAction(UIAlertAction(title: ar ? "نعم، افتح الرابط" : "Yes, open the link", style: .destructive) { [weak self] _ in
            DispatchQueue.main.async { [weak self] in
                guard let self = self else { return }
                self.closeAllWindows() // a call in a sheet ends with its sheet
                self.webView?.load(URLRequest(url: url))
            }
        })
        presentOnTop(alert)
    }

    // MARK: the page's state (MIGWebDelegate, MIGChildDelegate)

    func pageCommitted(_ web: WKWebView) {
        langs.removeObject(forKey: web) // a new document: its language is read again when it has loaded
    }

    func pageFinished(_ web: WKWebView) {
        rememberLang(of: web)
        guard web === webView else { return }
        endPull()
        hideLoad()
        MIGPlace.save(web.url)
        skipBlankStep(web)
    }

    /// network failures only: not a cancelled navigation (-999: a second tap, a Universal Link replacing the first page) and not
    /// WebKit's own interruptions (a download, an unsupported page)
    func pageFailed(_ web: WKWebView, error: Error) {
        if web === webView {
            endPull()
            hideLoad()
        }
        let ns = error as NSError
        guard ns.domain == NSURLErrorDomain, ns.code != NSURLErrorCancelled, ns.code != NSURLErrorUnsupportedURL else { return }
        let failing = ns.userInfo[NSURLErrorFailingURLErrorKey] as? URL
        if let failing = failing, !MIGLinks.isSite(failing) { return }
        showOffline(in: web, failedURL: failing)
    }

    /// The offline page with the page to retry: capacitor://localhost/offline.html#u=<the page that failed> in the main page; the
    /// same file of the app bundle in a sheet (no Capacitor there)
    func showOffline(in web: WKWebView, failedURL: URL?) {
        var hash = ""
        if let failed = failedURL, MIGLinks.isSite(failed),
           let encoded = failed.absoluteString.addingPercentEncoding(withAllowedCharacters: .alphanumerics) {
            hash = "#u=" + encoded
        }
        if web === webView {
            guard let local = bridge?.config.localURL,
                  let url = URL(string: local.appendingPathComponent("offline.html").absoluteString + hash) else { return }
            web.load(URLRequest(url: url))
            return
        }
        guard let file = Bundle.main.url(forResource: "offline", withExtension: "html", subdirectory: "public"),
              let url = URL(string: file.absoluteString + hash) else { return }
        web.loadFileURL(url, allowingReadAccessTo: file.deletingLastPathComponent())
    }

    /// A back (or forward) step that landed on the offline page or an empty document goes on to the next page, as Android's back
    /// button skips them (MainActivity.onBack). The offline page replaces itself with the page once it loads, so this is a page
    /// left behind by a link tapped on it.
    private func skipBlankStep(_ web: WKWebView) {
        let list = web.backForwardList
        let from = lastItem
        lastItem = list.currentItem
        guard MIGLinks.isOfflineOrBlank(web.url), let came = from, came !== list.currentItem else { return }
        if list.forwardItem === came, web.canGoBack {
            web.goBack()
        } else if list.backItem === came, web.canGoForward {
            web.goForward()
        }
    }

    // MARK: dialogs in the page's language (MIGUIDelegate)

    /// «حسناً» / «إلغاء» on an Arabic page, OK / Cancel on an English one (html lang; before it is known: the dialog's own text)
    func dialogWords(_ web: WKWebView, message: String) -> (ok: String, cancel: String) {
        var arabic = MIGLinks.hasArabic(message)
        if let lang = langs.object(forKey: web), lang.length > 0 {
            arabic = (lang as String).lowercased().hasPrefix("ar")
        }
        return arabic ? (ok: "حسناً", cancel: "إلغاء") : (ok: "OK", cancel: "Cancel")
    }

    func isMainPage(_ web: WKWebView) -> Bool {
        return web === webView
    }

    private func rememberLang(of web: WKWebView) {
        web.evaluateJavaScript("document.documentElement.lang") { [weak self, weak web] result, _ in
            guard let self = self, let web = web, let lang = result as? String else { return }
            self.langs.setObject(lang as NSString, forKey: web)
        }
    }

    // MARK: pull to refresh and the page-load bar

    /// Safari's pull to refresh, except while a live call is open: a reload would end it
    @objc private func onPull() {
        guard let web = webView else {
            pull.endRefreshing()
            return
        }
        web.evaluateJavaScript(MIGLinks.callOpenJS) { [weak self, weak web] result, _ in
            guard let self = self else { return }
            guard let web = web, (result as? Bool) != true else {
                self.pull.endRefreshing()
                return
            }
            web.reload()
            DispatchQueue.main.asyncAfter(deadline: .now() + 15) { [weak self] in
                self?.endPull()
            }
        }
    }

    private func endPull() {
        if pull.isRefreshing {
            pull.endRefreshing()
        }
    }

    /// the bar under the status bar while the main page loads (not for frames: the shared screen of a call changes pages by itself)
    private func showLoad(of web: WKWebView) {
        let value = Float(web.estimatedProgress)
        guard web.isLoading, value < 1 else {
            hideLoad()
            return
        }
        if loadBar.alpha < 1 {
            loadBar.setProgress(0, animated: false)
            loadBar.alpha = 1
        }
        loadBar.setProgress(max(value, 0.1), animated: true)
    }

    private func hideLoad() {
        guard loadBar.alpha > 0 else { return }
        loadBar.setProgress(1, animated: true)
        UIView.animate(withDuration: 0.25, delay: 0.15, options: [], animations: {
            self.loadBar.alpha = 0
        }, completion: { _ in
            if self.loadBar.alpha == 0 {
                self.loadBar.setProgress(0, animated: false)
            }
        })
    }

    // MARK: the place in the site (MIGPlace)

    @objc private func onBackground(_ note: Notification) {
        MIGPlace.save(webView?.url)
    }

    /// after iOS ended the app: the page it showed (not when a Universal Link started it, and not the start page itself)
    private func restorePlace() {
        guard !launchedByLink, let web = webView, let place = MIGPlace.saved() else { return }
        if let start = bridge?.config.appStartServerURL, MIGLinks.samePage(place, start) { return }
        web.load(URLRequest(url: place))
    }

    // MARK: files and printing

    /// a file the site handed out: Quick Look when it can show it (a calendar file with Add to Calendar, a PDF, a picture; its own
    /// share button), else the share sheet
    func share(fileAt url: URL) {
        if QLPreviewController.canPreview(url as NSURL) {
            let preview = MIGPreview(item: url)
            preview.modalPresentationStyle = .pageSheet
            preview.presentationController?.delegate = sheetStyle
            presentOnTop(preview)
            return
        }
        let sheet = UIActivityViewController(activityItems: [url], applicationActivities: nil)
        if let popover = sheet.popoverPresentationController, let anchor = topController().view { // iPad
            popover.sourceView = anchor
            popover.sourceRect = CGRect(x: anchor.bounds.midX, y: anchor.bounds.maxY - 40, width: 1, height: 1)
        }
        presentOnTop(sheet)
    }

    /// window.print() (MIGPrintHandler): the system print sheet (Save as PDF included) with the page's own print styles
    func printPage(_ web: WKWebView) {
        let info = UIPrintInfo(dictionary: nil)
        info.outputType = .general
        if let title = web.title, !title.isEmpty {
            info.jobName = title
        }
        let job = UIPrintInteractionController.shared
        job.printInfo = info
        job.printFormatter = web.viewPrintFormatter()
        if UIDevice.current.userInterfaceIdiom == .pad, let anchor = topController().view {
            job.present(from: CGRect(x: anchor.bounds.midX, y: anchor.bounds.midY, width: 1, height: 1), in: anchor, animated: true, completionHandler: nil)
        } else {
            job.present(animated: true, completionHandler: nil)
        }
    }
}

enum MIGLinks {
    /// schemes that load in a web view; any other (mailto:, tel:, whatsapp:, app-settings: …) belongs to an app of the phone
    static let pageSchemes: Set<String> = ["http", "https", "about", "blob", "data", "file", "capacitor"]
    /// links a frame cannot load and Safari hands to Phone, Mail, Messages or FaceTime
    static let phoneSchemes: Set<String> = ["tel", "telprompt", "mailto", "sms", "facetime", "facetime-audio"]
    /// The main page keeps the page below the status bar (capacitor.config.json ios.contentInset "always": the scroll view insets
    /// it, and the red strip of MainViewController.viewDidLayoutSubviews sits there). Current WebKit (WKWebViewIOS.mm
    /// _computedUnobscuredSafeAreaInset) gives a page with viewport-fit=cover the safe-area insets in env(safe-area-inset-*) even
    /// then, and the site's own pages (/, /market/, /advisor/, /register/ …) pad themselves by them: the band would be there twice.
    /// This script takes viewport-fit=cover out of the page's viewport tag in the app's main page only, so those pages lay out like
    /// the generated hubs (no viewport-fit, env() = 0), as they did on older iOS. Pages in sheets keep Safari's own handling.
    static let safeAreaJS = #"(function(){var d=document,o=null;function fix(){var m=d.querySelector('meta[name="viewport"]');if(!m)return false;var c=m.getAttribute("content")||"";if(/viewport-fit\s*=\s*cover/i.test(c))m.setAttribute("content",c.replace(/\s*,?\s*viewport-fit\s*=\s*cover\s*/ig,""));return true;}if(fix())return;try{o=new MutationObserver(function(){if(fix())o.disconnect();});o.observe(d,{childList:true,subtree:true});}catch(e){}})();"#
    /// true while a live call (Janna / Bassem) is open in the page: data/janna-live.js
    static let callOpenJS = "(function(){try{var J=window.JANNA_LIVE;return !!((J&&J.isOpen&&J.isOpen())||document.documentElement.classList.contains('jnl-on'));}catch(e){return false;}})()"

    static func isSiteHost(_ host: String?) -> Bool {
        guard let host = host?.lowercased() else { return false }
        return host == "madeinegyptgate.com" || host == "www.madeinegyptgate.com"
    }

    /// the platform's own pages (the only ones that load inside the app: server.url + server.allowNavigation)
    static func isSite(_ url: URL) -> Bool {
        return url.scheme?.lowercased() == "https" && isSiteHost(url.host)
    }

    static func isSite(_ origin: WKSecurityOrigin) -> Bool {
        return origin.protocol.lowercased() == "https" && isSiteHost(origin.host)
    }

    /// a link that starts a live call where it opens: …?live=1 / #live=1 (Janna's call, Bassem's desk) or a meeting page
    static func startsCall(_ url: URL) -> Bool {
        guard isSite(url) else { return false }
        let tail = "?" + (url.query ?? "") + "#" + (url.fragment ?? "")
        if tail.range(of: "[?&#]live=1([&#]|$)", options: .regularExpression) != nil { return true }
        var path = url.path.lowercased()
        if path.hasPrefix("/en/") {
            path = String(path.dropFirst(3))
        }
        return path == "/meeting" || path.hasPrefix("/meeting/") || path.hasPrefix("/meeting.html")
    }

    /// history entries that are not pages of the site: the offline page (capacitor://localhost/…, or the bundled file in a sheet)
    /// and empty documents
    static func isOfflineOrBlank(_ url: URL?) -> Bool {
        guard let scheme = url?.scheme?.lowercased() else { return false }
        return scheme == "capacitor" || scheme == "about" || scheme == "data" || scheme == "file"
    }

    static func hasArabic(_ text: String) -> Bool {
        for scalar in text.unicodeScalars {
            switch scalar.value {
            case 0x0600...0x06FF, 0x0750...0x077F, 0xFB50...0xFDFF, 0xFE70...0xFEFF:
                return true
            default:
                continue
            }
        }
        return false
    }

    /// the same page, with or without the final slash
    static func samePage(_ a: URL, _ b: URL) -> Bool {
        let slash = CharacterSet(charactersIn: "/")
        return a.absoluteString.trimmingCharacters(in: slash) == b.absoluteString.trimmingCharacters(in: slash)
    }

    /// The page to reopen after iOS ended the app: a page of the site (not a file or an API answer), without what would act a second
    /// time (live=1 starts a call; lt= and login= are one-time sign-in links).
    static func restorable(_ url: URL?) -> URL? {
        guard let url = url, isSite(url), var parts = URLComponents(url: url, resolvingAgainstBaseURL: false) else { return nil }
        let path = parts.percentEncodedPath.lowercased()
        for files in ["/api/", "/media/", "/data/", "/img/", "/assets/", "/_seo/", "/.well-known/"] where path.hasPrefix(files) {
            return nil
        }
        let once: Set<String> = ["live", "lt", "login"]
        func keep(_ pair: Substring) -> Bool {
            let key = pair.split(separator: "=", maxSplits: 1, omittingEmptySubsequences: false).first.map { String($0).lowercased() } ?? ""
            return !once.contains(key)
        }
        if let query = parts.percentEncodedQuery {
            let kept = query.split(separator: "&").filter(keep)
            parts.percentEncodedQuery = kept.isEmpty ? nil : kept.joined(separator: "&")
        }
        if let fragment = parts.percentEncodedFragment {
            let kept = fragment.split(separator: "&").filter(keep)
            parts.percentEncodedFragment = kept.isEmpty ? nil : kept.joined(separator: "&")
        }
        return parts.url
    }
}

/// The page the app showed last, kept for 12 hours, so that the app reopens it after iOS ended it in the background (as Safari
/// reopens its tab): the member who went to Mail for the sign-in code comes back to the code step (data/mig-api.js keeps that step).
enum MIGPlace {
    private static let urlKey = "mig.place.url"
    private static let timeKey = "mig.place.at"
    static let maxAge: TimeInterval = 12 * 3600

    static func save(_ url: URL?) {
        guard let place = MIGLinks.restorable(url) else { return }
        let store = UserDefaults.standard
        store.set(place.absoluteString, forKey: urlKey)
        store.set(Date().timeIntervalSince1970, forKey: timeKey)
    }

    static func saved() -> URL? {
        let store = UserDefaults.standard
        guard let text = store.string(forKey: urlKey), let url = URL(string: text), MIGLinks.isSite(url) else { return nil }
        let at = store.double(forKey: timeKey)
        let age = Date().timeIntervalSince1970 - at
        guard at > 0, age >= 0, age < maxAge else { return nil }
        return url
    }
}

/// Capacitor's navigation delegate for the main page, with the app's additions: links the app takes over (handOff), the offline
/// page, files, the page's state (MainViewController.pageCommitted / pageFinished / pageFailed). Every other WKNavigationDelegate
/// call is passed to Capacitor's WebViewDelegationHandler unchanged (the methods it implements in Capacitor 8.6; check this list when
/// upgrading Capacitor). The UI delegate is MIGUIDelegate.
final class MIGWebDelegate: NSObject, WKNavigationDelegate {

    private let inner: WebViewDelegationHandler
    private weak var owner: MainViewController?

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
        owner?.pageFinished(webView)
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
        if let owner = owner, owner.handOff(navigationAction) {
            decisionHandler(.cancel)
            return
        }
        inner.webView(webView, decidePolicyFor: navigationAction, decisionHandler: decisionHandler)
    }

    @objc(webView:didFailProvisionalNavigation:withError:)
    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        inner.webView(webView, didFailProvisionalNavigation: navigation, withError: error) // logs only (no errorPath set)
        owner?.pageFailed(webView, error: error)
    }

    @objc(webView:didFailNavigation:withError:)
    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        inner.webView(webView, didFail: navigation, withError: error)
        owner?.pageFailed(webView, error: error)
    }

    // MARK: the app's own (Capacitor does not implement these)

    @objc(webView:didCommitNavigation:)
    func webView(_ webView: WKWebView, didCommit navigation: WKNavigation!) {
        owner?.pageCommitted(webView)
    }

    @objc(webView:decidePolicyForNavigationResponse:decisionHandler:)
    func webView(_ webView: WKWebView, decidePolicyFor navigationResponse: WKNavigationResponse, decisionHandler: @escaping (WKNavigationResponsePolicy) -> Void) {
        decisionHandler(MIGFiles.policy(for: navigationResponse))
    }

    @objc(webView:navigationAction:didBecomeDownload:)
    func webView(_ webView: WKWebView, navigationAction: WKNavigationAction, didBecome download: WKDownload) {
        download.delegate = owner?.files
    }

    @objc(webView:navigationResponse:didBecomeDownload:)
    func webView(_ webView: WKWebView, navigationResponse: WKNavigationResponse, didBecome download: WKDownload) {
        download.delegate = owner?.files
    }
}

/// The navigation delegate of a page in a sheet (MIGWindowController): pages of the site and frames load there; another site's page
/// at the top level → MainViewController.openOtherSite; mailto: / tel: … → their app; files as in the main page. Never Capacitor's
/// delegate: its didStartProvisionalNavigation resets the bridge of the main page.
final class MIGChildDelegate: NSObject, WKNavigationDelegate {

    private weak var owner: MainViewController?

    init(owner: MainViewController) {
        self.owner = owner
        super.init()
    }

    @objc(webView:decidePolicyForNavigationAction:decisionHandler:)
    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        if navigationAction.shouldPerformDownload {
            decisionHandler(.download)
            return
        }
        guard let owner = owner, let url = navigationAction.request.url else {
            decisionHandler(.allow)
            return
        }
        if owner.handOff(navigationAction) {
            decisionHandler(.cancel)
            return
        }
        let scheme = url.scheme?.lowercased() ?? ""
        let topLevel = navigationAction.targetFrame?.isMainFrame ?? true
        if topLevel && !MIGLinks.pageSchemes.contains(scheme) {
            owner.openApp(url)
            decisionHandler(.cancel)
            return
        }
        decisionHandler(.allow)
    }

    @objc(webView:decidePolicyForNavigationResponse:decisionHandler:)
    func webView(_ webView: WKWebView, decidePolicyFor navigationResponse: WKNavigationResponse, decisionHandler: @escaping (WKNavigationResponsePolicy) -> Void) {
        decisionHandler(MIGFiles.policy(for: navigationResponse))
    }

    @objc(webView:navigationAction:didBecomeDownload:)
    func webView(_ webView: WKWebView, navigationAction: WKNavigationAction, didBecome download: WKDownload) {
        download.delegate = owner?.files
    }

    @objc(webView:navigationResponse:didBecomeDownload:)
    func webView(_ webView: WKWebView, navigationResponse: WKNavigationResponse, didBecome download: WKDownload) {
        download.delegate = owner?.files
    }

    @objc(webView:didCommitNavigation:)
    func webView(_ webView: WKWebView, didCommit navigation: WKNavigation!) {
        owner?.pageCommitted(webView)
    }

    @objc(webView:didFinishNavigation:)
    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        owner?.pageFinished(webView)
    }

    @objc(webView:didFailProvisionalNavigation:withError:)
    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        owner?.pageFailed(webView, error: error)
    }

    @objc(webView:didFailNavigation:withError:)
    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        owner?.pageFailed(webView, error: error)
    }

    @objc(webViewWebContentProcessDidTerminate:)
    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        webView.reload()
    }
}

/// The UI delegate of the main page and of every sheet, in place of Capacitor's (which it calls where Capacitor has work to do):
/// new windows (sheets), window.close(), the page's dialogs, permissions, link previews.
final class MIGUIDelegate: NSObject, WKUIDelegate {

    private let capacitor: WebViewDelegationHandler?
    private weak var owner: MainViewController?

    init(capacitor: WebViewDelegationHandler?, owner: MainViewController) {
        self.capacitor = capacitor
        self.owner = owner
        super.init()
    }

    // MARK: new windows

    @objc(webView:createWebViewWithConfiguration:forNavigationAction:windowFeatures:)
    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration, for navigationAction: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        return owner?.newWindow(from: webView, configuration: configuration, action: navigationAction)
    }

    @objc(webViewDidClose:)
    func webViewDidClose(_ webView: WKWebView) {
        owner?.closeWindow(webView)
    }

    // MARK: permissions: the platform's own pages only (as MigChromeClient on Android); Capacitor grants them without a second prompt

    @objc(webView:requestMediaCapturePermissionForOrigin:initiatedByFrame:type:decisionHandler:)
    func webView(_ webView: WKWebView, requestMediaCapturePermissionFor origin: WKSecurityOrigin, initiatedByFrame frame: WKFrameInfo, type: WKMediaCaptureType, decisionHandler: @escaping (WKPermissionDecision) -> Void) {
        guard MIGLinks.isSite(origin), MIGLinks.isSite(frame.securityOrigin) else {
            decisionHandler(.deny)
            return
        }
        if let capacitor = capacitor {
            capacitor.webView(webView, requestMediaCapturePermissionFor: origin, initiatedByFrame: frame, type: type, decisionHandler: decisionHandler)
        } else {
            decisionHandler(.grant)
        }
    }

    @objc(webView:requestDeviceOrientationAndMotionPermissionForOrigin:initiatedByFrame:decisionHandler:)
    func webView(_ webView: WKWebView, requestDeviceOrientationAndMotionPermissionFor origin: WKSecurityOrigin, initiatedByFrame frame: WKFrameInfo, decisionHandler: @escaping (WKPermissionDecision) -> Void) {
        guard MIGLinks.isSite(origin), MIGLinks.isSite(frame.securityOrigin) else {
            decisionHandler(.deny)
            return
        }
        if let capacitor = capacitor {
            capacitor.webView(webView, requestDeviceOrientationAndMotionPermissionFor: origin, initiatedByFrame: frame, decisionHandler: decisionHandler)
        } else {
            decisionHandler(.grant)
        }
    }

    // MARK: alert() / confirm() / prompt(): as Safari shows them (the site's name as the title, buttons in the page's language, the
    // prompt's default text), over whatever sheet is on top. Capacitor's own present from the main page with English buttons, and
    // fail while a sheet is up.

    @objc(webView:runJavaScriptAlertPanelWithMessage:initiatedByFrame:completionHandler:)
    func webView(_ webView: WKWebView, runJavaScriptAlertPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping () -> Void) {
        let answer = MIGAnswer<Bool>(fallback: true) { _ in completionHandler() }
        guard let owner = owner else {
            answer.give(true)
            return
        }
        let words = owner.dialogWords(webView, message: message)
        let alert = UIAlertController(title: MIGUIDelegate.title(of: frame), message: message, preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: words.ok, style: .default) { _ in answer.give(true) })
        owner.presentOnTop(alert)
    }

    @objc(webView:runJavaScriptConfirmPanelWithMessage:initiatedByFrame:completionHandler:)
    func webView(_ webView: WKWebView, runJavaScriptConfirmPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (Bool) -> Void) {
        let answer = MIGAnswer<Bool>(fallback: false, completionHandler)
        guard let owner = owner else {
            answer.give(false)
            return
        }
        let words = owner.dialogWords(webView, message: message)
        let alert = UIAlertController(title: MIGUIDelegate.title(of: frame), message: message, preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: words.cancel, style: .cancel) { _ in answer.give(false) })
        alert.addAction(UIAlertAction(title: words.ok, style: .default) { _ in answer.give(true) })
        owner.presentOnTop(alert)
    }

    @objc(webView:runJavaScriptTextInputPanelWithPrompt:defaultText:initiatedByFrame:completionHandler:)
    func webView(_ webView: WKWebView, runJavaScriptTextInputPanelWithPrompt prompt: String, defaultText: String?, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (String?) -> Void) {
        guard let owner = owner else {
            completionHandler(nil)
            return
        }
        // Capacitor's own synchronous calls (CapacitorCookies), from its bridge in the main page only
        if let capacitor = capacitor, owner.isMainPage(webView), frame.isMainFrame, MIGUIDelegate.isCapacitorCall(prompt) {
            capacitor.webView(webView, runJavaScriptTextInputPanelWithPrompt: prompt, defaultText: defaultText, initiatedByFrame: frame, completionHandler: completionHandler)
            return
        }
        let answer = MIGAnswer<String?>(fallback: nil, completionHandler)
        let words = owner.dialogWords(webView, message: prompt)
        let alert = UIAlertController(title: MIGUIDelegate.title(of: frame), message: prompt, preferredStyle: .alert)
        alert.addTextField { field in
            field.text = defaultText
        }
        alert.addAction(UIAlertAction(title: words.cancel, style: .cancel) { _ in answer.give(nil) })
        alert.addAction(UIAlertAction(title: words.ok, style: .default) { [weak alert] _ in
            answer.give(alert?.textFields?.first?.text ?? defaultText ?? "")
        })
        owner.presentOnTop(alert)
    }

    // MARK: a link preview the member tapped (long press with ios.allowsLinkPreview): in the app; WebKit's default opens Safari

    @objc(webView:contextMenuForElement:willCommitWithAnimator:)
    func webView(_ webView: WKWebView, contextMenuForElement elementInfo: WKContextMenuElementInfo, willCommitWithAnimator animator: UIContextMenuInteractionCommitAnimating) {
        guard let url = elementInfo.linkURL else { return }
        animator.addCompletion { [weak self, weak webView] in
            guard let owner = self?.owner, let webView = webView else { return }
            owner.openLink(url, from: webView)
        }
    }

    /// the site's name, as Safari titles a page's dialog
    static func title(of frame: WKFrameInfo) -> String? {
        let host = frame.securityOrigin.host
        return host.isEmpty ? nil : host
    }

    static func isCapacitorCall(_ prompt: String) -> Bool {
        guard prompt.hasPrefix("{"), let data = prompt.data(using: .utf8),
              let payload = (try? JSONSerialization.jsonObject(with: data, options: [])) as? [String: Any],
              let type = payload["type"] as? String else { return false }
        return type == "CapacitorCookies.get" || type == "CapacitorCookies.set"
    }
}

/// A page of the site opened in a new window (target=_blank, window.open, a link from another app during a call): a sheet over the
/// page that opened it, the way a browser tab sits over the call's tab. The page that opened it keeps running in the window under
/// it. «إغلاق» / Close, a swipe down or the page's own window.close() closes it; Bassem's «ارجع للمكالمة» does that too.
final class MIGWindowController: UIViewController, UIAdaptivePresentationControllerDelegate {

    /// sheets over sheets: at most this many; a further page opens in the top one
    static let most = 3

    let webView: WKWebView
    private let pages: MIGChildDelegate
    private weak var owner: MainViewController?
    private var titleWatch: NSKeyValueObservation?
    private var backWatch: NSKeyValueObservation?
    /// ‹ back, while the sheet's page has a page before it (also the edge swipe), as Safari's back button
    private lazy var backItem: UIBarButtonItem = {
        let item = UIBarButtonItem(image: UIImage(systemName: "chevron.backward"), style: .plain, target: self, action: #selector(onBack))
        item.accessibilityLabel = MainViewController.arabicUI ? "رجوع" : "Back"
        return item
    }()

    init(configuration: WKWebViewConfiguration, owner: MainViewController) {
        webView = WKWebView(frame: .zero, configuration: configuration)
        pages = MIGChildDelegate(owner: owner)
        self.owner = owner
        super.init(nibName: nil, bundle: nil)
        webView.navigationDelegate = pages
        webView.uiDelegate = owner.pageUI
        webView.allowsBackForwardNavigationGestures = true
        webView.allowsLinkPreview = owner.webView?.allowsLinkPreview ?? false // as in the main page (ios.allowsLinkPreview)
        if #available(iOS 16.4, *) {
            webView.isInspectable = owner.webView?.isInspectable ?? false // Web Inspector as for the main page (webContentsDebuggingEnabled)
        }
    }

    required init?(coder: NSCoder) {
        return nil
    }

    override func loadView() {
        view = webView
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        navigationItem.rightBarButtonItem = UIBarButtonItem(title: MainViewController.arabicUI ? "إغلاق" : "Close", style: .done, target: self, action: #selector(onClose))
        navigationItem.title = webView.title
        titleWatch = webView.observe(\.title, options: [.new]) { [weak self] view, _ in
            self?.navigationItem.title = view.title
        }
        backWatch = webView.observe(\.canGoBack, options: [.initial, .new]) { [weak self] view, _ in
            guard let self = self else { return }
            self.navigationItem.leftBarButtonItem = view.canGoBack ? self.backItem : nil
        }
    }

    @objc private func onClose() {
        owner?.closeWindow(webView)
    }

    @objc private func onBack() {
        if webView.canGoBack {
            webView.goBack()
        }
    }

    /// iPhone in landscape: over the full screen, never in place of it (the page under it, a live call, stays in the window)
    @objc(adaptivePresentationStyleForPresentationController:traitCollection:)
    func adaptivePresentationStyle(for controller: UIPresentationController, traitCollection: UITraitCollection) -> UIModalPresentationStyle {
        return .overFullScreen
    }

    /// swiped down
    @objc(presentationControllerDidDismiss:)
    func presentationControllerDidDismiss(_ presentationController: UIPresentationController) {
        owner?.forget(self)
    }

    func tearDown() {
        titleWatch?.invalidate()
        titleWatch = nil
        backWatch?.invalidate()
        backWatch = nil
        webView.stopLoading()
        webView.navigationDelegate = nil
        webView.uiDelegate = nil
    }

    /// the site's red bar with white words, like its header
    static func paint(_ bar: UINavigationBar) {
        let look = UINavigationBarAppearance()
        look.configureWithOpaqueBackground()
        look.backgroundColor = MainViewController.brandRed
        look.titleTextAttributes = [.foregroundColor: UIColor.white]
        bar.standardAppearance = look
        bar.compactAppearance = look
        bar.scrollEdgeAppearance = look
        bar.tintColor = .white
    }
}

/// Sheets that are not pages (another site in Safari, Quick Look): over the full screen when they adapt (iPhone in landscape), never
/// in place of it, so that the page under them (a live call) stays in the window
final class MIGSheetStyle: NSObject, UIAdaptivePresentationControllerDelegate {

    @objc(adaptivePresentationStyleForPresentationController:traitCollection:)
    func adaptivePresentationStyle(for controller: UIPresentationController, traitCollection: UITraitCollection) -> UIModalPresentationStyle {
        return .overFullScreen
    }
}

/// Files the site hands out (a download, an attachment, a blob: / data: file such as an event's .ics) in any window: saved to a
/// temporary folder, then MainViewController.share(fileAt:) (Quick Look or the share sheet)
final class MIGFiles: NSObject, WKDownloadDelegate {

    weak var owner: MainViewController?
    private var downloads: [ObjectIdentifier: URL] = [:]

    /// a page the web view cannot show, or one the server marks as an attachment (the .ics of a meeting): a download
    static func policy(for response: WKNavigationResponse) -> WKNavigationResponsePolicy {
        if response.isForMainFrame && (!response.canShowMIMEType || isAttachment(response.response)) {
            return .download
        }
        return .allow
    }

    @objc(download:decideDestinationUsingResponse:suggestedFilename:completionHandler:)
    func download(_ download: WKDownload, decideDestinationUsing response: URLResponse, suggestedFilename: String, completionHandler: @escaping (URL?) -> Void) {
        let folder = FileManager.default.temporaryDirectory.appendingPathComponent("downloads", isDirectory: true)
        try? FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true, attributes: nil)
        let file = folder.appendingPathComponent(MIGFiles.safeName(suggestedFilename))
        try? FileManager.default.removeItem(at: file)
        downloads[ObjectIdentifier(download)] = file
        completionHandler(file)
    }

    @objc(downloadDidFinish:)
    func downloadDidFinish(_ download: WKDownload) {
        owner?.closeIfEmpty(download.webView)
        guard let file = downloads.removeValue(forKey: ObjectIdentifier(download)) else { return }
        owner?.share(fileAt: file)
    }

    @objc(download:didFailWithError:resumeData:)
    func download(_ download: WKDownload, didFailWithError error: Error, resumeData: Data?) {
        downloads.removeValue(forKey: ObjectIdentifier(download))
        owner?.closeIfEmpty(download.webView)
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

/// Quick Look for one file (its own Done and share buttons; a calendar file shows Add to Calendar, as in Safari)
final class MIGPreview: QLPreviewController, QLPreviewControllerDataSource {

    private let item: URL

    init(item: URL) {
        self.item = item
        super.init(nibName: nil, bundle: nil)
        dataSource = self
    }

    required init?(coder: NSCoder) {
        return nil
    }

    @objc(numberOfPreviewItemsInPreviewController:)
    func numberOfPreviewItems(in controller: QLPreviewController) -> Int {
        return 1
    }

    @objc(previewController:previewItemAtIndex:)
    func previewController(_ controller: QLPreviewController, previewItemAt index: Int) -> QLPreviewItem {
        return item as NSURL
    }
}

/// window.print() of the platform's pages (the legal center's «طباعة / PDF», the radar report): WKWebView prints nothing by itself,
/// so a script at the start of every page hands the call to the app, which shows the system print sheet (MainViewController.printPage)
final class MIGPrintHandler: NSObject, WKScriptMessageHandler {

    static let name = "migPrint"
    static let source = "window.print=function(){try{window.webkit.messageHandlers.migPrint.postMessage(1);}catch(e){}};"

    weak var owner: MainViewController?

    func install(in controller: WKUserContentController) {
        controller.addUserScript(WKUserScript(source: MIGPrintHandler.source, injectionTime: .atDocumentStart, forMainFrameOnly: true))
        controller.add(self, name: MIGPrintHandler.name)
    }

    @objc(userContentController:didReceiveScriptMessage:)
    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard message.frameInfo.isMainFrame, MIGLinks.isSite(message.frameInfo.securityOrigin), let web = message.webView else { return }
        owner?.printPage(web)
    }
}

/// A JavaScript dialog's answer, given exactly once: the tapped button's, or the default one when the dialog goes away without an
/// answer (dismissed with the sheet under it, or never shown). WebKit raises an exception when a dialog's completion handler is
/// never called.
final class MIGAnswer<Value> {

    private var reply: ((Value) -> Void)?
    private let fallback: Value

    init(fallback: Value, _ reply: @escaping (Value) -> Void) {
        self.fallback = fallback
        self.reply = reply
    }

    func give(_ value: Value) {
        let send = reply
        reply = nil
        send?(value)
    }

    deinit {
        guard let send = reply else { return }
        let value = fallback
        DispatchQueue.main.async {
            send(value)
        }
    }
}

/// the answers of several pages to one question (MainViewController.callViews)
final class MIGTally {

    private var left: Int
    private var found: [WKWebView] = []
    private var done: (([WKWebView]) -> Void)?

    init(count: Int, done: @escaping ([WKWebView]) -> Void) {
        left = count
        self.done = done
    }

    func answer(_ web: WKWebView, open: Bool) {
        if open {
            found.append(web)
        }
        left -= 1
        if left <= 0 {
            finish()
        }
    }

    func finish() {
        let reply = done
        done = nil
        reply?(found)
    }
}
