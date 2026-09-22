import UIKit
import WebKit
import CoreML
import Vision
import Network
import CoreImage
import VisionKit
import AVFoundation

// Info.plist benötigt: NSCameraUsageDescription, NSPhotoLibraryUsageDescription
final class LabPlateWebViewController: UIViewController, WKScriptMessageHandler, WKNavigationDelegate, WKUIDelegate, AVSpeechSynthesizerDelegate {

    private var webView: WKWebView!
    private var visionModel: VNCoreMLModel?
    private var httpServer: LocalHTTPServer?
    // Index -> Rohname ("n"-Feld aus labplate_class_mapping.json), 260 Eintraege.
    // labplate_dinov2_fruits liefert (anders als das alte MyImageClassifier_1) KEIN
    // fertiges CoreML-"Classifier"-Ergebnis mit Klassennamen, sondern nur rohe Logits als
    // MLMultiArray - die Zuordnung Index->Name kommt deshalb von aussen aus dieser Datei.
    private var foodAIClassNames: [String] = []
    // Aus labplate_class_mapping.json ("confidence_threshold") - unterhalb dieses Werts
    // wird ein DINOv2-Ergebnis in classify() NICHT als sicherer Treffer behandelt.
    private var foodAIConfidenceThreshold: Double = 0.85
    // Native Vorlesen (App-TTS). Web Speech in WKWebView ignoriert die iOS-Einstellung
    // "Gesprochene Inhalte → Sprechgeschwindigkeit"; AVSpeech klingt naeher am System und
    // erlaubt eine bewusst langsamere Rate.
    private let speechSynthesizer = AVSpeechSynthesizer()

    // Nativer Spiegel des LabPlate-Theme-Zustands ("dark"/"light"), gesetzt ausschliesslich
    // ueber die bestehende themeState-Bridge (JS -> Swift, siehe userContentController(_:didReceive:)).
    // Steuert nur Statusleisten-Stil und die nativen Hintergrundflaechen hinter Statusleiste/
    // Dynamic Island - keine Web-Inhalte, keine zweite Theme-Logik.
    private var isLabPlateDarkMode = false
    private let labPlateDarkBackground = UIColor(red: 15.0 / 255.0, green: 16.0 / 255.0, blue: 18.0 / 255.0, alpha: 1.0)
    /// Light chrome matches CSS `--bg` (#F5F9F7), not pure white.
    private let labPlateLightBackground = UIColor(red: 245.0 / 255.0, green: 249.0 / 255.0, blue: 247.0 / 255.0, alpha: 1.0)

