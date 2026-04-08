// ErrorView.swift — Offline / error screen
import SwiftUI

struct ErrorView: View {
    let message: String
    let onRetry: () -> Void

    var body: some View {
        VStack(spacing: 20) {
            Spacer()
            Text("🍷")
                .font(.system(size: 60))
            Text("Cave & Vigne")
                .font(.custom("Georgia", size: 24))
                .foregroundColor(Color(red: 0.79, green: 0.66, blue: 0.30))
                .italic()
            Text("Impossible de se connecter au serveur.")
                .font(.system(size: 16))
                .foregroundColor(Color(red: 0.69, green: 0.57, blue: 0.44))
                .multilineTextAlignment(.center)
                .padding(.horizontal, 40)
            Text(message)
                .font(.system(size: 12))
                .foregroundColor(Color(red: 0.50, green: 0.40, blue: 0.32))
                .multilineTextAlignment(.center)
                .padding(.horizontal, 40)
            Button(action: onRetry) {
                Text("Réessayer")
                    .font(.system(size: 16, weight: .medium))
                    .foregroundColor(Color(red: 0.10, green: 0.06, blue: 0.06))
                    .padding(.horizontal, 32)
                    .padding(.vertical, 12)
                    .background(Color(red: 0.79, green: 0.66, blue: 0.30))
                    .cornerRadius(10)
            }
            Spacer()
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color(red: 0.10, green: 0.06, blue: 0.06))
        .ignoresSafeArea()
    }
}
