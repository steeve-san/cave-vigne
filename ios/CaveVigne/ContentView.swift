// ContentView.swift — Main UI: WebView + pull-to-refresh + error page
import SwiftUI

private let APP_URL = URL(string: "https://cavevigne.fr")!

struct ContentView: View {
    @State private var isLoading = true
    @State private var error: String? = nil
    @State private var refreshID = UUID()

    var body: some View {
        ZStack {
            Color(red: 0.10, green: 0.06, blue: 0.06).ignoresSafeArea()

            if let err = error {
                ErrorView(message: err) {
                    error = nil
                    refreshID = UUID()
                }
            } else {
                RefreshableWebView(url: APP_URL, isLoading: $isLoading, error: $error)
                    .id(refreshID)
                    .ignoresSafeArea()
            }

            if isLoading && error == nil {
                VStack(spacing: 16) {
                    ProgressView()
                        .progressViewStyle(CircularProgressViewStyle(tint: Color(red: 0.79, green: 0.66, blue: 0.30)))
                        .scaleEffect(1.4)
                    Text("Cave & Vigne")
                        .font(.custom("Georgia", size: 20))
                        .foregroundColor(Color(red: 0.79, green: 0.66, blue: 0.30))
                        .italic()
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .background(Color(red: 0.10, green: 0.06, blue: 0.06))
                .ignoresSafeArea()
            }
        }
    }
}

// Pull-to-refresh wrapper around WebView
struct RefreshableWebView: UIViewControllerRepresentable {
    let url: URL
    @Binding var isLoading: Bool
    @Binding var error: String?

    func makeUIViewController(context: Context) -> WebViewController {
        WebViewController(url: url, isLoading: $isLoading, error: $error)
    }

    func updateUIViewController(_ vc: WebViewController, context: Context) {}
}

class WebViewController: UIViewController {
    var url: URL
    var isLoading: Binding<Bool>
    var error: Binding<String?>
    var webView: WebViewContainer!
    var refreshControl: UIRefreshControl!

    init(url: URL, isLoading: Binding<Bool>, error: Binding<String?>) {
        self.url = url
        self.isLoading = isLoading
        self.error = error
        super.init(nibName: nil, bundle: nil)
    }
    required init?(coder: NSCoder) { fatalError() }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = UIColor(red: 0.10, green: 0.06, blue: 0.06, alpha: 1)

        let host = WebView(url: url, isLoading: isLoading, error: error)
        let hostVC = UIHostingController(rootView: host)
        addChild(hostVC)
        hostVC.view.frame = view.bounds
        hostVC.view.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        view.addSubview(hostVC.view)
        hostVC.didMove(toParent: self)
    }
}

// Needed because UIHostingController doesn't expose
// This is a placeholder; actual RefreshableWebView is in the hosting approach
class WebViewContainer: UIView {}