    override var preferredStatusBarStyle: UIStatusBarStyle {
        isLabPlateDarkMode ? .lightContent : .darkContent
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        // FRUEHER: overrideUserInterfaceStyle = .light - die App blieb dadurch als einzige
        // App hell, obwohl das iPhone im Dark Mode stand, und die Tastatur kam weiss.
        //
        // Der Zwang ist ersatzlos entfallen. Die Seite selbst kennt drei Zustaende
        // (System / Hell / Dunkel, siehe applyThemePref im HTML) und deckt "System" ueber
        // @media (prefers-color-scheme: dark) ab. Diese Medienabfrage konnte in der WebView
        // NIE "dark" liefern, solange hier .light stand - deshalb war der Systemmodus in der
        // App wirkungslos. Mit .unspecified erbt die WebView den echten Systemzustand, und
        // die drei Einstellungen der Seite funktionieren wieder wie vorgesehen.
        //
        // Die Tastatur folgt dabei NICHT diesem Wert, sondern der CSS-Eigenschaft
        // color-scheme der Seite - die steht bereits in beiden Dunkel-Bloecken des HTML.
        // Dadurch bleibt sie auch dann richtig, wenn jemand in der App "Hell" waehlt,
        // waehrend das iPhone dunkel ist.
        overrideUserInterfaceStyle = .unspecified

        // Startwert aus dem System, nicht blind "hell": ohne das blitzt beim Start auf einem
        // dunklen iPhone kurz eine weisse Flaeche auf, bis die erste themeState-Meldung der
        // Seite eintrifft.
        isLabPlateDarkMode = (traitCollection.userInterfaceStyle == .dark)
        loadVisionModel()
        speechSynthesizer.delegate = self
        setupWebView()
        applyNativeTheme(isDark: isLabPlateDarkMode)
        startLocalServerAndLoad()

        // Verlauf/Tageswechsel: WKWebView feuert visibilitychange/focus nach Mitternacht oft
        // nicht zuverlaessig, und setInterval wird im Hintergrund gedrosselt. Ohne nativen
        // Hook bleibt der Vortag auf dem Teller und erscheint nicht im Verlauf.
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(notifyWebDayRollover),
            name: UIApplication.willEnterForegroundNotification,
            object: nil
        )
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(notifyWebDayRollover),
            name: UIApplication.didBecomeActiveNotification,
            object: nil
        )
        // Teller-Persistenz: WKWebView flush't localStorage bei App-Kill oft nicht rechtzeitig.
        // Sofort nativ spiegeln, sobald die App in den Hintergrund geht / inaktiv wird.
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(flushWebStorageToNative),
            name: UIApplication.willResignActiveNotification,
            object: nil
        )
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(flushWebStorageToNative),
            name: UIApplication.didEnterBackgroundNotification,
            object: nil
        )
    }

    /// Ruft die JS-Tageswechsel-Logik auf (archiveDay → Verlauf), sobald die App wieder aktiv ist.
    @objc private func notifyWebDayRollover() {
        webView?.evaluateJavaScript(
            """
            try {
              if (typeof window.refreshAfterDayRollover === 'function') {
                window.refreshAfterDayRollover();
              } else if (typeof window.checkDayRollover === 'function') {
                window.checkDayRollover();
              }
              if (typeof window.syncWebStorageToNative === 'function') {
                window.syncWebStorageToNative();
              }
            } catch (e) {}
            """,
            completionHandler: nil
        )
    }

    /// Schreibt Teller/Verlauf sofort in Application Support + UserDefaults (überlebt Kill/Xcode-Update).
    @objc private func flushWebStorageToNative() {
        let box = BackgroundTaskBox()
        box.id = UIApplication.shared.beginBackgroundTask(withName: "LabPlateWebStorageFlush") {
            box.end()
        }
        guard let webView = webView else {
            box.end()
            return
        }
        webView.evaluateJavaScript(
            """
            try {
              if (typeof window.syncWebStorageToNative === 'function') {
                window.syncWebStorageToNative();
              }
            } catch (e) {}
            """
        ) { _, _ in
            // Kurz warten, bis der messageHandler die Datei geschrieben hat.
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.2) {
                box.end()
            }
        }
    }

    deinit {
        NotificationCenter.default.removeObserver(self)
        speechSynthesizer.stopSpeaking(at: .immediate)
        webView?.configuration.userContentController.removeScriptMessageHandler(forName: "photoRecognition")
        webView?.configuration.userContentController.removeScriptMessageHandler(forName: "jsError")
        webView?.configuration.userContentController.removeScriptMessageHandler(forName: "searchScrollLock")
        webView?.configuration.userContentController.removeScriptMessageHandler(forName: "themeState")
        webView?.configuration.userContentController.removeScriptMessageHandler(forName: "printRequest")
        webView?.configuration.userContentController.removeScriptMessageHandler(forName: "openRecipeTextScanner")
        webView?.configuration.userContentController.removeScriptMessageHandler(forName: "speakText")
        webView?.configuration.userContentController.removeScriptMessageHandler(forName: "onboardingState")
        webView?.configuration.userContentController.removeScriptMessageHandler(forName: "webStorageMirror")
        webView?.configuration.userContentController.removeScriptMessageHandler(forName: "demoMarker")
        httpServer?.stop()
    }

    // MARK: - CoreML

    private func loadVisionModel() {
        do {
            let config = MLModelConfiguration()
            config.computeUnits = .all // Neural Engine + GPU + CPU automatisch optimal nutzen
            let coreMLModel = try labplate_dinov2_fruits(configuration: config).model
            visionModel = try VNCoreMLModel(for: coreMLModel)
        } catch {
            print("❌ CoreML-Modell konnte nicht geladen werden: \(error)")
            visionModel = nil
        }
        loadFoodAIClassMapping()
    }

    private func loadFoodAIClassMapping() {
        guard let url = Bundle.main.url(forResource: "labplate_class_mapping", withExtension: "json"),
              let data = try? Data(contentsOf: url),
              let parsed = try? JSONDecoder().decode(FoodAIClassMappingFile.self, from: data) else {
            print("❌ labplate_class_mapping.json konnte nicht geladen werden – prüfe Dateinamen und Target Membership")
            return
        }
        var names = [String](repeating: "", count: parsed.classes.count)
        for entry in parsed.classes where entry.i >= 0 && entry.i < names.count {
            names[entry.i] = entry.n
        }
        foodAIClassNames = names
        foodAIConfidenceThreshold = parsed.confidence_threshold ?? 0.85
    }

    // MARK: - WebView Setup

    private func setupWebView() {
        let contentController = WKUserContentController()
        contentController.add(WeakScriptMessageHandler(self), name: "photoRecognition")
        contentController.add(WeakScriptMessageHandler(self), name: "jsError")
        // Wird von der Vollbild-Suche in der HTML/JS-Seite aufgerufen (enterFullScreenSearch),
        // um beim Oeffnen der Suche einmalig die Scroll-Position der WKWebView auf (0,0) zu
        // korrigieren, falls WebKits eigene "Feld ueber der Tastatur sichtbar halten"-Automatik
        // die Seite in genau diesem Moment bereits verschoben hat - siehe
        // setSearchScrollLocked(_:) weiter unten. Die eigentliche, laufende Scroll-Sperre
        // (Hintergrund gesperrt, nur die Trefferliste bleibt wischbar) passiert inzwischen rein
        // in der HTML/JS-Seite selbst (touchmove-Abfangen + touch-action), da ein natives
        // Sperren ueber webView.scrollView sich als zu grobschlaechtig erwiesen hat - das hat
        // in Tests auch das Scrollen der Trefferliste selbst blockiert.
        contentController.add(WeakScriptMessageHandler(self), name: "searchScrollLock")
        // JS -> Swift: effektiver LabPlate-Theme-Zustand ("dark"/"light"), steuert native
        // Statusleiste + Hintergrundflaechen ueber applyNativeTheme(isDark:) - siehe unten.
        contentController.add(WeakScriptMessageHandler(self), name: "themeState")
        // JS -> Swift: Druck-/PDF-Anforderung. window.print() ist in einer WKWebView auf iOS
        // wirkungslos, solange die App den Druck nicht selbst uebernimmt - der Aufruf geht
        // stillschweigend ins Leere. Das betraf bisher SOWOHL den PDF-Export des 14-Tage-
        // Protokolls ALS AUCH den Druck-Knopf im Naehrstoff-Report: Am Rechner im Browser
        // funktionierten beide, auf dem iPhone kam nie etwas an.
        contentController.add(WeakScriptMessageHandler(self), name: "printRequest")
        // Rezept-Text-Scanner: JS -> Swift, öffnet DataScannerViewController (iOS 16+)
        contentController.add(WeakScriptMessageHandler(self), name: "openRecipeTextScanner")
        // Vorlesen: JS -> Swift (AVSpeechSynthesizer), Stop/Ende zurück an JS
        contentController.add(WeakScriptMessageHandler(self), name: "speakText")
        // Onboarding-Done/Defer: JS -> Swift UserDefaults. Beim Start zurück in localStorage
        // injizieren, damit ein WKWebView-localStorage-Verlust (z.B. Origin-Wechsel) das
        // Onboarding nicht erneut wie nach einer Neuinstallation öffnet.
        contentController.add(WeakScriptMessageHandler(self), name: "onboardingState")
        // Teller/Verlauf/Profil: nativer Application-Support-Spiegel (App-Store-tauglich)
        // gegen localStorage-Verlust bei Updates/Origin-Wechsel. Restore vor Seiten-JS.
        contentController.add(WeakScriptMessageHandler(self), name: "webStorageMirror")
        contentController.addUserScript(
            WKUserScript(source: Self.restoreWebStorageMirrorScript(), injectionTime: .atDocumentStart, forMainFrameOnly: true)
        )
        contentController.addUserScript(
            WKUserScript(source: Self.restoreOnboardingPersistenceScript(), injectionTime: .atDocumentStart, forMainFrameOnly: true)
        )
        contentController.addUserScript(
            WKUserScript(source: Self.jsonParseSafetyScript, injectionTime: .atDocumentStart, forMainFrameOnly: true)
        )
        contentController.addUserScript(
            WKUserScript(source: Self.errorCaptureScript, injectionTime: .atDocumentStart, forMainFrameOnly: true)
        )
        // Demo-Aufnahme: Onboarding + optionaler Teller-Seed via Launch-Arg / UserDefaults
        // (Recording-Script setzt LabPlateDemoSkipOnboarding vor dem SpringBoard-Start).
        if Self.shouldSkipOnboardingForDemo {
            contentController.add(WeakScriptMessageHandler(self), name: "demoMarker")
            contentController.addUserScript(
                WKUserScript(source: Self.demoSkipOnboardingScript, injectionTime: .atDocumentStart, forMainFrameOnly: true)
            )
            contentController.addUserScript(
                WKUserScript(source: Self.demoSeedDayScript, injectionTime: .atDocumentStart, forMainFrameOnly: true)
            )
            contentController.addUserScript(
                WKUserScript(source: Self.demoStoryboardAutopilotScript, injectionTime: .atDocumentEnd, forMainFrameOnly: true)
            )
        }
        // Web-Speech-Fallback-Rate (etwas langsamer als Default 1.0); native Bridge nutzt AVSpeech.
        contentController.addUserScript(
            WKUserScript(source: "window.__LABPLATE_TTS_WEB_RATE__=0.85;", injectionTime: .atDocumentStart, forMainFrameOnly: true)
        )
        contentController.addUserScript(
            WKUserScript(source: Self.bridgeScript, injectionTime: .atDocumentEnd, forMainFrameOnly: true)
        )

        let preferences = WKPreferences()
        preferences.javaScriptCanOpenWindowsAutomatically = true

        let pagePrefs = WKWebpagePreferences()
        pagePrefs.allowsContentJavaScript = true

        let config = WKWebViewConfiguration()
        config.userContentController = contentController
        config.preferences = preferences
        config.defaultWebpagePreferences = pagePrefs
        config.websiteDataStore = .default()
        config.allowsInlineMediaPlayback = true

        webView = WKWebView(frame: .zero, configuration: config)
        webView.navigationDelegate = self
        webView.uiDelegate = self
        // FRUEHER: webView.overrideUserInterfaceStyle = .light - genau diese Zeile hat
        // prefers-color-scheme in der Seite dauerhaft auf "light" genagelt. Die Einstellung
        // "System" im App-Menue konnte dadurch nie dunkel werden.
        webView.overrideUserInterfaceStyle = .unspecified
        webView.isOpaque = true
        // Hintergrund passend zum Startzustand statt fest weiss - applyNativeTheme() zieht
        // ihn gleich darauf ohnehin auf den von der Seite gemeldeten Zustand nach.
        let startHintergrund = isLabPlateDarkMode ? labPlateDarkBackground : labPlateLightBackground
        webView.backgroundColor = startHintergrund
        webView.scrollView.backgroundColor = startHintergrund
        webView.isUserInteractionEnabled = true
        // Kein elastisches "Ueberscrollen" am oberen/unteren Rand - reduziert generell das
        // Risiko, dass sich der Seiteninhalt unerwartet verschiebt (z.B. beim Ein-/Ausblenden
        // der Tastatur), unabhaengig vom gezielten Scroll-Lock waehrend der Vollbild-Suche.
        webView.scrollView.bounces = false
        // Verhindert, dass WKWebView die Content-Insets automatisch anhand von Safe-Area/
        // Tastatur anpasst - diese automatische Anpassung ist eine haeufige Ursache dafuer,
        // dass fixierte Elemente beim Fokussieren eines Eingabefelds kurz "springen".
        webView.scrollView.contentInsetAdjustmentBehavior = .never

        // Feste Auto-Layout-Constraints statt Frame/AutoresizingMask.
        // WICHTIG: Oben an die Safe Area (nicht view.topAnchor) - die Seite selbst nutzt
        // kein env(safe-area-inset-top)/viewport-fit=cover, und contentInsetAdjustmentBehavior
        // ist unten bewusst auf .never gesetzt (siehe Kommentar dort). Ohne diese Kopplung an
        // die Safe Area wuerde der Kopfbereich der Seite permanent unter der Statusleiste/
        // Dynamic Island gerendert (nicht nur sporadisch) - das war die eigentliche Ursache
        // fuer die "gesamte UI nach oben verschoben"-Meldung.
        webView.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(webView)
        NSLayoutConstraint.activate([
            webView.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor),
            webView.bottomAnchor.constraint(equalTo: view.bottomAnchor),
            webView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            webView.trailingAnchor.constraint(equalTo: view.trailingAnchor)
        ])
    }

    // MARK: - Lokaler Server + Laden

    // Läuft nur über 127.0.0.1/localhost (loopback), nicht im lokalen Netzwerk erreichbar.
    // http://localhost gilt für WebKit als "sicherer Ursprung" - dadurch funktionieren
    // Kamera-Zugriff (Live-Barcode-Scan) und alles, was die Seite selbst per
    // location.hostname === 'localhost' prüft, genau wie im normalen Browser/Netlify-Betrieb.
    private func startLocalServerAndLoad() {
        guard let htmlURL = Bundle.main.url(forResource: "LabPlate_34_Cursor", withExtension: "html"),
              let data = try? Data(contentsOf: htmlURL) else {
            print("❌ HTML nicht gefunden – prüfe Dateinamen und Target Membership")
            return
        }
        print("📦 HTML aus Bundle gelesen: \(data.count) Bytes")

        // Lexikon-Feature: lexikon-data.js liegt als eigene Bundle-Ressource neben der HTML-
        // Datei und wird von <script src="lexikon-data.js"> im <head> nachgeladen. Der lokale
        // Server kannte bisher NUR den Pfad "/" (siehe LocalHTTPServer.respond weiter unten) -
        // jede andere Anfrage (auch diese Datei) bekam bislang 404. Fehlt die Ressource im
        // Bundle (z.B. noch nicht zum Xcode-Target hinzugefuegt), startet die App trotzdem
        // normal - die Seite bekommt dann fuer diese eine Datei ebenfalls 404 und das Lexikon
        // bleibt ohne Daten, der Rest der App ist davon unberuehrt.
        var extraFiles: [String: (data: Data, contentType: String)] = [:]
        if let lexikonURL = Bundle.main.url(forResource: "lexikon-data", withExtension: "js"),
           let lexikonData = try? Data(contentsOf: lexikonURL) {
            extraFiles["/lexikon-data.js"] = (lexikonData, "application/javascript; charset=utf-8")
            print("📦 lexikon-data.js aus Bundle gelesen: \(lexikonData.count) Bytes")
        } else {
            print("⚠️ lexikon-data.js nicht im Bundle gefunden – Lexikon bleibt ohne Inhalte")
        }
        // Lexikon-Begriffe (Export aus SQLite lexicon_terms) – gleiche Einbindung wie Kapitel-Daten.
        if let termsURL = Bundle.main.url(forResource: "lexikon-terms", withExtension: "js"),
           let termsData = try? Data(contentsOf: termsURL) {
            extraFiles["/lexikon-terms.js"] = (termsData, "application/javascript; charset=utf-8")
            print("📦 lexikon-terms.js aus Bundle gelesen: \(termsData.count) Bytes")
        } else {
            print("⚠️ lexikon-terms.js nicht im Bundle gefunden – Begriffsuche bleibt leer")
        }
        // Header-Avatar Dark (labplate_avatar_512.png) – gleiche Extra-File-Einbindung wie Lexikon-JS.
        if let avatarURL = Bundle.main.url(forResource: "labplate_avatar_512", withExtension: "png"),
           let avatarData = try? Data(contentsOf: avatarURL) {
            extraFiles["/labplate_avatar_512.png"] = (avatarData, "image/png")
            print("📦 labplate_avatar_512.png aus Bundle gelesen: \(avatarData.count) Bytes")
        } else {
            print("⚠️ labplate_avatar_512.png nicht im Bundle gefunden – Header zeigt kein Dark-Logo")
        }
        // Header-Avatar Light (avatar_light_C3.png)
        if let avatarLightURL = Bundle.main.url(forResource: "avatar_light_C3", withExtension: "png"),
           let avatarLightData = try? Data(contentsOf: avatarLightURL) {
            extraFiles["/avatar_light_C3.png"] = (avatarLightData, "image/png")
            print("📦 avatar_light_C3.png aus Bundle gelesen: \(avatarLightData.count) Bytes")
        } else {
            print("⚠️ avatar_light_C3.png nicht im Bundle gefunden – Header zeigt kein Light-Logo")
        }

        let server = LocalHTTPServer(htmlData: data, extraFiles: extraFiles)
        server.onReady = { [weak self] port in
            DispatchQueue.main.async {
                self?.loadWebApp(port: port)
            }
        }
        self.httpServer = server
        server.start()
    }

    private func loadWebApp(port: UInt16) {
        guard let url = URL(string: "http://localhost:\(port)/") else { return }
        print("🌐 Lade Seite über \(url)")
        webView.load(URLRequest(url: url))
    }

    // MARK: - WKNavigationDelegate

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        print("✅ Seite geladen (didFinish)")
        webView.evaluateJavaScript(Self.diagnosticScript, completionHandler: nil)
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        print("❌ Navigation fehlgeschlagen: \(error)")
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        print("❌ Provisional Navigation fehlgeschlagen: \(error)")
    }

    // Wird aufgerufen, wenn der WKWebView-eigene Rendering-Prozess abstürzt
    // (z.B. durch Speicherdruck bei der großen HTML-Datei). Seite automatisch neu laden.
    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        print("⚠️ WebContent-Prozess abgestürzt – lade Seite neu")
        webView.reload()
    }

    // MARK: - WKUIDelegate (native JS alert/confirm/prompt funktionieren sonst gar nicht in WKWebView)

    func webView(_ webView: WKWebView, runJavaScriptAlertPanelWithMessage message: String,
                 initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping () -> Void) {
        let alert = UIAlertController(title: nil, message: message, preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: "OK", style: .default) { _ in completionHandler() })
        present(alert, animated: true)
    }

    func webView(_ webView: WKWebView, runJavaScriptConfirmPanelWithMessage message: String,
                 initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (Bool) -> Void) {
        let alert = UIAlertController(title: nil, message: message, preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: "Abbrechen", style: .cancel) { _ in completionHandler(false) })
        alert.addAction(UIAlertAction(title: "OK", style: .default) { _ in completionHandler(true) })
        present(alert, animated: true)
    }

    func webView(_ webView: WKWebView, runJavaScriptTextInputPanelWithPrompt prompt: String, defaultText: String?,
                 initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (String?) -> Void) {
        let alert = UIAlertController(title: nil, message: prompt, preferredStyle: .alert)
        alert.addTextField { $0.text = defaultText }
        alert.addAction(UIAlertAction(title: "Abbrechen", style: .cancel) { _ in completionHandler(nil) })
        alert.addAction(UIAlertAction(title: "OK", style: .default) { _ in
            completionHandler(alert.textFields?.first?.text)
        })
        present(alert, animated: true)
    }

    // Kamera-/Mikrofonzugriff (Live-Barcode-Scan) automatisch erlauben, da die App lokal
    // (localhost) läuft und der Zugriff bereits über Info.plist-Beschreibungen abgesichert ist.
    func webView(_ webView: WKWebView, requestMediaCapturePermissionFor origin: WKSecurityOrigin,
                 initiatedByFrame frame: WKFrameInfo, type: WKMediaCaptureType,
                 decisionHandler: @escaping (WKPermissionDecision) -> Void) {
        decisionHandler(.grant)
    }

    // MARK: - JS -> Swift

    func userContentController(_ userContentController: WKUserContentController,
                                didReceive message: WKScriptMessage) {
        switch message.name {
        case "photoRecognition":
            // Die JS-Seite schickt jetzt ein Objekt { image, lang } statt nur den reinen
            // Base64-String, damit die Übersetzung der Erkennung in der jeweils aktuell
            // eingestellten App-Sprache (de/en/es/it) erfolgen kann.
            guard let dict = message.body as? [String: Any],
                  let base64 = dict["image"] as? String else {
                print("❌ Ungültige Nachricht von JS (photoRecognition)")
                return
            }
            let lang = (dict["lang"] as? String) ?? "de"
            classify(base64Image: base64, lang: lang)

        case "jsError":
            print("🔴 JS-FEHLER: \(message.body)")

        case "searchScrollLock":
            let shouldLock = (message.body as? String) == "lock"
            setSearchScrollLocked(shouldLock)

        case "themeState":
            // Format: "<dark|light>:<explicit|system>" - siehe lpEffectiveTheme() im
            // bridgeScript. Aeltere Seitenstaende senden nur "dark"/"light"; die werden
            // weiterhin verstanden und als "system" behandelt.
            let raw = (message.body as? String) ?? "light"
            let isDark = raw.hasPrefix("dark")
            let ausdruecklich = raw.hasSuffix(":explicit")
            applyNativeTheme(isDark: isDark, ausdruecklich: ausdruecklich)

        case "printRequest":
            presentPrintDialog()

        case "openRecipeTextScanner":
            openRecipeTextScanner()

        case "speakText":
            handleSpeakTextMessage(message.body)

        case "onboardingState":
            handleOnboardingStateMessage(message.body)

        case "webStorageMirror":
            handleWebStorageMirrorMessage(message.body)

        case "demoMarker":
            if let name = message.body as? String, !name.isEmpty {
                let path = "/tmp/labplate-\(name)"
                try? "\(Date().timeIntervalSince1970)".write(toFile: path, atomically: true, encoding: .utf8)
            }

        default:
            break
        }
    }

    // MARK: - Web-Storage-Spiegel (App-Store-tauglich)
    //
    // WKWebView-localStorage hängt an der Origin (http://localhost:PORT). Bei Origin-Verlust
    // (Port-Wechsel, WebKit-Reset) wären Teller/Verlauf/Profil weg — inakzeptabel für Store.
    // Deshalb: kanonische Kopie in Application Support (überlebt Updates, iTunes/Finder-
    // Backup, nicht für große Blobs in UserDefaults). Restore atDocumentStart vor loadDay().

    private static let udOnboardingDoneKey = "LabPlateOnboardingDone"
    private static let udOnboardingDeferredKey = "LabPlateOnboardingDeferred"
    /// Legacy-Key (kurze Zeit genutzt); wird einmalig nach Application Support migriert.
    private static let udWebStorageMirrorKey = "LabPlateWebStorageMirror_v1"
    /// Zusätzliches Tages-Backup in UserDefaults (kleiner JSON, flush't zuverlässiger als nur Datei/WK).
    private static let udDayBackupKey = "LabPlateDayBackup_v1"
    private static let udDayLastNonemptyKey = "LabPlateDayLastNonempty_v1"
    private static let webStorageMirrorFileName = "web_storage_mirror_v1.json"

    private static var webStorageMirrorURL: URL? {
        let fm = FileManager.default
        guard let appSupport = try? fm.url(
            for: .applicationSupportDirectory,
            in: .userDomainMask,
            appropriateFor: nil,
            create: true
        ) else { return nil }
        let dir = appSupport.appendingPathComponent("LabPlate", isDirectory: true)
        if !fm.fileExists(atPath: dir.path) {
            try? fm.createDirectory(at: dir, withIntermediateDirectories: true)
        }
        // Backup-fähig (iCloud-Gerätebackup); nicht in den iCloud-Documents-Sync legen.
        var values = URLResourceValues()
        values.isExcludedFromBackup = false
        var mutableDir = dir
        try? mutableDir.setResourceValues(values)
        return dir.appendingPathComponent(webStorageMirrorFileName, isDirectory: false)
    }

    private static func readWebStorageMirrorJSON() -> String {
        if let url = webStorageMirrorURL,
           let data = try? Data(contentsOf: url),
           let s = String(data: data, encoding: .utf8),
           !s.isEmpty {
            return s
        }
        // Migration von UserDefaults-Prototype → Datei
        if let legacy = UserDefaults.standard.string(forKey: udWebStorageMirrorKey), !legacy.isEmpty {
            _ = writeWebStorageMirrorJSON(legacy)
            UserDefaults.standard.removeObject(forKey: udWebStorageMirrorKey)
            return legacy
        }
        return ""
    }

    @discardableResult
    private static func writeWebStorageMirrorJSON(_ json: String) -> Bool {
        guard let url = webStorageMirrorURL,
              let data = json.data(using: .utf8) else { return false }
        do {
            try data.write(to: url, options: [.atomic])
            return true
        } catch {
            print("⚠️ Web-Storage-Spiegel speichern fehlgeschlagen: \(error)")
            return false
        }
    }

    private static func clearWebStorageMirror() {
        if let url = webStorageMirrorURL {
            try? FileManager.default.removeItem(at: url)
        }
        UserDefaults.standard.removeObject(forKey: udWebStorageMirrorKey)
    }

    private func handleOnboardingStateMessage(_ body: Any) {
        guard let dict = body as? [String: Any],
              let action = dict["action"] as? String else { return }
        let defaults = UserDefaults.standard
        switch action {
        case "done":
            defaults.set(true, forKey: Self.udOnboardingDoneKey)
            defaults.set(false, forKey: Self.udOnboardingDeferredKey)
        case "deferred":
            // Nur speichern, wenn noch nicht abgeschlossen.
            if !defaults.bool(forKey: Self.udOnboardingDoneKey) {
                defaults.set(true, forKey: Self.udOnboardingDeferredKey)
            }
        case "reset":
            defaults.set(false, forKey: Self.udOnboardingDoneKey)
            defaults.set(false, forKey: Self.udOnboardingDeferredKey)
        default:
            break
        }
    }

    private func handleWebStorageMirrorMessage(_ body: Any) {
        guard let dict = body as? [String: Any],
              let action = dict["action"] as? String else { return }
        switch action {
        case "save":
            guard let data = dict["data"] as? [String: Any] else { return }
            var incoming: [String: String] = [:]
            for (key, value) in data {
                if let s = value as? String {
                    incoming[key] = s
                }
            }
            let allowEmptyDay = (dict["allowEmptyDay"] as? Bool) ?? false
            let existing = Self.loadWebStorageMirrorDict()
            var mirror = existing
            for (key, value) in incoming {
                mirror[key] = value
            }
            let dayKey = "tellercheck_day_v1"
            let lastKey = "tellercheck_day_last_nonempty_v1"
            // Schutz vor Xcode-Reinstall/Sync-Race: leerer Teller überschreibt keinen
            // gespeicherten Nicht-Leer-Teller — sonst bleibt nur der Verlauf übrig.
            if !allowEmptyDay {
                let incomingDayEmpty = !Self.dayJSONHasItems(incoming[dayKey])
                if incomingDayEmpty, Self.dayJSONHasItems(existing[dayKey]), let prev = existing[dayKey] {
                    mirror[dayKey] = prev
                }
                if let incLast = incoming[lastKey], !Self.dayJSONHasItems(incLast),
                   Self.dayJSONHasItems(existing[lastKey]), let prevLast = existing[lastKey] {
                    mirror[lastKey] = prevLast
                }
            }
            if Self.dayJSONHasItems(mirror[dayKey]), let day = mirror[dayKey] {
                mirror[lastKey] = day
            } else if allowEmptyDay {
                // Bewusst geleert (Rollover / Alle löschen): Snapshot entfernen
                mirror.removeValue(forKey: lastKey)
            }
            guard JSONSerialization.isValidJSONObject(mirror),
                  let jsonData = try? JSONSerialization.data(withJSONObject: mirror, options: []),
                  let json = String(data: jsonData, encoding: .utf8) else { return }
            _ = Self.writeWebStorageMirrorJSON(json)
            // UserDefaults-Doppel: überlebt auch dann, wenn die Spiegel-Datei bei Kill zu spät kommt.
            Self.persistDayUserDefaultsBackup(mirror: mirror, allowEmptyDay: allowEmptyDay)
        case "clear":
            Self.clearWebStorageMirror()
            UserDefaults.standard.removeObject(forKey: Self.udDayBackupKey)
            UserDefaults.standard.removeObject(forKey: Self.udDayLastNonemptyKey)
        default:
            break
        }
    }

    private static func persistDayUserDefaultsBackup(mirror: [String: String], allowEmptyDay: Bool) {
        let dayKey = "tellercheck_day_v1"
        let lastKey = "tellercheck_day_last_nonempty_v1"
        let defaults = UserDefaults.standard
        if dayJSONHasItems(mirror[dayKey]), let day = mirror[dayKey] {
            defaults.set(day, forKey: udDayBackupKey)
            defaults.set(day, forKey: udDayLastNonemptyKey)
        } else if allowEmptyDay {
            defaults.removeObject(forKey: udDayBackupKey)
            if let last = mirror[lastKey], dayJSONHasItems(last) {
                defaults.set(last, forKey: udDayLastNonemptyKey)
            } else {
                defaults.removeObject(forKey: udDayLastNonemptyKey)
            }
        } else if let last = mirror[lastKey], dayJSONHasItems(last) {
            defaults.set(last, forKey: udDayLastNonemptyKey)
        }
    }

    private static func loadWebStorageMirrorDict() -> [String: String] {
        let raw = readWebStorageMirrorJSON()
        guard !raw.isEmpty,
              let data = raw.data(using: .utf8),
              let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
            return [:]
        }
        var out: [String: String] = [:]
        for (k, v) in obj {
            if let s = v as? String { out[k] = s }
        }
        return out
    }

    private static func dayJSONHasItems(_ raw: String?) -> Bool {
        guard let raw = raw, let data = raw.data(using: .utf8),
              let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let items = obj["items"] as? [Any] else { return false }
        return !items.isEmpty
    }

    /// Stellt Teller/Verlauf/tellercheck_*/labplate_* aus Application Support wieder her,
    /// wenn localStorage leer ist. Läuft atDocumentStart — vor loadDay().
    static func restoreWebStorageMirrorScript() -> String {
        var mirror = loadWebStorageMirrorDict()
        // UserDefaults-Fallback, falls Spiegel-Datei leer/veraltet (Kill vor Datei-Flush).
        let defaults = UserDefaults.standard
        if let day = defaults.string(forKey: udDayBackupKey), dayJSONHasItems(day),
           !dayJSONHasItems(mirror["tellercheck_day_v1"]) {
            mirror["tellercheck_day_v1"] = day
        }
        if let last = defaults.string(forKey: udDayLastNonemptyKey), dayJSONHasItems(last),
           !dayJSONHasItems(mirror["tellercheck_day_last_nonempty_v1"]) {
            mirror["tellercheck_day_last_nonempty_v1"] = last
        }
        let raw: String
        if mirror.isEmpty {
            raw = ""
        } else if JSONSerialization.isValidJSONObject(mirror),
                  let data = try? JSONSerialization.data(withJSONObject: mirror, options: []),
                  let s = String(data: data, encoding: .utf8) {
            raw = s
        } else {
            raw = readWebStorageMirrorJSON()
        }
        let b64 = Data(raw.utf8).base64EncodedString()
        return """
        (function () {
          try {
            var b64 = '\(b64)';
            if (!b64) return;
            var bin = atob(b64);
            var bytes = new Uint8Array(bin.length);
            for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
            var json = (typeof TextDecoder !== 'undefined')
              ? new TextDecoder('utf-8').decode(bytes)
              : decodeURIComponent(Array.prototype.map.call(bin, function (c) {
                  return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
                }).join(''));
            var mirror = JSON.parse(json);
            if (!mirror || typeof mirror !== 'object') return;
            function parseDay(rawDay) {
              try { return rawDay ? JSON.parse(rawDay) : null; } catch (e) { return null; }
            }
            function dayHasItems(rawDay) {
              var p = parseDay(rawDay);
              return !!(p && Array.isArray(p.items) && p.items.length > 0);
            }
            var dayKey = 'tellercheck_day_v1';
            var lastKey = 'tellercheck_day_last_nonempty_v1';
            var histKey = 'tellercheck_history_v1';
            function pad2(n) { return (n < 10 ? '0' : '') + n; }
            function localISODate(d) {
              var x = (d instanceof Date) ? d : new Date(d);
              if (isNaN(x.getTime())) return null;
              return x.getFullYear() + '-' + pad2(x.getMonth() + 1) + '-' + pad2(x.getDate());
            }
            function normalizeDayKey(dateStr) {
              if (!dateStr) return null;
              if (/^\\d{4}-\\d{2}-\\d{2}$/.test(dateStr)) return dateStr;
              var p = new Date(dateStr);
              return isNaN(p.getTime()) ? null : localISODate(p);
            }
            var today = localISODate(new Date());
            var localDay = null;
            try { localDay = localStorage.getItem(dayKey); } catch (eDay) {}
            // Teller wiederherstellen: erst aktueller day-Key, sonst letzter Nicht-Leer-Stand
            // vom HEUTIGEN Kalendertag (Xcode-Reinstall darf heutigen Teller nicht verlieren).
            if (!dayHasItems(localDay)) {
              var candidate = null;
              if (dayHasItems(mirror[dayKey])) candidate = mirror[dayKey];
              else if (dayHasItems(mirror[lastKey])) candidate = mirror[lastKey];
              if (candidate) {
                var parsed = parseDay(candidate);
                var parsedKey = parsed ? normalizeDayKey(parsed.date) : null;
                var hasTodayItem = false;
                if (parsed && Array.isArray(parsed.items)) {
                  for (var ti = 0; ti < parsed.items.length; ti++) {
                    var its = parsed.items[ti] && parsed.items[ti].ts;
                    if (its == null) continue;
                    var tnum = Number(its);
                    if (!isFinite(tnum) || tnum <= 0) continue;
                    if (tnum < 1e12) tnum *= 1000;
                    if (localISODate(new Date(tnum)) === today) { hasTodayItem = true; break; }
                  }
                }
                // Gleicher Kalendertag ODER heutige Item-Timestamps → als heute wiederherstellen.
                if (parsed && (!parsed.date || parsedKey === today || !parsedKey || hasTodayItem)) {
                  var keepItems = parsed.items;
                  if (hasTodayItem && parsedKey && parsedKey !== today) {
                    keepItems = parsed.items.filter(function (it) {
                      if (!it || it.ts == null) return true;
                      var n = Number(it.ts);
                      if (!isFinite(n) || n <= 0) return true;
                      if (n < 1e12) n *= 1000;
                      return localISODate(new Date(n)) === today;
                    });
                  }
                  try {
                    localStorage.setItem(dayKey, JSON.stringify({ date: today, items: keepItems }));
                  } catch (eSetDay) {}
                } else if (parsed && parsedKey && parsedKey !== today && dayHasItems(candidate)) {
                  try { localStorage.setItem(dayKey, candidate); } catch (eSetOld) {}
                }
              }
            }
            try {
              var localHist = localStorage.getItem(histKey);
              var histEmpty = !localHist || localHist === '[]' || localHist === 'null';
              if (histEmpty && mirror[histKey]) {
                localStorage.setItem(histKey, mirror[histKey]);
              }
            } catch (eHist) {}
            Object.keys(mirror).forEach(function (k) {
              if (k === dayKey || k === histKey || k === lastKey) return;
              try {
                if (localStorage.getItem(k) == null && mirror[k] != null) {
                  localStorage.setItem(k, mirror[k]);
                }
              } catch (eKey) {}
            });
            try { window.__LP_NATIVE_STORAGE_RESTORED__ = true; } catch (eFlag) {}
          } catch (e) {}
        })();
        """
    }

    /// Stellt Onboarding-Flags aus UserDefaults in localStorage wieder her, bevor
    /// maybeOpenOnboarding() (~450 ms) läuft – analog zum Demo-Skip-Script.
    static func restoreOnboardingPersistenceScript() -> String {
        let done = UserDefaults.standard.bool(forKey: udOnboardingDoneKey)
        let deferred = UserDefaults.standard.bool(forKey: udOnboardingDeferredKey)
        let doneJS = done ? "true" : "false"
        let deferredJS = deferred ? "true" : "false"
        return """
        (function () {
          var nativeDone = \(doneJS);
          var nativeDeferred = \(deferredJS);
          try {
            if (nativeDone) {
              localStorage.setItem('labplate_onboarding_done_v1', '1');
              localStorage.removeItem('labplate_onboarding_deferred_v1');
              try {
                var key = 'labplate_team_context_v1';
                var raw = localStorage.getItem(key);
                var ctx = raw ? JSON.parse(raw) : {};
                if (!ctx || typeof ctx !== 'object') ctx = {};
                if (!ctx.user || typeof ctx.user !== 'object') ctx.user = {};
                if (!ctx.user.onboarding || typeof ctx.user.onboarding !== 'object') ctx.user.onboarding = {};
                if (!ctx.user.onboarding.completedAt) {
                  ctx.user.onboarding.completedAt = new Date().toISOString();
                }
                localStorage.setItem(key, JSON.stringify(ctx));
              } catch (eCtx) {}
            } else if (nativeDeferred) {
              localStorage.setItem('labplate_onboarding_deferred_v1', '1');
            }
          } catch (e) {}
        })();
        """
    }

    // MARK: - Native Vorlesen (AVSpeech)
    //
    // Die iOS-Einstellung "Bedienungshilfen → Gesprochene Inhalte → Sprechgeschwindigkeit"
    // steuert Speak Screen/Speak Selection - Apps bekommen sie nicht als oeffentliche API.
    // Deshalb: native Stimme + bewusst etwas langsameres Tempo als Web-Speech-Default.
    private var ignoreNextSpeechCancel = false

    private func handleSpeakTextMessage(_ body: Any) {
        guard let dict = body as? [String: Any],
              let action = dict["action"] as? String else { return }
        if action == "stop" {
            // JS hat die Button-UI bereits zurueckgesetzt - didCancel nicht nochmal an JS melden,
            // sonst wuerde ein sofortiger Neu-Start (toggleSpeak) wieder deaktiviert.
            if speechSynthesizer.isSpeaking || speechSynthesizer.isPaused {
                ignoreNextSpeechCancel = true
                speechSynthesizer.stopSpeaking(at: .immediate)
            }
            return
        }
        guard action == "speak",
              let text = dict["text"] as? String,
              !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return }
        let lang = (dict["lang"] as? String) ?? "de-DE"
        if speechSynthesizer.isSpeaking || speechSynthesizer.isPaused {
            ignoreNextSpeechCancel = true
            speechSynthesizer.stopSpeaking(at: .immediate)
        }
        // Ohne aktive Playback-Session bleibt AVSpeech auf vielen iPhones stumm
        // (Stummschalter / nach Kamera-Nutzung).
        do {
            let session = AVAudioSession.sharedInstance()
            try session.setCategory(.playback, mode: .spokenAudio, options: [.duckOthers])
            try session.setActive(true, options: [])
        } catch {
            print("🔊 AVAudioSession für Vorlesen: \(error)")
        }
        let utterance = AVSpeechUtterance(string: text)
        if let voice = AVSpeechSynthesisVoice(language: lang)
            ?? AVSpeechSynthesisVoice(language: String(lang.prefix(2)))
            ?? AVSpeechSynthesisVoice(language: "de-DE") {
            utterance.voice = voice
        }
        // DefaultSpeechRate (~0.5) * 0.85 ≈ spuerbar ruhiger; Floor bei Minimum.
        let rate = max(AVSpeechUtteranceMinimumSpeechRate,
                       AVSpeechUtteranceDefaultSpeechRate * 0.85)
        utterance.rate = rate
        utterance.pitchMultiplier = 1.0
        utterance.preUtteranceDelay = 0.05
        utterance.postUtteranceDelay = 0.05
        speechSynthesizer.speak(utterance)
    }

    private func notifySpeakEnded() {
        webView?.evaluateJavaScript(
            "(typeof window.__labplateSpeakEnded === 'function' && window.__labplateSpeakEnded())",
            completionHandler: nil
        )
    }

    func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didFinish utterance: AVSpeechUtterance) {
        notifySpeakEnded()
    }

    func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didCancel utterance: AVSpeechUtterance) {
        if ignoreNextSpeechCancel {
            ignoreNextSpeechCancel = false
            return
        }
        notifySpeakEnded()
    }

    // MARK: - Drucken / "In PDF sichern"
    //
    // Oeffnet das native Druck-Blatt. Der Nutzer waehlt dort einen Drucker ODER tippt auf
    // "Teilen" bzw. zieht die Vorschau auf - iOS bietet dann "In Dateien sichern", und genau
    // dabei entsteht die PDF-Datei. Ohne diesen Weg gibt es auf dem Geraet keine Moeglichkeit,
    // den Bericht herauszubekommen.
    //
    // viewPrintFormatter() rendert den aktuellen Seiteninhalt im DRUCK-Medium, wendet also die
    // @media-print-Regeln der Seite an - der Bericht wird dadurch genau so gesetzt, wie es die
    // Druckvorschau am Rechner zeigt (Kopfzeile pro Seite, Seitenumbrueche, Analyseseiten).
    private func presentPrintDialog() {
        guard let webView = webView else { return }

        let info = UIPrintInfo(dictionary: nil)
        info.outputType = .general          // Text + Grafik, nicht reines Foto
        info.jobName = "LabPlate"
        info.orientation = .portrait

        let controller = UIPrintInteractionController.shared
        controller.printInfo = info
        controller.showsPageRange = true
        controller.printFormatter = webView.viewPrintFormatter()

        let fertig: UIPrintInteractionController.CompletionHandler = { [weak self] _, _, error in
            if let error = error { print("🖨️ Druck fehlgeschlagen: \(error)") }
            // Die Seite setzt vor dem Druck body.mrep-printing und baut ihr vierseitiges
            // Druckdokument (#mrep-print-doc) auf. Beides gehoert NACH dem Druck wieder weg -
            // die Klasse, damit ein spaeterer Protokoll-Druck nicht in den falschen Druckblock
            // laeuft, und das Dokument, damit es nicht im DOM veraltet.
            //
            // Die Seite raeumt hier bewusst NICHT selbst per Zeitgeber auf: der Druckdialog
            // steht oft laenger offen als jeder sinnvolle Zeitgeber, und ein Aufraeumen
            // waehrend des Renderns wuerde ein leeres Blatt drucken.
            // Lexikon-Feature nutzt denselben generischen Druckweg (window.print(), siehe
            // dortiges lexikonPrintChapter()) - gleiches Aufraeum-Prinzip wie beim
            // Naehrstoff-Report oben, nur mit eigenem Cleanup-Namen/eigener CSS-Klasse. Der
            // "&&"-Kurzschluss macht den jeweils anderen Aufruf zum harmlosen No-Op, falls nur
            // eines der beiden Features gerade gedruckt hat.
            self?.webView?.evaluateJavaScript(
                "(window.lpMrepPrintCleanup && window.lpMrepPrintCleanup()), "
                + "document.body && document.body.classList.remove('mrep-printing'), "
                + "(window.lpLexikonPrintCleanup && window.lpLexikonPrintCleanup()), "
                + "document.body && document.body.classList.remove('lexikon-printing')",
                completionHandler: nil
            )
        }

        // Auf dem iPad verlangt UIKit einen Ursprung fuer das Popover, sonst passiert nichts.
        if UIDevice.current.userInterfaceIdiom == .pad {
            controller.present(from: CGRect(x: view.bounds.midX, y: view.bounds.midY, width: 1, height: 1),
                               in: view, animated: true, completionHandler: fertig)
        } else {
            controller.present(animated: true, completionHandler: fertig)
        }
    }

    // MARK: - Rezept-Text-Scanner (Foto-Aufnahme → Manuelle Live-Text-Auswahl, iOS 16+)
    //
    // Ablauf:
    //   1. VNDocumentCameraViewController öffnen → Foto aufnehmen
    //   2. RecipeTextReviewViewController zeigt das Standbild mit ImageAnalysisInteraction
    //   3. Nutzerin markiert Text manuell → „Auswahl übernehmen" → deliverScannedTextToWeb

    // Hält den Scan-Koordinator am Leben (VNDocumentCameraViewControllerDelegate-Implementierung)
    private var recipeScanCoordinator: AnyObject?

    /// Einstiegspunkt – aus JS-Bridge-Handler „openRecipeTextScanner" aufgerufen.
    private func openRecipeTextScanner() {
        if #available(iOS 16.0, *) {
            checkCameraPermissionAndOpenScanner()
        } else {
            showScannerUnavailableAlert()
        }
    }

    /// Gibt den passenden Text für die aktuelle Systemsprache zurück (DE / IT / EN-Fallback).
    private func scannerL(_ de: String, _ it: String, _ en: String) -> String {
        let lang = String(Locale.preferredLanguages.first?.prefix(2) ?? "en")
        switch lang {
        case "de": return de
        case "it": return it
        default:   return en
        }
    }

    private func showScannerUnavailableAlert() {
        let alert = UIAlertController(
            title: scannerL(
                "Scanner nicht verfügbar",
                "Scanner non disponibile",
                "Scanner unavailable"
            ),
            message: scannerL(
                "Der Rezept-Text-Scanner ist auf diesem Gerät nicht verfügbar. "
                    + "Du kannst den Rezepttext weiterhin manuell einfügen.",
                "Lo scanner del testo ricetta non è disponibile su questo dispositivo. "
                    + "Puoi continuare a inserire il testo manualmente.",
                "The recipe text scanner is not available on this device. "
                    + "You can still insert the recipe text manually."
            ),
            preferredStyle: .alert
        )
        alert.addAction(UIAlertAction(title: "OK", style: .default))
        present(alert, animated: true)
    }

    private func showCameraAccessDeniedAlert() {
        let alert = UIAlertController(
            title: scannerL(
                "Kein Kamerazugriff",
                "Accesso alla fotocamera negato",
                "Camera access denied"
            ),
            message: scannerL(
                "Bitte aktiviere den Kamerazugriff für LabPlate in den iPhone-Einstellungen.",
                "Per favore, attiva l'accesso alla fotocamera per LabPlate nelle Impostazioni.",
                "Please enable camera access for LabPlate in iPhone Settings."
            ),
            preferredStyle: .alert
        )
        alert.addAction(UIAlertAction(
            title: scannerL("Abbrechen", "Annulla", "Cancel"),
            style: .cancel
        ))
        alert.addAction(UIAlertAction(
            title: scannerL("Einstellungen öffnen", "Apri Impostazioni", "Open Settings"),
            style: .default
        ) { _ in
            guard let url = URL(string: UIApplication.openSettingsURLString) else { return }
            UIApplication.shared.open(url)
        })
        present(alert, animated: true)
    }

    private func checkCameraPermissionAndOpenScanner() {
        switch AVCaptureDevice.authorizationStatus(for: .video) {
        case .authorized:
            if #available(iOS 16.0, *) { presentRecipeDocumentScanner() }
        case .notDetermined:
            AVCaptureDevice.requestAccess(for: .video) { [weak self] granted in
                DispatchQueue.main.async {
                    if granted {
                        if #available(iOS 16.0, *) { self?.presentRecipeDocumentScanner() }
                    } else {
                        self?.showCameraAccessDeniedAlert()
                    }
                }
            }
        default:
            showCameraAccessDeniedAlert()
        }
    }

    /// Öffnet Apples Dokument-Scanner-UI (VNDocumentCameraViewController).
    /// Nach Aufnahme → presentRecipeTextReview(image:)
    @available(iOS 16.0, *)
    private func presentRecipeDocumentScanner() {
        guard VNDocumentCameraViewController.isSupported else {
            showScannerUnavailableAlert()
            return
        }
        let coordinator = RecipeDocumentScanCoordinator { [weak self] image in
            self?.presentRecipeTextReview(image: image)
        }
        recipeScanCoordinator = coordinator
        let scanVC = VNDocumentCameraViewController()
        scanVC.delegate = coordinator
        present(scanVC, animated: true)
    }

    /// Zeigt das aufgenommene Foto mit Apple-Live-Text-Auswahl (ImageAnalysisInteraction).
    @available(iOS 16.0, *)
    private func presentRecipeTextReview(image: UIImage) {
        let reviewVC = RecipeTextReviewViewController(
            image: image,
            onTextAccepted: { [weak self] text in
                self?.deliverScannedTextToWeb(text)
            },
            onRetake: { [weak self] in
                self?.presentRecipeDocumentScanner()
            }
        )
        // Falls noch ein Overlay (z. B. Dokument-Scanner) oben liegt, von dort aus präsentieren
        let presenter = presentedViewController ?? self
        presenter.present(reviewVC, animated: true)
    }

    /// Übergibt den gescannten Text per JS-Bridge an das Recipe-Chat-Eingabefeld.
    private func deliverScannedTextToWeb(_ text: String) {
        guard let jsonData = try? JSONSerialization.data(withJSONObject: ["text": text]),
              let jsonString = String(data: jsonData, encoding: .utf8) else { return }
        DispatchQueue.main.async { [weak self] in
            self?.webView.evaluateJavaScript(
                "window.onRecipeTextScanned(\(jsonString));",
                completionHandler: nil
            )
        }
    }

    // MARK: - Natives Theme (Statusleiste + Hintergrund hinter Statusleiste/Dynamic Island)
    //
    // Wird ausschliesslich durch die themeState-Nachricht oben getriggert. view.backgroundColor
    // ist die Flaeche, die tatsaechlich hinter der Statusleiste/Dynamic Island sichtbar ist, da
    // webView selbst erst an view.safeAreaLayoutGuide.topAnchor beginnt (siehe setupWebView()) -
    // diese Flaeche wurde bisher nirgends gesetzt und blieb daher transparent/weiss.
    private func applyNativeTheme(isDark: Bool, ausdruecklich: Bool = false) {
        isLabPlateDarkMode = isDark

        // TASTATURFARBE. iOS entscheidet sie am UIUserInterfaceStyle der WebView; die
        // CSS-Eigenschaft color-scheme der Seite allein genuegt dafuer nicht - deshalb blieb
        // die Tastatur selbst bei ausdruecklich gewaehltem "Dunkel" weiss.
        //
        // Nachgezogen wird ausschliesslich bei einer AUSDRUECKLICHEN Wahl (Hell/Dunkel im
        // App-Menue). Bei "System" bleibt .unspecified stehen, denn ein hier gesetzter Stil
        // waere zugleich das, was die Seite als prefers-color-scheme zurueckliest - die
        // Seite wuerde dann ihre eigene Vorgabe im Kreis lesen statt den echten Systemmodus.
        let stil: UIUserInterfaceStyle = ausdruecklich ? (isDark ? .dark : .light) : .unspecified
        if overrideUserInterfaceStyle != stil { overrideUserInterfaceStyle = stil }
        if webView?.overrideUserInterfaceStyle != stil { webView?.overrideUserInterfaceStyle = stil }

        let background = isDark ? labPlateDarkBackground : labPlateLightBackground
        view.backgroundColor = background
        webView?.superview?.backgroundColor = background
        webView?.backgroundColor = background
        webView?.scrollView.backgroundColor = background
        // Minimale Weitergabe des bereits vorhandenen themeState-Zustands an den echten
        // Statusleisten-Root-Host (siehe LabPlateStatusBarState in LabPlateApp.swift) - keine
        // zweite Theme-Quelle, nur Durchreichen desselben Bool-Werts.
        LabPlateStatusBarState.shared.update(isDark: isDark)
        setNeedsStatusBarAppearanceUpdate()
    }

    // MARK: - Scroll-Lock waehrend der Vollbild-Suche
    //
    // Zwei vorherige Versuche ueber webView.scrollView (erst isScrollEnabled = false, dann
    // ein UIScrollViewDelegate, der staendig auf contentOffset (0,0) zurueckgesetzt hat)
    // haben beide zusaetzlich die Trefferliste selbst blockiert - in dieser WKWebView
    // laeuft offenbar auch das Scrollen innerhalb eines overflow:auto-Bereichs ueber
    // denselben Mechanismus wie das Scrollen der Hauptseite, sodass sich beides nicht
    // sauber trennen liess. Die eigentliche Sperre passiert deshalb jetzt in der HTML/JS-
    // Seite selbst (touchmove wird dort abgefangen, ausser innerhalb der Trefferliste).
    // Dieser native Aufruf bleibt nur als kleine Zusatzkorrektur bestehen: falls WebKits
    // eigene "Feld ueber der Tastatur sichtbar halten"-Automatik die Seite bereits im
    // selben Moment verschoben hat, in dem die Suche geoeffnet wird, wird die Position
    // einmalig zurueckgesetzt.
    private func setSearchScrollLocked(_ locked: Bool) {
        // Korrigiert die Scroll-Position sowohl beim Sperren als auch beim Entsperren
        // (vorher nur beim Sperren) - falls WebKits eigene "Feld ueber der Tastatur
        // sichtbar halten"-Automatik waehrend der offenen Suche einen Offset != (0,0)
        // hinterlassen hat, der sonst ueber das Schliessen der Suche hinaus bestehen bliebe.
        DispatchQueue.main.async { [weak self] in
            self?.webView.scrollView.setContentOffset(.zero, animated: false)
        }
    }

    // MARK: - Klassifikation

    // Zwei Erkennungen laufen parallel in derselben Anfrage:
    // 1) Das eigene Fruits-360-CoreML-Modell - spezialisiert auf Obst/Gemüse, aber auf
    //    Studiofotos (weißer Hintergrund) trainiert.
    // 2) Apples eingebauter, generischer Bilderkenner (VNClassifyImageRequest) - kein
    //    eigenes Training nötig, läuft komplett offline, kennt tausende Alltagsobjekte
    //    inkl. vieler Lebensmittel und ist auf echte Fotos (Kamera, Alltagsszenen)
    //    ausgelegt statt auf Studioaufnahmen. Dient als zweite Meinung, gerade wenn das
    //    Fruits-360-Modell bei einem normalen Foto (z.B. Karotte auf einem Teller) daneben liegt.
    // Beide Ergebnislisten werden zusammengeführt (pro übersetztem Namen der beste
    // Konfidenzwert), nach Konfidenz sortiert und als eine gemeinsame Kandidatenliste an die
    // Web-Seite geschickt - die dortige Logik (mehrere Kandidaten durchprobieren, bis einer
    // einem Lebensmittel zugeordnet werden kann) bleibt unverändert.
    private func classify(base64Image: String, lang: String) {
        DispatchQueue.global(qos: .userInitiated).async { [weak self] in
            guard let self = self else { return }

            guard let data = Data(base64Encoded: base64Image),
                  let uiImage = UIImage(data: data),
                  let rawCiImage = CIImage(image: uiImage) else {
                self.sendResultToWeb(candidates: [], error: "Bild konnte nicht verarbeitet werden")
                return
            }

            // Vorverarbeitung: automatische Belichtungs-/Kontrastkorrektur (hilft bei
            // schwachem Licht) und, wenn möglich, Freistellung des Objekts vom Hintergrund.
            let (ciImage, imageOrientation) = self.preprocessedImage(
                from: rawCiImage, orientation: uiImage.cgImagePropertyOrientation
            )

            var collected: [(label: String, localized: String, confidence: Int, source: String)] = []
            var requests: [VNRequest] = []

            if let visionModel = self.visionModel {
                let classNames = self.foodAIClassNames
                let confidenceThreshold = self.foodAIConfidenceThreshold
                let fruitsRequest = VNCoreMLRequest(model: visionModel) { request, error in
                    // labplate_dinov2_fruits ist kein CoreML-"Classifier"-Modell (siehe
                    // loadFoodAIClassMapping()-Kommentar) - das Ergebnis ist deshalb
                    // VNCoreMLFeatureValueObservation (rohes MLMultiArray), nicht
                    // VNClassificationObservation wie beim alten Modell.
                    guard error == nil,
                          let results = request.results as? [VNCoreMLFeatureValueObservation],
                          let multiArray = results.first?.featureValue.multiArrayValue else { return }

                    // Top-3 statt nur Top-1: hilft bei aehnlichen Objekten (z.B. Tomate vs.
                    // Paprika), falls der eigentlich richtige Treffer nur auf Platz 2/3 der
                    // Softmax-Wahrscheinlichkeiten liegt.
                    let top3 = Self.topFoodAICandidates(from: multiArray, classNames: classNames, top: 3)
                    guard let best = top3.first else { return }

                    // confidence_threshold aus labplate_class_mapping.json: liegt selbst der
                    // staerkste DINOv2-Kandidat darunter (z.B. die 40%-Tomate aus dem Test),
                    // wird das Ergebnis NICHT als sicherer Treffer behandelt, sondern nur als
                    // "unsicher" markiert mitgeschickt - die Auswahl unten bevorzugt in diesem
                    // Fall Apples generische Zweitmeinung (genericRequest), sofern die etwas
                    // liefert, statt blind auf die schwache DINOv2-Vermutung zu vertrauen.
                    let isConfident = Double(best.confidencePercent) / 100.0 >= confidenceThreshold
                    let source = isConfident ? "fruits360" : "fruits360_uncertain"
                    for candidate in top3 {
                        let localized = Self.localizedFoodName(forRawLabel: candidate.label, lang: lang)
                        collected.append((label: candidate.label, localized: localized,
                                           confidence: candidate.confidencePercent, source: source))
                    }
                }
                // .scaleFit statt .centerCrop: schneidet die Frucht/das Gemüse nicht am Rand ab,
                // wenn es auf dem Foto nicht exakt mittig/quadratisch zu sehen ist.
                fruitsRequest.imageCropAndScaleOption = .scaleFit
                requests.append(fruitsRequest)
            }

            let genericRequest = VNClassifyImageRequest { request, error in
                guard error == nil, let results = request.results as? [VNClassificationObservation] else { return }
                var addedFromGeneric = 0
                for obs in results.prefix(40) {
                    guard addedFromGeneric < 8 else { break }
                    // Apple empfiehlt für VNClassifyImageRequest, Ergebnisse über
                    // Precision/Recall statt über den rohen Konfidenzwert zu filtern.
                    guard obs.hasMinimumRecall(0.01, forPrecision: 0.7) else { continue }
                    guard let localized = Self.localizedFoodName(forGenericLabel: obs.identifier, lang: lang) else { continue }
                    collected.append((label: obs.identifier, localized: localized,
                                       confidence: Int(obs.confidence * 100), source: "vision"))
                    addedFromGeneric += 1
                }
            }
            requests.append(genericRequest)

            let handler = VNImageRequestHandler(ciImage: ciImage,
                                                 orientation: imageOrientation,
                                                 options: [:])
            do {
                try handler.perform(requests)
            } catch {
                if collected.isEmpty {
                    self.sendResultToWeb(candidates: [], error: error.localizedDescription)
                    return
                }
            }

            if collected.isEmpty {
                self.sendResultToWeb(candidates: [], error: "Kein Ergebnis")
                return
            }

            // Unsichere DINOv2-Kandidaten (Top-1 unter confidence_threshold, siehe oben)
            // werden nur beruecksichtigt, wenn Apples generische Zweitmeinung ueberhaupt
            // nichts Passendes gefunden hat - so gewinnt bei einem unsicheren DINOv2-Ergebnis
            // im Zweifel die Zweitmeinung, statt dass die schwache Vermutung blind als
            // Treffer durchgereicht wird.
            let confidentCandidates = collected.filter { $0.source != "fruits360_uncertain" }
            let candidatePool = confidentCandidates.isEmpty ? collected : confidentCandidates

            // Pro übersetztem Namen nur den besten Treffer behalten (egal aus welcher Quelle),
            // dann nach Konfidenz sortiert an die Web-Seite schicken.
            var bestByName: [String: (label: String, localized: String, confidence: Int, source: String)] = [:]
            for c in candidatePool {
                if let existing = bestByName[c.localized], existing.confidence >= c.confidence { continue }
                bestByName[c.localized] = c
            }
            let merged = bestByName.values.sorted { $0.confidence > $1.confidence }.prefix(6)
            let candidates: [[String: Any]] = merged.map {
                ["label": $0.label, "labelLocalized": $0.localized, "confidence": $0.confidence, "source": $0.source]
            }
            self.sendResultToWeb(candidates: candidates, error: nil)
        }
    }

    private func sendResultToWeb(candidates: [[String: Any]], error: String?) {
        var payload: [String: Any] = [:]
        payload["candidates"] = candidates
        payload["error"] = error ?? NSNull()

        guard let jsonData = try? JSONSerialization.data(withJSONObject: payload),
              let jsonString = String(data: jsonData, encoding: .utf8) else { return }

        DispatchQueue.main.async { [weak self] in
            self?.webView.evaluateJavaScript("window.onRecognitionResult(\(jsonString));", completionHandler: nil)
        }
    }

    // MARK: - Bild-Vorverarbeitung (Low-Light-Korrektur + Freistellung)

    // Läuft VOR jeder Erkennung. Die Kamera-/Fotoaufnahme selbst übernimmt weiterhin die
    // system-eigene Foto-App (aufgerufen über <input type="file capture"> in der Web-Seite,
    // kein eigener AVCaptureSession-Feed in dieser App) - dort greift bereits automatisch
    // Apples eigenes Low-Light-Verhalten (Night Mode) auf unterstützten Geräten. Was WIR
    // zusätzlich beeinflussen können, ist das bereits aufgenommene Foto, bevor es an die
    // Erkennung geht:
    // 1) Automatische, adaptive Belichtungs-/Kontrastkorrektur (kein festes Boost-Preset,
    //    sondern anhand des jeweiligen Fotos berechnet) - hilft besonders bei dunklen oder
    //    kontrastarmen Aufnahmen.
    // 2) Freistellung des eigentlichen Objekts vom Hintergrund über Vision (iOS 17+),
    //    rein bildbasiert. Das ist der Ersatz für eine LiDAR-Tiefensegmentierung: LiDAR
    //    steckt nur in den Pro-Modellen und liefert für ein einzelnes, bereits fokussiertes
    //    Nahaufnahme-Foto (kein Live-Video mit Tiefenkanal) ohnehin keinen Zusatznutzen
    //    gegenüber einer bildbasierten Freistellung - diese läuft dafür auf JEDEM iPhone
    //    mit iOS 17+, nicht nur auf Pro-Geräten.
    private func preprocessedImage(
        from ciImage: CIImage,
        orientation: CGImagePropertyOrientation
    ) -> (image: CIImage, orientation: CGImagePropertyOrientation) {
        var image = ciImage
        for filter in image.autoAdjustmentFilters(options: [.enhance: true]) {
            filter.setValue(image, forKey: kCIInputImageKey)
            if let output = filter.outputImage {
                image = output
            }
        }

        if #available(iOS 17.0, *),
           let isolated = isolatedForegroundImage(from: image, orientation: orientation) {
            // Das Ergebnis der Freistellung ist bereits korrekt ausgerichtet (Vision hat
            // die Original-Orientierung schon beim Erzeugen der Maske berücksichtigt) -
            // daher hier .up statt der ursprünglichen Fotoausrichtung zurückgeben.
            return (isolated, .up)
        }
        return (image, orientation)
    }

    @available(iOS 17.0, *)
    private func isolatedForegroundImage(from ciImage: CIImage, orientation: CGImagePropertyOrientation) -> CIImage? {
        let handler = VNImageRequestHandler(ciImage: ciImage, orientation: orientation, options: [:])
        let request = VNGenerateForegroundInstanceMaskRequest()
        do {
            try handler.perform([request])
            guard let observation = request.results?.first, !observation.allInstances.isEmpty else {
                return nil
            }
            let maskedPixelBuffer = try observation.generateMaskedImage(
                ofInstances: observation.allInstances,
                from: handler,
                croppedToInstancesExtent: true
            )
            return CIImage(cvPixelBuffer: maskedPixelBuffer)
        } catch {
            print("ℹ️ Freistellung nicht möglich, nutze Vollbild: \(error)")
            return nil
        }
    }
}

