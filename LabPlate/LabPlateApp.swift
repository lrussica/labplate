import SwiftUI

@main
struct LabPlateApp: App {
    var body: some Scene {
        WindowGroup {
            ViewControllerWrapper()
                .ignoresSafeArea()
                .background(LabPlateStatusBarHost().ignoresSafeArea())
        }
    }
}

struct ViewControllerWrapper: UIViewControllerRepresentable {
    func makeUIViewController(context: Context) -> LabPlateWebViewController {
        return LabPlateWebViewController()
    }

    func updateUIViewController(_ uiViewController: LabPlateWebViewController, context: Context) {}
}

// MARK: - Root-Statusleisten-Host
//
// LabPlateWebViewController (ViewController.swift) haengt nur als eingebettetes Kind unter dem von
// "WindowGroup" intern erzeugten UIHostingController - dessen preferredStatusBarStyle wird von iOS
// tatsaechlich abgefragt, nicht zuverlaessig das des eingebetteten Kinds (siehe realer iPhone-Test:
// Statusleistenflaeche blieb trotz korrektem LabPlateWebViewController.preferredStatusBarStyle weiss).
// Dieser kleine, unsichtbare Host wird zusaetzlich als .background() eingehaengt (gleiche
// UIViewControllerRepresentable-Bruecke wie ViewControllerWrapper oben) und uebernimmt ausschliesslich
// Statusleisten-Stil und die Flaeche dahinter. Einzige Zustandsquelle bleibt die bestehende
// themeState-Bridge - LabPlateWebViewController.applyNativeTheme(isDark:) reicht den bereits
// vorhandenen Zustand hier nur minimal durch (siehe LabPlateStatusBarState.update(isDark:)).
final class LabPlateStatusBarState {
    static let shared = LabPlateStatusBarState()
    private init() {}
    private(set) var isDark = false
    fileprivate weak var host: LabPlateStatusBarHostController?

    func update(isDark: Bool) {
        self.isDark = isDark
        host?.applyState(isDark: isDark)
    }
}

final class LabPlateStatusBarHostController: UIViewController {
    private var isDark = false

    override func viewDidLoad() {
        super.viewDidLoad()
        view.isUserInteractionEnabled = false
        LabPlateStatusBarState.shared.host = self
        applyState(isDark: LabPlateStatusBarState.shared.isDark)
    }

    override var preferredStatusBarStyle: UIStatusBarStyle {
        isDark ? .lightContent : .darkContent
    }

    func applyState(isDark: Bool) {
        self.isDark = isDark
        view.backgroundColor = isDark
            ? UIColor(red: 15.0 / 255.0, green: 16.0 / 255.0, blue: 18.0 / 255.0, alpha: 1.0)
            : UIColor(red: 245.0 / 255.0, green: 249.0 / 255.0, blue: 247.0 / 255.0, alpha: 1.0)
        setNeedsStatusBarAppearanceUpdate()
    }
}

struct LabPlateStatusBarHost: UIViewControllerRepresentable {
    func makeUIViewController(context: Context) -> LabPlateStatusBarHostController {
        LabPlateStatusBarHostController()
    }

    func updateUIViewController(_ uiViewController: LabPlateStatusBarHostController, context: Context) {}
}

