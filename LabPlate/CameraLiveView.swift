import SwiftUI
import AVFoundation
import Combine
import CoreML
import Vision

// MARK: - labplate_class_mapping.json (Index -> Rohname fuer das labplate_dinov2_fruits-Modell)
private struct LiveFoodAIClassMappingEntry: Decodable {
    let i: Int
    let n: String
}
private struct LiveFoodAIClassMappingFile: Decodable {
    let classes: [LiveFoodAIClassMappingEntry]
}

// MARK: - Verwaltet AVCaptureSession, Berechtigung, Start/Stop und die Live-Objekterkennung
final class CameraManager: NSObject, ObservableObject {
    let session = AVCaptureSession()
    private let sessionQueue = DispatchQueue(label: "camera.session.queue")
    private let videoOutputQueue = DispatchQueue(label: "camera.videoOutput.queue")
    private let videoOutput = AVCaptureVideoDataOutput()

    @Published var accessDenied = false
    @Published var detectedLabel: String?
    @Published var detectedConfidence: Int?

    // Dasselbe projekteigene DINOv2-Modell, das ViewController.swift jetzt fuer die
    // Foto-Erkennung nutzt - enthaelt u.a. "Tomato ..." und "Pepper ..."-Klassen.
    private var visionModel: VNCoreMLModel?
    // Index -> Rohname aus labplate_class_mapping.json (siehe ViewController.swift fuer
    // den ausfuehrlichen Grund: das Modell liefert rohe Logits, keine fertigen Klassennamen).
    private var classNames: [String] = []
    private var lastClassifyTime = Date.distantPast
    // Begrenzung auf ca. 3 Erkennungen/Sekunde statt jedes einzelnen Kamera-Frames -
    // reicht fuer eine fluessig wirkende Live-Anzeige, haelt die CPU-Last aber niedrig.
    private let classifyInterval: TimeInterval = 0.35
    // Kandidaten unterhalb dieser Konfidenz (in %) werden ignoriert - reine Rauschwerte.
    private let minConfidencePercent = 15

    override init() {
        super.init()
        loadModel()
    }

    private func loadModel() {
        do {
            let config = MLModelConfiguration()
            config.computeUnits = .all // Neural Engine + GPU + CPU automatisch optimal nutzen
            let coreMLModel = try labplate_dinov2_fruits(configuration: config).model
            visionModel = try VNCoreMLModel(for: coreMLModel)
        } catch {
            print("❌ CoreML-Modell (Live-Erkennung) konnte nicht geladen werden: \(error)")
        }
        loadClassNames()
    }

    private func loadClassNames() {
        guard let url = Bundle.main.url(forResource: "labplate_class_mapping", withExtension: "json"),
              let data = try? Data(contentsOf: url),
              let parsed = try? JSONDecoder().decode(LiveFoodAIClassMappingFile.self, from: data) else {
            print("❌ labplate_class_mapping.json (Live-Erkennung) konnte nicht geladen werden")
            return
        }
        var names = [String](repeating: "", count: parsed.classes.count)
        for entry in parsed.classes where entry.i >= 0 && entry.i < names.count {
            names[entry.i] = entry.n
        }
        classNames = names
    }

    func start() {
        sessionQueue.async {
            switch AVCaptureDevice.authorizationStatus(for: .video) {
            case .authorized:
                self.configureAndRun()
            case .notDetermined:
                AVCaptureDevice.requestAccess(for: .video) { granted in
                    if granted {
                        self.sessionQueue.async { self.configureAndRun() }
                    } else {
                        DispatchQueue.main.async { self.accessDenied = true }
                    }
                }
            default:
                DispatchQueue.main.async { self.accessDenied = true }
            }
        }
    }

    func stop() {
        sessionQueue.async {
            if self.session.isRunning { self.session.stopRunning() }
        }
    }

    private func configureAndRun() {
        guard session.inputs.isEmpty else {
            if !session.isRunning { session.startRunning() }
            return
        }
        session.beginConfiguration()
        session.sessionPreset = .photo

        if let device = AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: .back),
           let input = try? AVCaptureDeviceInput(device: device),
           session.canAddInput(input) {
            session.addInput(input)
        }

        // Liefert jeden Kamera-Frame an captureOutput(_:didOutput:from:) weiter, wo er
        // (gedrosselt) an die CoreML/Vision-Erkennung geht.
        videoOutput.setSampleBufferDelegate(self, queue: videoOutputQueue)
        videoOutput.alwaysDiscardsLateVideoFrames = true
        if session.canAddOutput(videoOutput) {
            session.addOutput(videoOutput)
        }

        session.commitConfiguration()
        session.startRunning()
    }
}