// MARK: - labplate_class_mapping.json (Index -> Rohname fuer das labplate_dinov2_fruits-Modell)
private struct FoodAIClassMappingEntry: Decodable {
    let i: Int
    let n: String
}
private struct FoodAIClassMappingFile: Decodable {
    let confidence_threshold: Double?
    let classes: [FoodAIClassMappingEntry]
}

// MARK: - Softmax + Top-K fuer das rohe MLMultiArray-Ausgabeformat von labplate_dinov2_fruits
extension LabPlateWebViewController {
    static func topFoodAICandidates(
        from multiArray: MLMultiArray, classNames: [String], top: Int
    ) -> [(label: String, confidencePercent: Int)] {
        let count = multiArray.count
        guard count > 0, classNames.count == count else { return [] }

        var logits = [Float](repeating: 0, count: count)
        for i in 0..<count {
            logits[i] = Float(truncating: multiArray[i])
        }

        let maxLogit = logits.max() ?? 0
        var probabilities = logits.map { exp($0 - maxLogit) }
        let sumExp = probabilities.reduce(0, +)
        guard sumExp > 0 else { return [] }
        for i in 0..<probabilities.count { probabilities[i] /= sumExp }

        return probabilities.enumerated()
            .sorted { $0.element > $1.element }
            .prefix(top)
            .map { index, probability in (label: classNames[index], confidencePercent: Int(probability * 100)) }
    }
}

