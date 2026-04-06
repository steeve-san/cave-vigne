// android/app/src/main/java/com/cavevigne/MainActivity.kt
package com.cavevigne

import android.Manifest
import android.content.pm.PackageManager
import android.os.Bundle
import android.webkit.*
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import androidx.swiperefreshlayout.widget.SwipeRefreshLayout

class MainActivity : AppCompatActivity() {

    private lateinit var webView: WebView
    private lateinit var swipeRefresh: SwipeRefreshLayout
    private val CAMERA_PERMISSION_CODE = 100
    private val APP_URL = "https://cavevigne.fr"

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        swipeRefresh = findViewById(R.id.swipeRefresh)
        webView = findViewById(R.id.webView)

        setupWebView()
        setupSwipeRefresh()
        requestPermissions()

        webView.loadUrl(APP_URL)
    }

    private fun setupWebView() {
        webView.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            allowFileAccess = true
            mediaPlaybackRequiresUserGesture = false
            mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
            setSupportZoom(true)
            builtInZoomControls = false
            displayZoomControls = false
            useWideViewPort = true
            loadWithOverviewMode = true
            cacheMode = WebSettings.LOAD_DEFAULT
            userAgentString = userAgentString + " CaveVigneApp/1.0 Android"
        }

        webView.webViewClient = object : WebViewClient() {
            override fun onReceivedError(view: WebView?, request: WebResourceRequest?, error: WebResourceError?) {
                if (request?.isForMainFrame == true) {
                    view?.loadData(errorPage(), "text/html", "UTF-8")
                }
            }
            override fun shouldOverrideUrlLoading(view: WebView?, request: WebResourceRequest?): Boolean {
                val url = request?.url?.toString() ?: return false
                return !url.startsWith(APP_URL) && !url.startsWith("about:")
            }
            override fun onPageFinished(view: WebView?, url: String?) {
                swipeRefresh.isRefreshing = false
            }
        }

        webView.webChromeClient = object : WebChromeClient() {
            override fun onPermissionRequest(request: PermissionRequest?) {
                request?.let {
                    val granted = it.resources.filter { res ->
                        res == PermissionRequest.RESOURCE_VIDEO_CAPTURE || res == PermissionRequest.RESOURCE_AUDIO_CAPTURE
                    }.toTypedArray()
                    if (granted.isNotEmpty()) it.grant(granted) else it.deny()
                }
            }
            override fun onShowFileChooser(webView: WebView?, filePathCallback: ValueCallback<Array<android.net.Uri>>?, fileChooserParams: FileChooserParams?): Boolean {
                return false // handled by native intent if needed
            }
            override fun onProgressChanged(view: WebView?, newProgress: Int) {
                if (newProgress < 100) swipeRefresh.isRefreshing = true
                else swipeRefresh.isRefreshing = false
            }
        }

        // Enable localStorage persistence
        WebStorage.getInstance()
    }

    private fun setupSwipeRefresh() {
        swipeRefresh.setColorSchemeColors(
            ContextCompat.getColor(this, R.color.gold)
        )
        swipeRefresh.setOnRefreshListener {
            webView.reload()
        }
    }

    private fun requestPermissions() {
        val perms = arrayOf(Manifest.permission.CAMERA, Manifest.permission.READ_EXTERNAL_STORAGE)
        val toRequest = perms.filter { ContextCompat.checkSelfPermission(this, it) != PackageManager.PERMISSION_GRANTED }
        if (toRequest.isNotEmpty()) {
            ActivityCompat.requestPermissions(this, toRequest.toTypedArray(), CAMERA_PERMISSION_CODE)
        }
    }

    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<String>, grantResults: IntArray) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (requestCode == CAMERA_PERMISSION_CODE) {
            if (grantResults.any { it == PackageManager.PERMISSION_GRANTED }) {
                webView.reload()
            } else {
                Toast.makeText(this, "Caméra requise pour scanner les étiquettes", Toast.LENGTH_LONG).show()
            }
        }
    }

    override fun onBackPressed() {
        if (webView.canGoBack()) webView.goBack() else super.onBackPressed()
    }

    override fun onResume() {
        super.onResume()
        webView.onResume()
    }

    override fun onPause() {
        super.onPause()
        webView.onPause()
    }

    override fun onDestroy() {
        webView.destroy()
        super.onDestroy()
    }

    private fun errorPage() = """
        <!DOCTYPE html><html><head><meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <style>
          body{font-family:sans-serif;background:#1a0f0f;color:#F0E6D3;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;flex-direction:column;gap:1rem}
          h2{color:#C9A84C;font-size:1.5rem}
          p{color:#B09070;font-size:0.9rem;text-align:center;max-width:280px}
          button{background:#C9A84C;color:#1a0f0f;border:none;border-radius:8px;padding:12px 24px;font-size:1rem;cursor:pointer}
        </style></head><body>
        <h2>Cave &amp; Vigne</h2>
        <p>Impossible de se connecter au serveur. Vérifiez votre connexion internet.</p>
        <button onclick="window.location.reload()">Réessayer</button>
        </body></html>
    """.trimIndent()
}