extension CameraManager: AVCaptureVideoDataOutputSampleBufferDelegate {
    func captureOutput(_ output: AVCaptureOutput, didOutput sampleBuffer: CMSampleBuffer, from connection: AVCaptureConnection) {
        guard let visionModel = visionModel else { return }
        let now = Date()
        guard now.timeIntervalSince(lastClassifyTime) >= classifyInterval else { return }
        lastClassifyTime = now

        guard let pixelBuffer = CMSampleBufferGetImageBuffer(sampleBuffer) else { return }

        let request = VNCoreMLRequest(model: visionModel) { [weak self] request, error in
            // labplate_dinov2_fruits ist kein CoreML-"Classifier"-Modell - das Ergebnis ist
            // deshalb VNCoreMLFeatureValueObservation (rohes MLMultiArray), nicht
            // VNClassificationObservation wie beim alten Modell.
            guard let self, error == nil,
                  let results = request.results as? [VNCoreMLFeatureValueObservation],
                  let multiArray = results.first?.featureValue.multiArrayValue else { return }

            // Wie in der Foto-Erkennung: Rohlabel (z.B. "Tomato 12") in einen deutschen
            // Anzeigenamen uebersetzen und nur Tomate/Paprika-Treffer behalten - alle anderen
            // Klassen (Apfel, Banane, ...) werden fuer diese Live-Ansicht ignoriert.
            // Kandidaten sind bereits nach Konfidenz sortiert, daher liefert der erste Treffer
            // automatisch den staerksten Tomate/Paprika-Kandidaten.
            let match = LabPlateWebViewController.topFoodAICandidates(from: multiArray, classNames: self.classNames, top: 5)
                .compactMap { candidate -> (String, Int)? in
                    let name = LabPlateWebViewController.localizedFoodName(forRawLabel: candidate.label, lang: "de")
                    return (name, candidate.confidencePercent)
                }
                .first { name, confidence in
                    confidence >= self.minConfidencePercent && (name.hasPrefix("Tomate") || name.hasPrefix("Paprika"))
                }

            DispatchQueue.main.async {
                self.detectedLabel = match?.0
                self.detectedConfidence = match?.1
            }
        }
        request.imageCropAndScaleOption = .scaleFit

        // .right: Standard-Ausrichtung fuer die rueckseitige Kamera bei einer im Hochformat
        // fixierten UI (siehe UIInterfaceOrientationPortrait in Info.plist) - der rohe
        // Pixel-Buffer der Rueckkamera liegt sonst um 90 Grad gedreht vor.
        let handler = VNImageRequestHandler(cvPixelBuffer: pixelBuffer, orientation: .right, options: [:])
        try? handler.perform([request])
    }
}

// MARK: - UIKit-Bruecke: eine UIView, deren Layer eine Live-Kamera-Vorschau ist
final class CameraPreviewUIView: UIView {
    override class var layerClass: AnyClass { AVCaptureVideoPreviewLayer.self }
    var previewLayer: AVCaptureVideoPreviewLayer { layer as! AVCaptureVideoPreviewLayer }
}

struct CameraPreview: UIViewRepresentable {
    let session: AVCaptureSession

    func makeUIView(context: Context) -> CameraPreviewUIView {
        let view = CameraPreviewUIView()
        view.previewLayer.session = session
        view.previewLayer.videoGravity = .resizeAspectFill
        return view
    }

    func updateUIView(_ uiView: CameraPreviewUIView, context: Context) {}
}

// MARK: - Die eigentliche SwiftUI-Ansicht
struct CameraLiveView: View {
    @StateObject private var camera = CameraManager()

    var body: some View {
        ZStack {
            CameraPreview(session: camera.session)
                .ignoresSafeArea()

            if let label = camera.detectedLabel {
                VStack {
                    Spacer()
                    Text(camera.detectedConfidence.map { "\(label) (\($0)%)" } ?? label)
                        .font(.title2.bold())
                        .foregroundStyle(.white)
                        .padding(.horizontal, 20)
                        .padding(.vertical, 10)
                        .background(.green.opacity(0.85))
                        .clipShape(Capsule())
                        .padding(.bottom, 48)
                }
            }

            if camera.accessDenied {
                VStack(spacing: 12) {
                    Text("Kein Kamerazugriff")
                        .font(.headline)
                    Text("Bitte in den iPhone-Einstellungen unter LabPlate den Kamerazugriff erlauben.")
                        .font(.subheadline)
                        .multilineTextAlignment(.center)
                        .padding(.horizontal, 24)
                }
                .foregroundStyle(.white)
                .padding()
                .background(.black.opacity(0.6))
                .cornerRadius(16)
            }
        }
        .onAppear { camera.start() }
        .onDisappear { camera.stop() }
    }
}

#Preview {
    CameraLiveView()
}