// MARK: - Winziger lokaler HTTP-Server (nur localhost/loopback), liefert die gebündelte HTML-Datei aus.
final class LocalHTTPServer {
    private var listener: NWListener?
    private let htmlData: Data
    // Lexikon-Feature (und ganz allgemein: jede weitere per <script src="...">/<link>
    // nachgeladene Datei): bisher lieferte respond(to:requestData:) NUR "/" bzw. "/index.html"
    // aus, jeder andere Pfad ergab 404. Zusaetzliche Dateien werden hier ueber ihren exakten
    // Pfad (z.B. "/lexikon-data.js") nachgeschlagen - siehe respond(to:requestData:) weiter
    // unten. Leeres Dictionary aendert am bisherigen Verhalten nichts.
    private let extraFiles: [String: (data: Data, contentType: String)]
    var onReady: ((UInt16) -> Void)?

    // WICHTIG (Datenverlust-Fix): frueher wurde der Port ueber ".any" zufaellig vom System
    // vergeben - bei jedem App-Start ein ANDERER Port. Da der Port Teil der WebKit-"Origin"
    // ist (http://localhost:PORT), hat WKWebView localStorage bei jedem Neustart einer
    // komplett neuen, leeren Origin zugeordnet - alle gespeicherten Daten (Lebensmittel,
    // Mahlzeiten, Tagesverlauf, Ziele, Einstellungen, Laborwerte) waren dadurch nach
    // vollstaendigem Schliessen/Neuoeffnen der App "weg", obwohl sie korrekt in localStorage
    // geschrieben wurden und config.websiteDataStore bereits .default() (persistent) war.
    // Fix: fester, unveraenderlicher Port bei jedem Start, damit die Origin - und damit
    // localStorage - ueber App-Neustarts hinweg stabil bleibt.
    private static let preferredPort: UInt16 = 51873
    private var preferredPortRetryCount = 0

