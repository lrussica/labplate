// RecipeTextScanner.swift
// LabPlate
//
// Ablauf:
//   1. RecipeDocumentScanCoordinator leitet VNDocumentCameraViewController-Delegate-Callbacks
//      als Closure weiter → kein DataScannerViewController mehr.
//   2. RecipeTextReviewViewController (iOS 16+):
//      - Zeigt das aufgenommene Standbild.
//      - Aktiviert ImageAnalysisInteraction für echte Apple-Live-Text-Auswahl.
//      - Nutzerin markiert Text mit dem Finger → „Auswahl übernehmen".
//      - Nur der manuell markierte Text wird über onTextAccepted zurückgegeben.

import UIKit
import VisionKit

// MARK: - RecipeDocumentScanCoordinator

/// VNDocumentCameraViewController-Delegate-Implementierung als Coordinator-Objekt.
/// Wird von LabPlateWebViewController als Property gehalten, damit er nicht
/// vorzeitig freigegeben wird.
final class RecipeDocumentScanCoordinator: NSObject, VNDocumentCameraViewControllerDelegate {

    private let onImageCaptured: (UIImage) -> Void

    init(onImageCaptured: @escaping (UIImage) -> Void) {
        self.onImageCaptured = onImageCaptured
    }

    func documentCameraViewController(_ controller: VNDocumentCameraViewController,
                                       didFinishWith scan: VNDocumentCameraScan) {
        guard scan.pageCount > 0 else {
            controller.dismiss(animated: true)
            return
        }
        // Erste Seite (bei Dokument-Scan schon perspektivisch korrigiert)
        let image = scan.imageOfPage(at: 0)
        controller.dismiss(animated: true) { [weak self] in
            self?.onImageCaptured(image)
        }
    }

    func documentCameraViewControllerDidCancel(_ controller: VNDocumentCameraViewController) {
        controller.dismiss(animated: true)
    }

    func documentCameraViewController(_ controller: VNDocumentCameraViewController,
                                       didFailWithError error: Error) {
        print("⚠️ [RecipeScanner] Dokument-Scan Fehler: \(error.localizedDescription)")
        controller.dismiss(animated: true)
    }
}

// MARK: - RecipeTextReviewViewController (iOS 16+)

/// Zeigt ein aufgenommenes Standbild mit Apple-Live-Text-Auswahl
/// (VisionKit ImageAnalyzer + ImageAnalysisInteraction).
/// Die Nutzerin markiert den gewünschten Rezepttext mit dem Finger;
/// nur dieser wird beim Tippen auf „Auswahl übernehmen" weitergegeben.
@available(iOS 16.0, *)
final class RecipeTextReviewViewController: UIViewController {

    // MARK: - Callbacks
    private let onTextAccepted: (String) -> Void
    private let onRetake: () -> Void

    // MARK: - Daten
    private let capturedImage: UIImage
    private let analyzer = ImageAnalyzer()
    private var imageAnalysisInteraction: ImageAnalysisInteraction?

    // MARK: - UI
    private let imageView         = UIImageView()
    private let bottomPanel       = UIView()
    private let hintLabel         = UILabel()
    private let acceptButton      = UIButton(type: .system)
    private let retakeButton      = UIButton(type: .system)
    private let cancelButton      = UIButton(type: .system)
    private let activityIndicator = UIActivityIndicatorView(style: .large)

    // MARK: - Init

    init(image: UIImage,
         onTextAccepted: @escaping (String) -> Void,
         onRetake: @escaping () -> Void) {
        self.capturedImage = image
        self.onTextAccepted = onTextAccepted
        self.onRetake = onRetake
        super.init(nibName: nil, bundle: nil)
        modalPresentationStyle = .fullScreen
    }

    required init?(coder: NSCoder) { fatalError("use init(image:onTextAccepted:onRetake:)") }