    init(htmlData: Data, extraFiles: [String: (data: Data, contentType: String)] = [:]) {
        self.htmlData = htmlData
        self.extraFiles = extraFiles
    }

    func start() {
        startListener(on: NWEndpoint.Port(rawValue: Self.preferredPort))
    }

    private func startListener(on port: NWEndpoint.Port?) {
        let params = NWParameters.tcp
        params.requiredInterfaceType = .loopback // nur über localhost erreichbar, nicht im Netzwerk sichtbar
        // Erlaubt sofortiges erneutes Binden an denselben festen Port bei einem Neustart,
        // auch falls der vorherige Socket vom Betriebssystem noch kurz "nachwirkt".
        params.allowLocalEndpointReuse = true

        let newListener: NWListener?
        if let port = port {
            newListener = try? NWListener(using: params, on: port)
        } else {
            newListener = try? NWListener(using: params, on: .any)
        }
        guard let listener = newListener else {
            print("❌ Lokaler Server konnte nicht erstellt werden")
            return
        }
        self.listener = listener

        listener.newConnectionHandler = { [weak self] connection in
            self?.handle(connection: connection)
        }

        listener.stateUpdateHandler = { [weak self] state in
            switch state {
            case .ready:
                if let port = self?.listener?.port?.rawValue {
                    print("✅ Lokaler Server bereit auf Port \(port)")
                    self?.preferredPortRetryCount = 0
                    self?.onReady?(port)
                }
            case .failed(let error):
                print("❌ Lokaler Server fehlgeschlagen: \(error)")
                guard let self = self else { return }
                // KEIN Zufalls-Port mehr: neuer Port = neue Origin = leerer localStorage
                // (Datenverlust bei jedem Update/Neustart). Stattdessen festen Port erneut versuchen.
                listener.cancel()
                if self.preferredPortRetryCount < 8 {
                    self.preferredPortRetryCount += 1
                    let delay = 0.25 * Double(self.preferredPortRetryCount)
                    DispatchQueue.main.asyncAfter(deadline: .now() + delay) { [weak self] in
                        self?.startListener(on: NWEndpoint.Port(rawValue: Self.preferredPort))
                    }
                } else {
                    print("❌ Fester Port \(Self.preferredPort) bleibt belegt – App lädt nicht, um Datenverlust zu vermeiden")
                }
            default:
                break
            }
        }

        listener.start(queue: .main)
    }

    func stop() {
        listener?.cancel()
        listener = nil
    }

    private func handle(connection: NWConnection) {
        connection.start(queue: .main)
        receive(on: connection)
    }

    private func receive(on connection: NWConnection) {
        connection.receive(minimumIncompleteLength: 1, maximumLength: 65536) { [weak self] data, _, isComplete, error in
            guard let self = self else { return }
            if let data = data, !data.isEmpty {
                self.respond(to: connection, requestData: data)
            } else if isComplete || error != nil {
                connection.cancel()
            }
        }
    }

    private func respond(to connection: NWConnection, requestData: Data) {
        let requestString = String(data: requestData, encoding: .utf8) ?? ""
        let firstLine = requestString.components(separatedBy: "\r\n").first ?? ""
        let parts = firstLine.split(separator: " ")
        let path = parts.count > 1 ? String(parts[1]) : "/"

        let body: Data
        let status: String
        let contentType: String
        if path == "/" || path == "/index.html" || path.isEmpty {
            body = htmlData
            status = "200 OK"
            contentType = "text/html; charset=utf-8"
        } else if let extra = extraFiles[path] {
            body = extra.data
            status = "200 OK"
            contentType = extra.contentType
        } else {
            body = Data()
            status = "404 Not Found"
            contentType = "text/plain"
        }

        let header = "HTTP/1.1 \(status)\r\nContent-Type: \(contentType)\r\nContent-Length: \(body.count)\r\nConnection: close\r\n\r\n"
        var responseData = Data(header.utf8)
        responseData.append(body)

        connection.send(content: responseData, completion: .contentProcessed { _ in
            connection.cancel()
        })
    }
}

// MARK: - Verhindert Retain-Cycle zwischen WKUserContentController und LabPlateWebViewController
final class WeakScriptMessageHandler: NSObject, WKScriptMessageHandler {
    private weak var target: WKScriptMessageHandler?

    init(_ target: WKScriptMessageHandler) {
        self.target = target
    }

    func userContentController(_ userContentController: WKUserContentController,
                                didReceive message: WKScriptMessage) {
        target?.userContentController(userContentController, didReceive: message)
    }
}

/// Hält eine UIBackgroundTaskIdentifier, damit Expiration- und Completion-Handler sie beenden können.
private final class BackgroundTaskBox {
    var id: UIBackgroundTaskIdentifier = .invalid
    func end() {
        if id != .invalid {
            UIApplication.shared.endBackgroundTask(id)
            id = .invalid
        }
    }
}

// MARK: - UIImage-Orientierung -> CGImagePropertyOrientation (korrigiert Fotoausrichtung vor der Erkennung)
extension UIImage {
    var cgImagePropertyOrientation: CGImagePropertyOrientation {
        switch imageOrientation {
        case .up: return .up
        case .down: return .down
        case .left: return .left
        case .right: return .right
        case .upMirrored: return .upMirrored
        case .downMirrored: return .downMirrored
        case .leftMirrored: return .leftMirrored
        case .rightMirrored: return .rightMirrored
        @unknown default: return .up
        }
    }
}

// MARK: - Fruits-360 (Modell-Klassennamen) -> Anzeigename in DE/EN/ES/IT.
// Das CoreML-Modell wurde auf dem öffentlichen Fruits-360-Datensatz trainiert; die
// zurückgegebenen "identifier"-Strings sind daher englische Ordnernamen wie
// "Apple Braeburn 1", "Cherry Wax Yellow 1" oder "Tomato Cherry Red 2" (Wortliste + eine
// Varianten-Nummer am Ende). Diese Tabelle wurde direkt aus den im .mlmodel eingebetteten
// Klassennamen dieses Projekts erstellt, damit garantiert kein Label unübersetzt bleibt,
// und deckt alle vier App-Sprachen ab.
extension LabPlateWebViewController {

    struct FoodTranslation {
        let de: String
        let en: String
        let es: String
        let it: String

        func value(for lang: String) -> String {
            switch lang {
            case "en": return en
            case "es": return es
            case "it": return it
            default: return de
            }
        }
    }

    static let fruits360Translations: [String: FoodTranslation] = [
        "Apple": FoodTranslation(de: "Apfel", en: "Apple", es: "Manzana", it: "Mela"),
        "Avocado Black": FoodTranslation(de: "Avocado", en: "Avocado", es: "Aguacate", it: "Avocado"),
        "Avocado Green": FoodTranslation(de: "Avocado", en: "Avocado", es: "Aguacate", it: "Avocado"),
        "Avocado": FoodTranslation(de: "Avocado", en: "Avocado", es: "Aguacate", it: "Avocado"),
        "Banana Lady Finger": FoodTranslation(de: "Banane", en: "Banana", es: "Plátano", it: "Banana"),
        "Banana Red": FoodTranslation(de: "Banane", en: "Banana", es: "Plátano", it: "Banana"),
        "Banana": FoodTranslation(de: "Banane", en: "Banana", es: "Plátano", it: "Banana"),
        "Bean pod": FoodTranslation(de: "Bohne", en: "Bean", es: "Judía", it: "Fagiolo"),
        "Beetroot": FoodTranslation(de: "Rote Bete", en: "Beetroot", es: "Remolacha", it: "Barbabietola"),
        "Blackberry": FoodTranslation(de: "Brombeere", en: "Blackberry", es: "Zarzamora", it: "Mora"),
        "Blueberry": FoodTranslation(de: "Heidelbeere", en: "Blueberry", es: "Arándano", it: "Mirtillo"),
        "Cabbage red": FoodTranslation(de: "Rotkohl", en: "Red cabbage", es: "Col lombarda", it: "Cavolo rosso"),
        "Cabbage white": FoodTranslation(de: "Weißkohl", en: "White cabbage", es: "Col blanca", it: "Cavolo cappuccio"),
        "Cactus fruit green": FoodTranslation(de: "Kaktusfeige", en: "Prickly pear", es: "Higo chumbo", it: "Fico d'India"),
        "Cactus fruit red": FoodTranslation(de: "Kaktusfeige", en: "Prickly pear", es: "Higo chumbo", it: "Fico d'India"),
        "Cactus fruit": FoodTranslation(de: "Kaktusfeige", en: "Prickly pear", es: "Higo chumbo", it: "Fico d'India"),
        "Caju seed": FoodTranslation(de: "Cashewkern", en: "Cashew nut", es: "Anacardo", it: "Anacardo"),
        "Cantaloupe": FoodTranslation(de: "Melone", en: "Cantaloupe melon", es: "Melón cantalupo", it: "Melone"),
        "Carambola": FoodTranslation(de: "Sternfrucht", en: "Starfruit", es: "Carambola", it: "Carambola"),
        "Carrot": FoodTranslation(de: "Karotte", en: "Carrot", es: "Zanahoria", it: "Carota"),
        "Cauliflower": FoodTranslation(de: "Blumenkohl", en: "Cauliflower", es: "Coliflor", it: "Cavolfiore"),
        "Celery": FoodTranslation(de: "Sellerie", en: "Celery", es: "Apio", it: "Sedano"),
        "Cherimoya": FoodTranslation(de: "Cherimoya", en: "Cherimoya", es: "Chirimoya", it: "Cherimoya"),
        "Cherry Rainier": FoodTranslation(de: "Kirsche", en: "Cherry", es: "Cereza", it: "Ciliegia"),
        "Cherry Sour": FoodTranslation(de: "Sauerkirsche", en: "Sour cherry", es: "Guinda", it: "Amarena"),
        "Cherry Wax Black": FoodTranslation(de: "Wachskirsche", en: "Wax cherry", es: "Cereza de cera", it: "Ciliegia di cera"),
        "Cherry Wax Red": FoodTranslation(de: "Wachskirsche", en: "Wax cherry", es: "Cereza de cera", it: "Ciliegia di cera"),
        "Cherry Wax Yellow": FoodTranslation(de: "Wachskirsche", en: "Wax cherry", es: "Cereza de cera", it: "Ciliegia di cera"),
        "Cherry Wax": FoodTranslation(de: "Wachskirsche", en: "Wax cherry", es: "Cereza de cera", it: "Ciliegia di cera"),
        "Cherry": FoodTranslation(de: "Kirsche", en: "Cherry", es: "Cereza", it: "Ciliegia"),
        "Chestnut": FoodTranslation(de: "Kastanie", en: "Chestnut", es: "Castaña", it: "Castagna"),
        "Clementine": FoodTranslation(de: "Clementine", en: "Clementine", es: "Clementina", it: "Clementina"),
        "Cocos": FoodTranslation(de: "Kokosnuss", en: "Coconut", es: "Coco", it: "Cocco"),
        "Corn Husk": FoodTranslation(de: "Mais", en: "Corn", es: "Maíz", it: "Mais"),
        "Corn": FoodTranslation(de: "Mais", en: "Corn", es: "Maíz", it: "Mais"),
        "Cucumber": FoodTranslation(de: "Gurke", en: "Cucumber", es: "Pepino", it: "Cetriolo"),
        "Dates": FoodTranslation(de: "Dattel", en: "Date", es: "Dátil", it: "Dattero"),
        "Eggplant long": FoodTranslation(de: "Aubergine", en: "Eggplant", es: "Berenjena", it: "Melanzana"),
        "Eggplant": FoodTranslation(de: "Aubergine", en: "Eggplant", es: "Berenjena", it: "Melanzana"),
        "Fig": FoodTranslation(de: "Feige", en: "Fig", es: "Higo", it: "Fico"),
        "Ginger Root": FoodTranslation(de: "Ingwer", en: "Ginger", es: "Jengibre", it: "Zenzero"),
        "Ginger": FoodTranslation(de: "Ingwer", en: "Ginger", es: "Jengibre", it: "Zenzero"),
        "Gooseberry": FoodTranslation(de: "Stachelbeere", en: "Gooseberry", es: "Grosella espinosa", it: "Uva spina"),
        "Granadilla": FoodTranslation(de: "Maracuja", en: "Passion fruit", es: "Maracuyá", it: "Frutto della passione"),
        "Grape Blue": FoodTranslation(de: "Weintraube", en: "Grape", es: "Uva", it: "Uva"),
        "Grape Pink": FoodTranslation(de: "Weintraube", en: "Grape", es: "Uva", it: "Uva"),
        "Grape White": FoodTranslation(de: "Weintraube", en: "Grape", es: "Uva", it: "Uva"),
        "Grape pink": FoodTranslation(de: "Weintraube", en: "Grape", es: "Uva", it: "Uva"),
        "Grape": FoodTranslation(de: "Weintraube", en: "Grape", es: "Uva", it: "Uva"),
        "Grapefruit Pink": FoodTranslation(de: "Grapefruit", en: "Grapefruit", es: "Pomelo", it: "Pompelmo"),
        "Grapefruit White": FoodTranslation(de: "Grapefruit", en: "Grapefruit", es: "Pomelo", it: "Pompelmo"),
        "Guava": FoodTranslation(de: "Guave", en: "Guava", es: "Guayaba", it: "Guava"),
        "Hazelnut": FoodTranslation(de: "Haselnuss", en: "Hazelnut", es: "Avellana", it: "Nocciola"),
        "Huckleberry": FoodTranslation(de: "Heidelbeere", en: "Huckleberry", es: "Arándano silvestre", it: "Mirtillo selvatico"),
        "Kaki": FoodTranslation(de: "Kaki", en: "Persimmon", es: "Caqui", it: "Cachi"),
        "Kiwi": FoodTranslation(de: "Kiwi", en: "Kiwi", es: "Kiwi", it: "Kiwi"),
        "Kohlrabi": FoodTranslation(de: "Kohlrabi", en: "Kohlrabi", es: "Colinabo", it: "Cavolo rapa"),
        "Kumquats": FoodTranslation(de: "Kumquat", en: "Kumquat", es: "Kumquat", it: "Kumquat"),
        "Lemon Meyer": FoodTranslation(de: "Zitrone", en: "Lemon", es: "Limón", it: "Limone"),
        "Lemon": FoodTranslation(de: "Zitrone", en: "Lemon", es: "Limón", it: "Limone"),
        "Limes": FoodTranslation(de: "Limette", en: "Lime", es: "Lima", it: "Lime"),
        "Lychee": FoodTranslation(de: "Litschi", en: "Lychee", es: "Lichi", it: "Litchi"),
        "Mandarine": FoodTranslation(de: "Mandarine", en: "Mandarin", es: "Mandarina", it: "Mandarino"),
        "Mango Red": FoodTranslation(de: "Mango", en: "Mango", es: "Mango", it: "Mango"),
        "Mango": FoodTranslation(de: "Mango", en: "Mango", es: "Mango", it: "Mango"),
        "Mangostan": FoodTranslation(de: "Mangostane", en: "Mangosteen", es: "Mangostán", it: "Mangostano"),
        "Maracuja": FoodTranslation(de: "Maracuja", en: "Passion fruit", es: "Maracuyá", it: "Frutto della passione"),
        "Melon Piel de Sapo": FoodTranslation(de: "Melone", en: "Melon", es: "Melón", it: "Melone"),
        "Mulberry": FoodTranslation(de: "Maulbeere", en: "Mulberry", es: "Mora", it: "Gelso"),
        "Nectarine Flat": FoodTranslation(de: "Nektarine", en: "Nectarine", es: "Nectarina", it: "Nettarina"),
        "Nectarine": FoodTranslation(de: "Nektarine", en: "Nectarine", es: "Nectarina", it: "Nettarina"),
        "Nut Forest": FoodTranslation(de: "Nuss", en: "Nut", es: "Nuez", it: "Noce"),
        "Nut Pecan": FoodTranslation(de: "Pekannuss", en: "Pecan", es: "Pacana", it: "Noce pecan"),
        "Nut": FoodTranslation(de: "Nuss", en: "Nut", es: "Nuez", it: "Noce"),
        "Onion Red": FoodTranslation(de: "Zwiebel", en: "Onion", es: "Cebolla", it: "Cipolla"),
        "Onion White": FoodTranslation(de: "Zwiebel", en: "Onion", es: "Cebolla", it: "Cipolla"),
        "Onion": FoodTranslation(de: "Zwiebel", en: "Onion", es: "Cebolla", it: "Cipolla"),
        "Orange peeled": FoodTranslation(de: "Orange", en: "Orange", es: "Naranja", it: "Arancia"),
        "Orange": FoodTranslation(de: "Orange", en: "Orange", es: "Naranja", it: "Arancia"),
        "Papaya": FoodTranslation(de: "Papaya", en: "Papaya", es: "Papaya", it: "Papaya"),
        "Passion Fruit": FoodTranslation(de: "Maracuja", en: "Passion fruit", es: "Maracuyá", it: "Frutto della passione"),
        "Peach Flat": FoodTranslation(de: "Pfirsich", en: "Peach", es: "Melocotón", it: "Pesca"),
        "Peach": FoodTranslation(de: "Pfirsich", en: "Peach", es: "Melocotón", it: "Pesca"),
        "Pear Abate": FoodTranslation(de: "Birne", en: "Pear", es: "Pera", it: "Pera"),
        "Pear Forelle": FoodTranslation(de: "Birne", en: "Pear", es: "Pera", it: "Pera"),
        "Pear Kaiser": FoodTranslation(de: "Birne", en: "Pear", es: "Pera", it: "Pera"),
        "Pear Monster": FoodTranslation(de: "Birne", en: "Pear", es: "Pera", it: "Pera"),
        "Pear Red": FoodTranslation(de: "Birne", en: "Pear", es: "Pera", it: "Pera"),
        "Pear Stone": FoodTranslation(de: "Birne", en: "Pear", es: "Pera", it: "Pera"),
        "Pear Williams": FoodTranslation(de: "Birne", en: "Pear", es: "Pera", it: "Pera"),
        "Pear": FoodTranslation(de: "Birne", en: "Pear", es: "Pera", it: "Pera"),
        "Pepino": FoodTranslation(de: "Pepino", en: "Pepino melon", es: "Pepino dulce", it: "Pepino"),
        "Pepper Green": FoodTranslation(de: "Paprika grün", en: "Green pepper", es: "Pimiento verde", it: "Peperone verde"),
        "Pepper Orange": FoodTranslation(de: "Paprika orange", en: "Orange pepper", es: "Pimiento naranja", it: "Peperone arancione"),
        "Pepper Red": FoodTranslation(de: "Paprika rot", en: "Red pepper", es: "Pimiento rojo", it: "Peperone rosso"),
        "Pepper Yellow": FoodTranslation(de: "Paprika gelb", en: "Yellow pepper", es: "Pimiento amarillo", it: "Peperone giallo"),
        "Pepper": FoodTranslation(de: "Paprika", en: "Pepper", es: "Pimiento", it: "Peperone"),
        "Physalis with Husk": FoodTranslation(de: "Physalis", en: "Physalis", es: "Physalis", it: "Physalis"),
        "Physalis": FoodTranslation(de: "Physalis", en: "Physalis", es: "Physalis", it: "Physalis"),
        "Pineapple Mini": FoodTranslation(de: "Ananas", en: "Pineapple", es: "Piña", it: "Ananas"),
        "Pineapple": FoodTranslation(de: "Ananas", en: "Pineapple", es: "Piña", it: "Ananas"),
        "Pistachio": FoodTranslation(de: "Pistazie", en: "Pistachio", es: "Pistacho", it: "Pistacchio"),
        "Pitahaya Red": FoodTranslation(de: "Drachenfrucht", en: "Dragon fruit", es: "Pitahaya", it: "Pitaya"),
        "Plum": FoodTranslation(de: "Pflaume", en: "Plum", es: "Ciruela", it: "Prugna"),
        "Pomegranate": FoodTranslation(de: "Granatapfel", en: "Pomegranate", es: "Granada", it: "Melagrana"),
        "Pomelo Sweetie": FoodTranslation(de: "Pomelo", en: "Pomelo", es: "Pomelo", it: "Pomelo"),
        "Potato Red": FoodTranslation(de: "Kartoffel", en: "Potato", es: "Patata", it: "Patata"),
        "Potato Sweet": FoodTranslation(de: "Süßkartoffel", en: "Sweet potato", es: "Boniato", it: "Patata dolce"),
        "Potato White": FoodTranslation(de: "Kartoffel", en: "Potato", es: "Patata", it: "Patata"),
        "Quince": FoodTranslation(de: "Quitte", en: "Quince", es: "Membrillo", it: "Cotogna"),
        "Rambutan": FoodTranslation(de: "Rambutan", en: "Rambutan", es: "Rambután", it: "Rambutan"),
        "Raspberry": FoodTranslation(de: "Himbeere", en: "Raspberry", es: "Frambuesa", it: "Lampone"),
        "Redcurrant": FoodTranslation(de: "Johannisbeere", en: "Redcurrant", es: "Grosella roja", it: "Ribes rosso"),
        "Salak": FoodTranslation(de: "Salak", en: "Salak", es: "Salak", it: "Salak"),
        "Strawberry Wedge": FoodTranslation(de: "Erdbeere", en: "Strawberry", es: "Fresa", it: "Fragola"),
        "Strawberry": FoodTranslation(de: "Erdbeere", en: "Strawberry", es: "Fresa", it: "Fragola"),
        "Tamarillo": FoodTranslation(de: "Tamarillo", en: "Tamarillo", es: "Tamarillo", it: "Tamarillo"),
        "Tomato Cherry Maroon": FoodTranslation(de: "Tomate", en: "Tomato", es: "Tomate", it: "Pomodoro"),
        "Tomato Cherry Orange": FoodTranslation(de: "Tomate", en: "Tomato", es: "Tomate", it: "Pomodoro"),
        "Tomato Cherry Red": FoodTranslation(de: "Tomate", en: "Tomato", es: "Tomate", it: "Pomodoro"),
        "Tomato Cherry Yellow": FoodTranslation(de: "Tomate", en: "Tomato", es: "Tomate", it: "Pomodoro"),
        "Tomato Heart": FoodTranslation(de: "Tomate", en: "Tomato", es: "Tomate", it: "Pomodoro"),
        "Tomato Maroon": FoodTranslation(de: "Tomate", en: "Tomato", es: "Tomate", it: "Pomodoro"),
        "Tomato Yellow": FoodTranslation(de: "Tomate", en: "Tomato", es: "Tomate", it: "Pomodoro"),
        "Tomato": FoodTranslation(de: "Tomate", en: "Tomato", es: "Tomate", it: "Pomodoro"),
        "Walnut": FoodTranslation(de: "Walnuss", en: "Walnut", es: "Nuez", it: "Noce"),
        "Watermelon": FoodTranslation(de: "Wassermelone", en: "Watermelon", es: "Sandía", it: "Anguria"),
        "Zucchini Green": FoodTranslation(de: "Zucchini", en: "Zucchini", es: "Calabacín", it: "Zucchina"),
        "Zucchini dark": FoodTranslation(de: "Zucchini", en: "Zucchini", es: "Calabacín", it: "Zucchina"),
        "Zucchini": FoodTranslation(de: "Zucchini", en: "Zucchini", es: "Calabacín", it: "Zucchina"),
    ]

    // Entfernt zuerst die Varianten-Nummer am Ende ("Apple Braeburn 1" -> "Apple Braeburn")
    // und sucht dann von der vollständigen Wortfolge ausgehend rückwärts nach einem Treffer
    // in der Tabelle oben (z.B. erst "Cherry Wax Yellow", dann "Cherry Wax", dann "Cherry").
    // "lang" ist der aktuelle App-Sprachcode aus der Web-App (de/en/es/it); unbekannte oder
    // fehlende Sprachcodes fallen auf Deutsch zurück. Falls gar nichts passt, wird wenigstens
    // der bereinigte Rohname zurückgegeben statt nichts.
    static func localizedFoodName(forRawLabel rawLabel: String, lang: String) -> String {
        var base = rawLabel
        if let range = base.range(of: #"\s+\d+$"#, options: .regularExpression) {
            base.removeSubrange(range)
        }
        base = base.trimmingCharacters(in: .whitespaces)

        var words = base.split(separator: " ").map(String.init)
        while !words.isEmpty {
            let candidate = words.joined(separator: " ")
            if let t = fruits360Translations[candidate] {
                return t.value(for: lang)
            }
            words.removeLast()
        }
        return base
    }

    // MARK: - Wortschatz für Apples eingebauten, generischen Bilderkenner (VNClassifyImageRequest)