    // MARK: - Lifecycle

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .black
        setupImageView()
        setupBottomPanel()
        startImageAnalysis()
    }

    // MARK: - Layout

    private func setupImageView() {
        imageView.image = capturedImage
        imageView.contentMode = .scaleAspectFit
        imageView.isUserInteractionEnabled = true
        imageView.backgroundColor = .black
        imageView.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(imageView)

        activityIndicator.color = .white
        activityIndicator.hidesWhenStopped = true
        activityIndicator.startAnimating()
        activityIndicator.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(activityIndicator)
        NSLayoutConstraint.activate([
            activityIndicator.centerXAnchor.constraint(equalTo: view.centerXAnchor),
            activityIndicator.centerYAnchor.constraint(equalTo: view.centerYAnchor)
        ])
    }

    private func setupBottomPanel() {
        // Panel-Hintergrund
        bottomPanel.backgroundColor = UIColor(red: 0.04, green: 0.04, blue: 0.07, alpha: 0.93)
        bottomPanel.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(bottomPanel)

        // Hinweis-Label
        hintLabel.text = "Markiere den Rezepttext mit dem Finger,\ndann tippe auf 'Auswahl übernehmen'."
        hintLabel.textColor = UIColor.white.withAlphaComponent(0.80)
        hintLabel.font = .systemFont(ofSize: 13, weight: .regular)
        hintLabel.textAlignment = .center
        hintLabel.numberOfLines = 2
        hintLabel.translatesAutoresizingMaskIntoConstraints = false
        bottomPanel.addSubview(hintLabel)

        // „Auswahl übernehmen"
        configureBtn(acceptButton,
                     title: "Auswahl übernehmen",
                     titleColor: .white,
                     bg: UIColor(red: 0.18, green: 0.69, blue: 0.36, alpha: 1.0),
                     font: .systemFont(ofSize: 16, weight: .bold),
                     radius: 14,
                     action: #selector(acceptTapped))

        // „Neu fotografieren"
        configureBtn(retakeButton,
                     title: "Neu fotografieren",
                     titleColor: UIColor.white.withAlphaComponent(0.85),
                     bg: .clear,
                     font: .systemFont(ofSize: 15, weight: .medium),
                     radius: 0,
                     action: #selector(retakeTapped))

        // „Abbrechen"
        configureBtn(cancelButton,
                     title: "Abbrechen",
                     titleColor: UIColor.white.withAlphaComponent(0.55),
                     bg: .clear,
                     font: .systemFont(ofSize: 14, weight: .regular),
                     radius: 0,
                     action: #selector(cancelTapped))

        [hintLabel, acceptButton, retakeButton, cancelButton].forEach {
            bottomPanel.addSubview($0)
        }

        let safe = view.safeAreaLayoutGuide
        NSLayoutConstraint.activate([
            // Bild füllt Bereich über dem Panel
            imageView.topAnchor.constraint(equalTo: safe.topAnchor),
            imageView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            imageView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            imageView.bottomAnchor.constraint(equalTo: bottomPanel.topAnchor),

            // Panel am unteren Rand
            bottomPanel.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            bottomPanel.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            bottomPanel.bottomAnchor.constraint(equalTo: view.bottomAnchor),

            // Hint
            hintLabel.topAnchor.constraint(equalTo: bottomPanel.topAnchor, constant: 14),
            hintLabel.leadingAnchor.constraint(equalTo: bottomPanel.leadingAnchor, constant: 20),
            hintLabel.trailingAnchor.constraint(equalTo: bottomPanel.trailingAnchor, constant: -20),

            // Hauptbutton
            acceptButton.topAnchor.constraint(equalTo: hintLabel.bottomAnchor, constant: 12),
            acceptButton.leadingAnchor.constraint(equalTo: bottomPanel.leadingAnchor, constant: 20),
            acceptButton.trailingAnchor.constraint(equalTo: bottomPanel.trailingAnchor, constant: -20),
            acceptButton.heightAnchor.constraint(equalToConstant: 52),

            // Neu-fotografieren
            retakeButton.topAnchor.constraint(equalTo: acceptButton.bottomAnchor, constant: 6),
            retakeButton.centerXAnchor.constraint(equalTo: bottomPanel.centerXAnchor),
            retakeButton.heightAnchor.constraint(equalToConstant: 44),

            // Abbrechen
            cancelButton.topAnchor.constraint(equalTo: retakeButton.bottomAnchor, constant: 2),
            cancelButton.centerXAnchor.constraint(equalTo: bottomPanel.centerXAnchor),
            cancelButton.heightAnchor.constraint(equalToConstant: 40),
            cancelButton.bottomAnchor.constraint(equalTo: safe.bottomAnchor, constant: -8)
        ])
    }

    private func configureBtn(_ btn: UIButton, title: String, titleColor: UIColor,
                               bg: UIColor, font: UIFont, radius: CGFloat, action: Selector) {
        btn.setTitle(title, for: .normal)
        btn.setTitleColor(titleColor, for: .normal)
        btn.backgroundColor = bg
        btn.titleLabel?.font = font
        btn.layer.cornerRadius = radius
        btn.layer.masksToBounds = true
        btn.translatesAutoresizingMaskIntoConstraints = false
        btn.addTarget(self, action: action, for: .touchUpInside)
    }

    // MARK: - Image Analysis

    private func startImageAnalysis() {
        // ImageAnalysisInteraction ermöglicht Apple-Live-Text-Auswahl auf dem Standbild
        let interaction = ImageAnalysisInteraction()
        interaction.preferredInteractionTypes = .textSelection
        imageView.addInteraction(interaction)
        self.imageAnalysisInteraction = interaction

        let image = capturedImage
        Task { [weak self] in
            guard let self else { return }
            do {
                let config = ImageAnalyzer.Configuration([.text])
                let analysis = try await self.analyzer.analyze(image, configuration: config)
                await MainActor.run { [weak self] in
                    self?.imageAnalysisInteraction?.analysis = analysis
                    self?.activityIndicator.stopAnimating()
                }
            } catch {
                print("⚠️ [RecipeScanner] ImageAnalyzer Fehler: \(error.localizedDescription)")
                await MainActor.run { [weak self] in
                    self?.activityIndicator.stopAnimating()
                }
            }
        }
    }

    // MARK: - Actions

    @objc private func acceptTapped() {
        guard let interaction = imageAnalysisInteraction else { return }

        // Prüfen, ob die Nutzerin Text markiert hat
        guard interaction.hasActiveTextSelection else {
            showHint("Bitte markiere zuerst den Rezepttext, den du übernehmen möchtest.\n(Finger lange auf Text halten, dann Auswahl ziehen)")
            return
        }

        // iOS-Clipboard-Inhalt vor Kopier-Versuch merken
        let prevContent = UIPasteboard.general.string

        // System-Copy-Action auslösen; ImageAnalysisInteraction leitet die Aktion
        // intern weiter und legt den markierten Text in das Clipboard.
        // Hinweis: Selector("copy:") wird verwendet, da #selector(UIResponder.copy(_:))
        // in manchen Build-Konfigurationen Probleme bereitet.
        UIApplication.shared.sendAction(Selector("copy:"), to: nil, from: nil, for: nil)

        DispatchQueue.main.asyncAfter(deadline: .now() + 0.25) { [weak self] in
            guard let self = self else { return }
            let copied = UIPasteboard.general.string

            if let text = copied, !text.isEmpty {
                // Clipboard-Inhalt nach kurzer Pause auf alten Stand zurücksetzen
                let prev = prevContent
                DispatchQueue.main.asyncAfter(deadline: .now() + 1.2) {
                    UIPasteboard.general.string = prev
                }
                self.finishWithText(text)
            } else {
                // Fallback: sendAction hat nicht gegriffen -> Nutzerin anleiten
                self.showHint(
                    "Tippe auf den markierten Text, wähle im iOS-Menü 'Kopieren' " +
                    "und tippe dann erneut auf 'Auswahl übernehmen'."
                )
            }
        }
    }

    @objc private func retakeTapped() {
        dismiss(animated: true) { [weak self] in
            self?.onRetake()
        }
    }

    @objc private func cancelTapped() {
        dismiss(animated: true)
    }

    // MARK: - Helpers

    private func finishWithText(_ text: String) {
        dismiss(animated: true) { [weak self] in
            self?.onTextAccepted(text)
        }
    }

    private func showHint(_ message: String) {
        let alert = UIAlertController(title: nil, message: message, preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: "OK", style: .default))
        present(alert, animated: true)
    }
}