    // Apples eingebauter Klassifikator verwendet ein eigenes, nicht öffentlich dokumentiertes
    // Vokabular aus allgemeinen englischen Begriffen (z.B. "carrot", "bell pepper") - anders
    // als die Fruits-360-Ordnernamen oben. Diese Tabelle deckt die wichtigsten Obst-/Gemüse-
    // begriffe ab (u.a. abgeglichen mit den in der App bereits fest hinterlegten Lebensmitteln
    // wie Brokkoli, Knoblauch oder Salat, die es im Fruits-360-Modell gar nicht gibt). Nur
    // Kandidaten, die hier einen Treffer haben, werden aus der generischen Erkennung
    // übernommen - alles andere (Möbel, Tiere, Personen, Szenen usw.) wird verworfen.
    static let genericVisionFoodTerms: [String: FoodTranslation] = [
        "apple": FoodTranslation(de: "Apfel", en: "Apple", es: "Manzana", it: "Mela"),
        "banana": FoodTranslation(de: "Banane", en: "Banana", es: "Plátano", it: "Banana"),
        "orange": FoodTranslation(de: "Orange", en: "Orange", es: "Naranja", it: "Arancia"),
        "tomato": FoodTranslation(de: "Tomate", en: "Tomato", es: "Tomate", it: "Pomodoro"),
        "cucumber": FoodTranslation(de: "Gurke", en: "Cucumber", es: "Pepino", it: "Cetriolo"),
        "bell pepper": FoodTranslation(de: "Paprika", en: "Bell pepper", es: "Pimiento", it: "Peperone"),
        "pepper": FoodTranslation(de: "Paprika", en: "Pepper", es: "Pimiento", it: "Peperone"),
        "carrot": FoodTranslation(de: "Karotte", en: "Carrot", es: "Zanahoria", it: "Carota"),
        "potato": FoodTranslation(de: "Kartoffel", en: "Potato", es: "Patata", it: "Patata"),
        "onion": FoodTranslation(de: "Zwiebel", en: "Onion", es: "Cebolla", it: "Cipolla"),
        "garlic": FoodTranslation(de: "Knoblauch", en: "Garlic", es: "Ajo", it: "Aglio"),
        "ginger": FoodTranslation(de: "Ingwer", en: "Ginger", es: "Jengibre", it: "Zenzero"),
        "lettuce": FoodTranslation(de: "Salat", en: "Lettuce", es: "Lechuga", it: "Lattuga"),
        "salad": FoodTranslation(de: "Salat", en: "Salad", es: "Ensalada", it: "Insalata"),
        "broccoli": FoodTranslation(de: "Brokkoli", en: "Broccoli", es: "Brócoli", it: "Broccoli"),
        "cauliflower": FoodTranslation(de: "Blumenkohl", en: "Cauliflower", es: "Coliflor", it: "Cavolfiore"),
        "eggplant": FoodTranslation(de: "Aubergine", en: "Eggplant", es: "Berenjena", it: "Melanzana"),
        "aubergine": FoodTranslation(de: "Aubergine", en: "Eggplant", es: "Berenjena", it: "Melanzana"),
        "avocado": FoodTranslation(de: "Avocado", en: "Avocado", es: "Aguacate", it: "Avocado"),
        "lemon": FoodTranslation(de: "Zitrone", en: "Lemon", es: "Limón", it: "Limone"),
        "zucchini": FoodTranslation(de: "Zucchini", en: "Zucchini", es: "Calabacín", it: "Zucchina"),
        "courgette": FoodTranslation(de: "Zucchini", en: "Zucchini", es: "Calabacín", it: "Zucchina"),
        "spinach": FoodTranslation(de: "Spinat", en: "Spinach", es: "Espinaca", it: "Spinaci"),
        "mushroom": FoodTranslation(de: "Pilz", en: "Mushroom", es: "Champiñón", it: "Fungo"),
        "asparagus": FoodTranslation(de: "Spargel", en: "Asparagus", es: "Espárrago", it: "Asparago"),
        "pea": FoodTranslation(de: "Erbse", en: "Pea", es: "Guisante", it: "Pisello"),
        "green bean": FoodTranslation(de: "Grüne Bohne", en: "Green bean", es: "Judía verde", it: "Fagiolino"),
        "pumpkin": FoodTranslation(de: "Kürbis", en: "Pumpkin", es: "Calabaza", it: "Zucca"),
        "squash": FoodTranslation(de: "Kürbis", en: "Squash", es: "Calabaza", it: "Zucca"),
        "radish": FoodTranslation(de: "Rettich", en: "Radish", es: "Rábano", it: "Ravanello"),
        "celery": FoodTranslation(de: "Sellerie", en: "Celery", es: "Apio", it: "Sedano"),
        "beet": FoodTranslation(de: "Rote Bete", en: "Beet", es: "Remolacha", it: "Barbabietola"),
        "beetroot": FoodTranslation(de: "Rote Bete", en: "Beetroot", es: "Remolacha", it: "Barbabietola"),
        "cabbage": FoodTranslation(de: "Kohl", en: "Cabbage", es: "Col", it: "Cavolo"),
        "corn": FoodTranslation(de: "Mais", en: "Corn", es: "Maíz", it: "Mais"),
        "artichoke": FoodTranslation(de: "Artischocke", en: "Artichoke", es: "Alcachofa", it: "Carciofo"),
        "leek": FoodTranslation(de: "Lauch", en: "Leek", es: "Puerro", it: "Porro"),
        "fennel": FoodTranslation(de: "Fenchel", en: "Fennel", es: "Hinojo", it: "Finocchio"),
    ]

    // Case-insensitiver Abgleich: erst exakter Treffer, sonst Suche nach einem der bekannten
    // Begriffe als ganzes Wort innerhalb des Labels (z.B. "granny smith apple" -> "apple").
    // Gibt nil zurück, wenn das Label zu keinem bekannten Lebensmittel passt - solche
    // Kandidaten werden verworfen statt als Rohtext angezeigt.
    static func localizedFoodName(forGenericLabel rawLabel: String, lang: String) -> String? {
        let normalized = rawLabel.lowercased().trimmingCharacters(in: .whitespaces)
        if let t = genericVisionFoodTerms[normalized] {
            return t.value(for: lang)
        }
        for (key, t) in genericVisionFoodTerms {
            let pattern = "\\b\(NSRegularExpression.escapedPattern(for: key))\\b"
            if normalized.range(of: pattern, options: .regularExpression) != nil {
                return t.value(for: lang)
            }
        }
        return nil
    }
}

// MARK: - Fängt kaputte JSON.parse()-Aufrufe ab (z.B. beschädigte eingebettete Datenblöcke),
// damit ein einzelner fehlerhafter Block nicht die gesamte restliche Skriptausführung stoppt.
// Versucht zusätzlich, aus einem beschädigten/abgeschnittenen JSON-Text noch so viel wie
// möglich zu retten (z.B. Kategorie-Fotos), bevor auf den leeren Sicherheits-Fallback
// zurückgefallen wird.
extension LabPlateWebViewController {
    /// Demo-Video: Onboarding nie zeigen (Launch-Arg oder UserDefaults vor SpringBoard-Start).
    static var shouldSkipOnboardingForDemo: Bool {
        if ProcessInfo.processInfo.arguments.contains("-LabPlateDemoSkipOnboarding") { return true }
        if ProcessInfo.processInfo.environment["LABPLATE_DEMO_SKIP_ONBOARDING"] == "1" { return true }
        return UserDefaults.standard.bool(forKey: "LabPlateDemoSkipOnboarding")
    }

    /// Setzt Onboarding-Done, bevor maybeOpenOnboarding() (~450ms) laeuft.
    static let demoSkipOnboardingScript: String = """
    (function () {
      try { localStorage.setItem('labplate_onboarding_done_v1', '1'); } catch (e) {}
      try { sessionStorage.setItem('labplate_onboarding_defer_session', '1'); } catch (e2) {}
      try {
        var key = 'labplate_team_context_v1';
        var raw = localStorage.getItem(key);
        var ctx = raw ? JSON.parse(raw) : {};
        if (!ctx || typeof ctx !== 'object') ctx = {};
        if (!ctx.user || typeof ctx.user !== 'object') ctx.user = {};
        if (!ctx.user.onboarding || typeof ctx.user.onboarding !== 'object') ctx.user.onboarding = {};
        if (!ctx.user.onboarding.completedAt) {
          ctx.user.onboarding.completedAt = new Date().toISOString();
        }
        localStorage.setItem(key, JSON.stringify(ctx));
      } catch (e3) {}
    })();
    """

    /// Recording-only: Profi-Modus, leerer Teller (Ringe reagieren erst nach Hinzufügen).
    /// WICHTIG: Nie einen gefüllten Teller löschen (weder heute noch Vortag) — sonst sind
    /// echte Nutzerdaten weg, wenn LabPlateDemoSkipOnboarding in UserDefaults hängen bleibt.
    static let demoSeedDayScript: String = """
    (function () {
      try { localStorage.setItem('tellercheck_mode_v1', 'pro'); } catch (eMode) {}
      try {
        var dayKey = 'tellercheck_day_v1';
        function pad2(n) { return (n < 10 ? '0' : '') + n; }
        var now = new Date();
        var today = now.getFullYear() + '-' + pad2(now.getMonth() + 1) + '-' + pad2(now.getDate());
        var raw = null;
        try { raw = localStorage.getItem(dayKey); } catch (eGet) {}
        var shouldSeed = true;
        if (raw) {
          try {
            var saved = JSON.parse(raw);
            var items = saved && Array.isArray(saved.items) ? saved.items : [];
            if (items.length > 0) {
              shouldSeed = false;
            }
          } catch (eParse) {}
        }
        if (shouldSeed) {
          localStorage.setItem(dayKey, JSON.stringify({ date: today, items: [] }));
        }
      } catch (eDay) {}
      try { localStorage.removeItem('tellercheck_labs_v1'); } catch (eLabs) {}
    })();
    """

    /// Recording-only: steuert den 50s-Storyboard-Body per DOM (zuverlässiger als XCUITest in WKWebView).
    /// Absolute Timeline ab App-ready = Body 0:00–0:44. UITest wartet parallel und schreibt Marker.
    static let demoStoryboardAutopilotScript: String = #"""
    (function () {
      if (window.__lpDemoAutopilotStarted) return;
      window.__lpDemoAutopilotStarted = true;

      function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
      function click(el) { if (!el) return false; try { el.click(); return true; } catch (e) { return false; } }
      function q(sel) { return document.querySelector(sel); }
      function qa(sel) { return Array.prototype.slice.call(document.querySelectorAll(sel)); }
      function setInput(id, val) {
        var el = document.getElementById(id);
        if (!el) return;
        el.focus();
        el.value = String(val);
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
      }
      function waitFor(pred, timeoutMs) {
        var t0 = Date.now();
        return new Promise(function (resolve) {
          (function tick() {
            try { if (pred()) return resolve(true); } catch (e) {}
            if (Date.now() - t0 > timeoutMs) return resolve(false);
            setTimeout(tick, 120);
          })();
        });
      }
      function closeAll() {
        try { if (typeof closeOverlays === 'function') closeOverlays(); } catch (e) {}
        try {
          qa('.overlay.show .overlay-close, .overlay.show [aria-label="Schließen"], .overlay.show [aria-label="Zurück"]').forEach(function (b) { click(b); });
        } catch (e2) {}
      }
      function findFoodBtn(name) {
        var norm = function (s) {
          return (s || '').toLowerCase()
            .replace(/ä/g, 'a').replace(/ö/g, 'o').replace(/ü/g, 'u').replace(/ß/g, 'ss');
        };
        var target = norm(name);
        return qa('.food-btn, button.food-btn').find(function (b) {
          return norm(b.textContent).indexOf(target) !== -1;
        }) || null;
      }
      function findByText(sel, text) {
        return qa(sel).find(function (el) {
          return (el.textContent || '').replace(/\s+/g, ' ').trim().indexOf(text) !== -1;
        }) || null;
      }
      function writeMarker(name) {
        try {
          if (window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.demoMarker) {
            window.webkit.messageHandlers.demoMarker.postMessage(name);
          }
        } catch (e) {}
      }
      function showDemoToast(msg, holdMs) {
        var el = document.getElementById('lp-demo-story-toast');
        if (!el) {
          el = document.createElement('div');
          el.id = 'lp-demo-story-toast';
          el.style.cssText = 'position:fixed;left:50%;bottom:20%;transform:translateX(-50%);z-index:999999;background:rgba(22,22,28,0.94);color:#fff;padding:16px 26px;border-radius:18px;font-size:15px;font-weight:600;font-family:system-ui,-apple-system,sans-serif;opacity:0;transition:opacity 0.3s ease;pointer-events:none;box-shadow:0 8px 28px rgba(0,0,0,0.35);white-space:nowrap;';
          document.body.appendChild(el);
        }
        el.textContent = msg;
        requestAnimationFrame(function () { el.style.opacity = '1'; });
        setTimeout(function () { el.style.opacity = '0'; }, holdMs || 2600);
      }
      async function until(t0, targetSec) {
        var left = targetSec * 1000 - (Date.now() - t0);
        if (left > 0) await sleep(left);
      }

      async function run() {
        var ready = await waitFor(function () {
          return !!document.getElementById('settings-btn') && typeof openOverlay === 'function';
        }, 15000);
        if (!ready) return;
        var t0 = Date.now();
        window.__lpDemoT0 = t0;
        writeMarker('story-t0-ready');
        writeMarker('story-t0');

        // 0–4s: Tagesübersicht / Ringe
        await until(t0, 4.0);

        // 4–9s: Meine Werte (optional) → Tagesziele
        try {
          if (typeof openOverlay === 'function') openOverlay('settings');
          else click(document.getElementById('settings-btn'));
          await sleep(650);
          var labDetails = document.getElementById('lab-section-details');
          if (labDetails) {
            labDetails.open = true;
            var labSummary = labDetails.querySelector('.settings-accordion-summary');
            if (labSummary) {
              try { labSummary.scrollIntoView({ block: 'start', behavior: 'smooth' }); } catch (eScroll) {}
            }
          } else {
            click(findByText('summary, .section-label, button, span', 'Meine Werte'));
          }
          await sleep(600);
          setInput('lab-trig', 128);
          await sleep(160);
          setInput('lab-ldl', 138);
          await sleep(160);
          setInput('lab-glucose', 94);
          await sleep(320);
          if (typeof applyLabValues === 'function') applyLabValues();
          else click(document.getElementById('lab-apply') || findByText('button', 'Werte übernehmen'));
          await sleep(420);
          try {
            // Sanfte Zielanpassung ohne Warn-/Alarm-UI (Storyboard).
            LAB_WARNINGS = [];
            if (typeof TARGETS !== 'undefined') {
              TARGETS.kh = 108;
              if (typeof saveTargetsToStorage === 'function') saveTargetsToStorage();
              if (typeof saveLabsToStorage === 'function') saveLabsToStorage();
            }
            setInput('tg-kh', 108);
            var goals = document.getElementById('tagesziele-section-details');
            if (goals) {
              goals.open = true;
              try { goals.scrollIntoView({ block: 'center', behavior: 'smooth' }); } catch (e3) {}
            }
            if (typeof renderDay === 'function') renderDay();
            if (typeof renderSettingsOverlay === 'function') renderSettingsOverlay();
          } catch (eTargets) {}
          showDemoToast('Tagesziele individuell angepasst', 2800);
          await sleep(900);
          var goals2 = document.getElementById('tagesziele-section-details');
          if (goals2) {
            goals2.open = true;
            try { goals2.scrollIntoView({ block: 'center', behavior: 'smooth' }); } catch (e4) {}
            await sleep(700);
          }
        } catch (eLabs) {}
        await until(t0, 8.8);
        closeAll();
        await sleep(350);
        await until(t0, 9.0);

        // 9–13s: Lebensmittel erfassen
        try {
          if (typeof openCategoryOverlay === 'function') openCategoryOverlay('Obst');
          else click(findByText('button, .cat-chip', 'Obst'));
        } catch (eCat) {}
        await until(t0, 13.0);

        // 13–18s: Detail / Nährstoffe
        try {
          var foodBtn = findFoodBtn('Apfel') || findFoodBtn('Banane') || findFoodBtn('Birne') || qa('.food-btn')[0];
          if (foodBtn) click(foodBtn);
          else if (typeof openQuickAdd === 'function' && typeof FOODS !== 'undefined') {
            var apple = (FOODS || []).find(function (f) { return f && /apfel/i.test(f.name || ''); });
            if (apple) openQuickAdd(apple.id);
          }
        } catch (eFood) {}
        await until(t0, 18.0);

        // 18–24s: Hinzufügen → Ringe reagieren (0,5–0,8 s Ruhe)
        try {
          click(document.getElementById('qa-add-btn') || findByText('button.qa-add-btn', 'Zum Teller') || findByText('button', 'Zum Teller'));
          await sleep(680);
          closeAll();
        } catch (eAdd) {}
        await until(t0, 24.0);

        // 24–30s: KI-Rezept-Coach (Demo-Rezept ohne Netzwerk)
        try {
          if (typeof openNutriRecipeGenerator === 'function') openNutriRecipeGenerator();
          else click(document.getElementById('lp-tr-recipes') || q('.lp-recipe-trigger'));
          await sleep(900);
          if (window.__lpNutriDemo && typeof window.__lpNutriDemo.injectResult === 'function') {
            window.__lpNutriDemo.injectResult({
              title: 'Haferflocken mit Beeren',
              prep_time: '10 Min',
              servings: 2,
              ingredients: [
                { name: 'Haferflocken', amount: 50, unit: 'g', status: 'benoetigt', macrosPer100g: { netCarbs: 56, fat: 7, protein: 13, fiber: 10 } },
                { name: 'Beeren', amount: 100, unit: 'g', status: 'benoetigt', macrosPer100g: { netCarbs: 8, fat: 0.3, protein: 0.7, fiber: 2 } }
              ],
              steps: [
                'Haferflocken mit Wasser aufkochen.',
                'Beeren unterheben und servieren.'
              ],
              prepTimeLabel: 'Zubereitungszeit'
            });
          } else {
            click(q('.nutri-recipe-chat-card') || q('.nutri-recipe-hub-card'));
          }
        } catch (eKi) {}
        await until(t0, 29.4);
        closeAll();
        await until(t0, 30.0);

        // 30–35s: Routine
        try {
          if (typeof openRoutineOverlay === 'function') openRoutineOverlay();
          else {
            click(q('.meal-list-toggle') || findByText('button, a, div', 'Mein Teller heute'));
            await sleep(500);
            click(findByText('button, a, summary, span', 'Routine'));
          }
        } catch (eRou) {}
        await until(t0, 34.2);
        closeAll();
        await sleep(250);
        await until(t0, 34.6);

        // 35–41s: 14-Tage-Protokoll
        try {
          if (typeof openOverlay === 'function') openOverlay('protocol');
          else click(document.getElementById('protocol-btn'));
          await sleep(500);
          var startBtn = document.getElementById('pt-start-btn') || findByText('button', 'Protokoll starten');
          if (startBtn) click(startBtn);
        } catch (eProt) {}
        await until(t0, 40.5);
        closeAll();
        await until(t0, 41.0);

        // 41–44s: Rückkehr Hauptscreen
        closeAll();
        await until(t0, 44.0);
        window.__lpDemoAutopilotDone = true;
        writeMarker('story-done');
      }

      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function () { setTimeout(run, 250); });
      } else {
        setTimeout(run, 250);
      }
    })();
    """#

    static let jsonParseSafetyScript: String = """
    (function() {
      var nativeParse = JSON.parse;

      // Sucht die letzte Stelle im Text, an der ausserhalb eines String-Literals ein Komma
      // steht, merkt sich dabei die zu diesem Zeitpunkt offenen Klammern/Anführungsebenen
      // und schneidet den Text dort ab - die noch offenen Klammern werden korrekt geschlossen.
      // Dadurch lassen sich zumindest die VOR der Beschädigung vollständig vorhandenen Daten
      // retten (z.B. ein Teil der Kategorie-Fotos), statt alles zu verlieren.
      function tryRepairTruncatedJson(text) {
        try {
          var stack = [];
          var inString = false;
          var escaped = false;
          var safeCut = -1;
          var safeStack = null;

          for (var i = 0; i < text.length; i++) {
            var ch = text.charAt(i);
            if (inString) {
              if (escaped) { escaped = false; }
              else if (ch === '\\\\') { escaped = true; }
              else if (ch === '"') { inString = false; }
              continue;
            }
            if (ch === '"') { inString = true; continue; }
            if (ch === '{' || ch === '[') { stack.push(ch); continue; }
            if (ch === '}' || ch === ']') { stack.pop(); continue; }
            if (ch === ',') { safeCut = i; safeStack = stack.slice(); }
          }

          if (safeCut < 0 || !safeStack) return undefined;

          var closers = safeStack.slice().reverse().map(function(c) {
            return c === '{' ? '}' : ']';
          }).join('');
          var candidate = text.slice(0, safeCut) + closers;
          var repaired = nativeParse(candidate);
          if (repaired && typeof repaired === 'object') return repaired;
          return undefined;
        } catch (repairErr) {
          return undefined;
        }
      }

      JSON.parse = function(text, reviver) {
        try {
          return nativeParse(text, reviver);
        } catch (e) {
          var repaired = tryRepairTruncatedJson(String(text == null ? '' : text));
          try {
            if (window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.jsError) {
              var t = String(text == null ? '' : text);
              window.webkit.messageHandlers.jsError.postMessage(
                'JSON.parse abgefangen (' + (repaired ? 'teilweise repariert' : 'Fallback statt Absturz') + '): ' + e.message +
                ' | Anfang=' + JSON.stringify(t.slice(0, 60)) +
                ' | Ende=' + JSON.stringify(t.slice(-60))
              );
            }
          } catch (e2) {}

          if (repaired) return repaired;

          var trimmed = String(text == null ? '' : text).trim();
          if (trimmed.charAt(0) === '[') return [];
          // Generischer sicherer Fallback: JEDE unbekannte Eigenschaft (z.B. .thumbs, .banners,
          // .icons - welche auch immer der Seitencode als naechstes erwartet) liefert automatisch
          // ein leeres, sicher indizierbares Objekt zurueck statt undefined - dadurch stuerzen
          // Zugriffe wie CAT_PHOTOS.irgendwas[index] nicht mehr mit TypeError ab.
          var target = { thumbs: {}, banners: {}, classes: [] };
          return new Proxy(target, {
            get: function(obj, prop) {
              if (prop in obj) return obj[prop];
              if (typeof prop === 'symbol') return undefined;
              return {};
            }
          });
        }
      };
    })();
    """
}

// MARK: - Prüft nach dem Laden, wie viel vom eingebetteten Datenblock in der Seite tatsächlich ankam
extension LabPlateWebViewController {
    static let diagnosticScript: String = """
    (function() {
      try {
        var a = document.getElementById('food-data-all');
        var b = document.getElementById('cat-photos-data');
        var msg = 'DIAG food-data-all: exists=' + (!!a) + ' len=' + (a ? a.textContent.length : -1)
          + ' tail=' + (a ? JSON.stringify(a.textContent.slice(-40)) : 'n/a');
        msg += ' | cat-photos-data: exists=' + (!!b) + ' len=' + (b ? b.textContent.length : -1)
          + ' tail=' + (b ? JSON.stringify(b.textContent.slice(-40)) : 'n/a');
        msg += ' | documentHTMLlength=' + document.documentElement.outerHTML.length;
        msg += ' | hostname=' + location.hostname + ' protocol=' + location.protocol;
        if (window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.jsError) {
          window.webkit.messageHandlers.jsError.postMessage(msg);
        }
      } catch (e) {
        if (window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.jsError) {
          window.webkit.messageHandlers.jsError.postMessage('DIAG error: ' + e);
        }
      }
    })();
    """
}

// MARK: - Fängt ALLE JavaScript-Fehler der Seite ab und meldet sie an Swift/Xcode-Konsole
extension LabPlateWebViewController {
    static let errorCaptureScript: String = """
    (function() {
      function report(msg) {
        try {
          if (window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.jsError) {
            window.webkit.messageHandlers.jsError.postMessage(String(msg));
          }
        } catch (err) {}
      }
      window.addEventListener('error', function(e) {
        var err = e.error;
        var stack = (err && err.stack) ? (' | Stack: ' + err.stack) : '';
        report('Error: ' + (e.message || e) + ' @ ' + (e.filename || '?') + ':' + (e.lineno || '?') + ':' + (e.colno || '?') + stack);
      });
      window.addEventListener('unhandledrejection', function(e) {
        var reason = e.reason;
        var stack = (reason && reason.stack) ? (' | Stack: ' + reason.stack) : '';
        report('Unhandled Promise Rejection: ' + (reason && reason.message ? reason.message : String(reason)) + stack);
      });
    })();
    """
}

// MARK: - JS-Bridge (klinkt sich in die bestehende Foto-Erkennung der Web-App ein)
extension LabPlateWebViewController {
    static let bridgeScript: String = """
    (function() {
      if (window.__labplateNativeBridgeInstalled) return;
      window.__labplateNativeBridgeInstalled = true;

      // JS -> Swift: effektiver Theme-Zustand ("dark"/"light") fuer applyNativeTheme(isDark:).
      // Die native Seite faerbt damit die Flaeche hinter Statusleiste/Dynamic Island, die
      // ausserhalb der WKWebView liegt (webView beginnt erst an safeAreaLayoutGuide.topAnchor).
      // Ohne diese Meldung blieb applyNativeTheme(isDark:) auf seinem Startwert "false" stehen:
      // im App-Dark-Mode ein weisser Balken ueber der dunklen Seite (Statusleisten-Bereich).
      // Spiegelt exakt die CSS-Regeln der Seite: html[data-theme="dark"] bzw., wenn kein
      // data-theme gesetzt ist ("system"), die prefers-color-scheme-Medienabfrage.
      // Meldet "dark:explicit" / "light:explicit" / "dark:system" / "light:system".
      //
      // Der Zusatz nach dem Doppelpunkt ist entscheidend fuer die TASTATUR: iOS leitet deren
      // Farbe aus dem UIUserInterfaceStyle der WebView ab, nicht zuverlaessig aus der
      // CSS-Eigenschaft color-scheme. Nativ nachziehen darf man diesen Stil aber NUR bei einer
      // ausdruecklichen Wahl - bei "System" wuerde die Seite den selbst gesetzten Stil als
      // prefers-color-scheme zurueckerhalten und damit ihre eigene Vorgabe im Kreis lesen.
      function lpEffectiveTheme() {
        var attr = document.documentElement.getAttribute('data-theme');
        if (attr === 'dark') return 'dark:explicit';
        if (attr === 'light') return 'light:explicit';
        return (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') + ':system';
      }

      var lpLastTheme = null;
      function lpReportTheme() {
        var theme = lpEffectiveTheme();
        if (theme === lpLastTheme) return;
        lpLastTheme = theme;
        if (window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.themeState) {
          window.webkit.messageHandlers.themeState.postMessage(theme);
        }
      }

      // window.print() ist in einer WKWebView auf iOS wirkungslos - der Aufruf tut schlicht
      // nichts, ohne Fehler. Beide Druckwege der Seite (PDF-Export des 14-Tage-Protokolls und
      // der Druck-Knopf im Naehrstoff-Report) rufen genau diese Funktion auf. Sie wird deshalb
      // hier auf die native Bruecke umgebogen, die das iOS-Druckblatt oeffnet - dort fuehrt
      // "In Dateien sichern" zur PDF-Datei. Im normalen Browser (kein window.webkit) bleibt
      // window.print() unangetastet, dort funktioniert es ohnehin.
      if (window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.printRequest) {
        window.print = function () {
          try {
            window.webkit.messageHandlers.printRequest.postMessage('print');
          } catch (e) { /* Bruecke nicht verfuegbar - dann passiert wie bisher nichts */ }
        };
      }

      lpReportTheme();
      // Umschalten in den App-Einstellungen aendert nur das data-theme-Attribut am <html> -
      // der Observer meldet jede solche Aenderung sofort nach nativ weiter.
      new MutationObserver(lpReportTheme).observe(document.documentElement, {
        attributes: true,
        attributeFilter: ['data-theme']
      });
      window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', lpReportTheme);

      function b64FromDataURL(dataUrl) {
        var idx = dataUrl.indexOf(',');
        return idx >= 0 ? dataUrl.substring(idx + 1) : dataUrl;
      }

      // Öffnen der Foto-Erkennung: übernimmt die native Variante, überspringt den alten
      // ONNX-Ladepfad (der die irreführende "KI-Modell nicht geladen"-Meldung zeigt),
      // da CoreML bereits nativ geladen ist.
      document.addEventListener('click', function(e) {
        var openBtn = e.target && e.target.closest ? e.target.closest('#food-ai-btn') : null;
        if (!openBtn) return;

        e.stopPropagation();
        e.preventDefault();

        if (typeof resetFoodAiResult === 'function') resetFoodAiResult();
        if (typeof foodAiImage !== 'undefined') foodAiImage = null;

        var preview = document.getElementById('food-ai-preview');
        if (preview) { preview.src = ''; preview.classList.remove('show'); }
        var analyzeBtn = document.getElementById('food-ai-analyze-btn');
        if (analyzeBtn) analyzeBtn.disabled = true;

        document.getElementById('food-ai-overlay')?.classList.add('show');
        document.getElementById('food-ai-overlay')?.setAttribute('aria-hidden', 'false');
        document.body.style.overflow = 'hidden';

        if (typeof setFoodAiStatus === 'function') setFoodAiStatus('', false);
      }, true);

      // Capture-Phase auf document: läuft VOR dem originalen Klick-Handler des Buttons
      // und übernimmt die Erkennung nativ statt über onnxruntime-web.
      document.addEventListener('click', function(e) {
        var btn = e.target && e.target.closest ? e.target.closest('#food-ai-analyze-btn') : null;
        if (!btn) return;

        e.stopPropagation();
        e.preventDefault();

        if (typeof resetFoodAiResult === 'function') resetFoodAiResult();

        if (typeof foodAiImage === 'undefined' || !foodAiImage) {
          if (typeof setFoodAiStatus === 'function' && typeof L !== 'undefined') {
            setFoodAiStatus(L.foodAiNoPhoto, true);
          }
          return;
        }

        var preview = document.getElementById('food-ai-preview');
        if (!preview || !preview.src) {
          if (typeof setFoodAiStatus === 'function' && typeof L !== 'undefined') {
            setFoodAiStatus(L.foodAiNoPhoto, true);
          }
          return;
        }

        btn.disabled = true;
        if (typeof setFoodAiStatus === 'function' && typeof L !== 'undefined') {
          setFoodAiStatus(L.foodAiAnalyzing, false);
        }

        var base64 = b64FromDataURL(preview.src);
        // Aktuelle App-Sprache mitschicken, damit die native Erkennung den Namen gleich
        // in der richtigen Sprache (de/en/es/it) zurückliefert.
        var lang = (typeof currentLang !== 'undefined' && currentLang) ? currentLang : 'de';
        if (window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.photoRecognition) {
          window.webkit.messageHandlers.photoRecognition.postMessage({ image: base64, lang: lang });
        }
      }, true);

      // Kandidaten unterhalb dieser Konfidenz (in %) werden komplett ignoriert - reine
      // Rauschwerte, bei denen selbst ein Treffer im Lebensmittel-Suchindex Zufall wäre.
      var MIN_SHOW_PCT = 12;

      window.onRecognitionResult = function(res) {
        var analyzeBtn = document.getElementById('food-ai-analyze-btn');
        var result = document.getElementById('food-ai-result');
        var addBtn = document.getElementById('food-ai-add-btn');
        if (analyzeBtn) analyzeBtn.disabled = false;

        if (!res || res.error || !res.candidates || !res.candidates.length) {
          if (result) {
            result.className = 'food-ai-result show error';
            result.textContent = (typeof L !== 'undefined') ? L.foodAiModelError : 'Fehler bei der Erkennung';
          }
          if (typeof setFoodAiStatus === 'function') {
            setFoodAiStatus(res && res.error ? String(res.error) : '', true);
          }
          return;
        }

        // Die Kandidaten sind bereits nach Konfidenz sortiert (Platz 1 zuerst). Wir nehmen
        // den ERSTEN Kandidaten, der sich einem echten Lebensmittel in der App zuordnen lässt
        // - das ist meist zuverlässiger, als stur nur auf Platz 1 zu bestehen, weil das
        // Erkennungsmodell auf Studiofotos trainiert wurde und bei normalen Fotos öfter erst
        // Platz 2 oder 3 stimmt. Der Anzeigename kommt bereits aus Swift in der aktuellen
        // App-Sprache (labelLocalized).
        var best = null;
        for (var i = 0; i < res.candidates.length; i++) {
          var c = res.candidates[i];
          if (c.confidence < MIN_SHOW_PCT) continue;
          var displayName = c.labelLocalized || c.label;
          var foodId = (typeof resolveFoodIdFromAi === 'function') ? resolveFoodIdFromAi(displayName, c.label, false) : null;
          if (foodId != null) {
            best = { displayName: displayName, foodId: foodId, pct: c.confidence };
            break;
          }
          if (!best) {
            best = { displayName: displayName, foodId: null, pct: c.confidence };
          }
        }

        if (!best) {
          if (result) {
            result.className = 'food-ai-result show error';
            result.textContent = (typeof L !== 'undefined') ? L.foodAiUnknown : 'Lebensmittel nicht erkannt';
          }
          if (typeof setFoodAiStatus === 'function') setFoodAiStatus('', false);
          return;
        }

        if (typeof foodAiDetectedFoodId !== 'undefined') foodAiDetectedFoodId = best.foodId;
        if (typeof foodAiLastLabel !== 'undefined') foodAiLastLabel = best.displayName;

        if (best.foodId != null) {
          if (result) {
            result.className = 'food-ai-result show success';
            result.textContent = (typeof L !== 'undefined') ? L.foodAiSuccess(best.displayName, best.pct) : (best.displayName + ' (' + best.pct + '%)');
          }
          if (addBtn) addBtn.classList.add('show');
        } else {
          if (result) {
            result.className = 'food-ai-result show warn';
            result.textContent = (typeof L !== 'undefined') ? L.foodAiManual(best.displayName + ' (' + best.pct + ' %)') : best.displayName;
          }
          if (addBtn) {
            if (typeof L !== 'undefined') addBtn.textContent = L.foodAiSearchBtn;
            addBtn.classList.add('show');
          }
        }
        if (typeof setFoodAiStatus === 'function') setFoodAiStatus('', false);
      };
    })();
    """
}

// RecipeDocumentScanCoordinator und RecipeTextReviewViewController
// sind in RecipeTextScanner.swift definiert.
