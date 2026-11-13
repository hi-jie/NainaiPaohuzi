package io.github.hijie.nainaipaohuzi;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.ActivityNotFoundException;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.ContentResolver;
import android.content.Intent;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Process;
import android.util.Log;
import android.view.DisplayCutout;
import android.view.View;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.Toast;
import android.window.OnBackInvokedDispatcher;

import androidx.webkit.WebViewAssetLoader;

import java.util.Collections;

public class MainActivity extends Activity {
    private static final String GAME_URL = "https://appassets.androidplatform.net/assets/www/index.html";
    private static final String EXIT_URL = "paohuzi://exit";
    private static final int CHOOSE_AVATAR = 1;
    private static final String TAG = "PaohuziDiag";
    private FrameLayout root;
    private WebView game;
    private AppUpdates updates;
    private boolean updatePageReady;
    private ValueCallback<Uri[]> avatarSelection;
    private boolean resumed;
    private String pageProblem;
    private boolean pageStarted;
    private boolean diagnosticShown;
    private boolean rendererGone;
    private final Runnable diagnostics = new Runnable() {
        @Override
        public void run() {
            if (rendererGone || pageStarted || isFinishing() || isDestroyed()) return;
            game.evaluateJavascript("window.__paohuziStarted === true", value -> {
                if ("true".equals(value)) pageStarted = true;
                else showDiagnosticDialog();
            });
        }
    };

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        // 允许在电脑上用 chrome://inspect 调试页面，方便排查平板上的渲染问题。
        WebView.setWebContentsDebuggingEnabled(true);
        WebViewAssetLoader.AssetsPathHandler assets = new WebViewAssetLoader.AssetsPathHandler(this);
        WebViewAssetLoader loader = new WebViewAssetLoader.Builder()
                .addPathHandler("/assets/", path -> {
                    WebResourceResponse response = assets.handle(path);
                    if (response != null && path.endsWith(".mjs")) {
                        response.setMimeType("text/javascript");
                        response.setEncoding("UTF-8");
                    }
                    return response;
                })
                .build();

        game = new WebView(this);
        updates = new AppUpdates(this, state -> {
            if (updatePageReady) {
                game.evaluateJavascript("window.dispatchEvent(new CustomEvent('paohuzi-update', { detail: "
                        + state + " }));", null);
            }
        });
        game.setBackgroundColor(Color.rgb(16, 58, 48));
        WebSettings settings = game.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        // 给诊断兜底页提供系统 WebView 的包名和版本。
        game.addJavascriptInterface(new NativeDiagnostics(), "paohuziDiagnosticsNative");
        game.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback,
                                             FileChooserParams params) {
                if (!GAME_URL.equals(view.getUrl()) || params.getMode() != FileChooserParams.MODE_OPEN) {
                    return false;
                }
                completeAvatarSelection(null);
                avatarSelection = callback;
                Intent picker = new Intent(Intent.ACTION_OPEN_DOCUMENT)
                        .addCategory(Intent.CATEGORY_OPENABLE)
                        .setType("image/*");
                try {
                    startActivityForResult(picker, CHOOSE_AVATAR);
                } catch (ActivityNotFoundException error) {
                    completeAvatarSelection(null);
                    Toast.makeText(MainActivity.this, "无法打开图片选择器", Toast.LENGTH_SHORT).show();
                }
                return true;
            }
        });
        game.setWebViewClient(new WebViewClient() {
            @Override
            public void onPageFinished(WebView view, String url) {
                if (GAME_URL.equals(url)) {
                    view.evaluateJavascript("document.getElementById('exit-game').hidden = false", null);
                    updatePageReady = true;
                    updates.sendState();
                    scheduleDiagnostics();
                }
                syncDisplayCutout(root.getRootWindowInsets());
                syncMusicForeground();
            }

            @Override
            public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                if (request.isForMainFrame()) {
                    pageProblem = "主页面加载失败：" + error.getErrorCode() + " " + error.getDescription();
                    Log.e(TAG, pageProblem);
                    scheduleDiagnostics();
                }
            }

            @Override
            public void onReceivedHttpError(WebView view, WebResourceRequest request, WebResourceResponse response) {
                if (request.isForMainFrame()) {
                    pageProblem = "主页面返回 HTTP " + response.getStatusCode() + "：" + request.getUrl();
                    Log.e(TAG, pageProblem);
                    scheduleDiagnostics();
                }
            }

            @Override
            public boolean onRenderProcessGone(WebView view, RenderProcessGoneDetail detail) {
                rendererGone = true;
                pageProblem = "WebView 渲染进程崩溃（didCrash=" + detail.didCrash() + "）";
                Log.e(TAG, pageProblem);
                showDiagnosticDialog();
                return true;
            }

            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                WebResourceResponse local = loader.shouldInterceptRequest(request.getUrl());
                String scheme = request.getUrl().getScheme();
                if (local == null && ("https".equalsIgnoreCase(scheme) || "http".equalsIgnoreCase(scheme))) {
                    return new WebResourceResponse("text/plain", "UTF-8", 403, "Forbidden",
                            Collections.emptyMap(), null);
                }
                return local;
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                String url = request.getUrl().toString();
                if (request.isForMainFrame() && GAME_URL.equals(view.getUrl())) {
                    switch (url) {
                        case EXIT_URL -> finish();
                        case "paohuzi://check-update" -> updates.check();
                        case "paohuzi://download-update" -> updates.download();
                        case "paohuzi://cancel-update-download" -> updates.cancelDownload();
                        case "paohuzi://install-update" -> updates.install();
                        default -> { }
                    }
                }
                return !GAME_URL.equals(url);
            }
        });
        root = new FrameLayout(this);
        root.addView(game, new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT));
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            getWindow().setDecorFitsSystemWindows(false);
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            WindowManager.LayoutParams layout = getWindow().getAttributes();
            layout.layoutInDisplayCutoutMode = WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;
            getWindow().setAttributes(layout);
            root.setOnApplyWindowInsetsListener((view, insets) -> {
                syncDisplayCutout(insets);
                return insets;
            });
        }
        setContentView(root);
        enterImmersiveMode();
        game.loadUrl(GAME_URL);
        // 即使页面完全没有加载，也在 6 秒后检查一次，避免只剩一片绿色。
        scheduleDiagnostics();

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            getOnBackInvokedDispatcher().registerOnBackInvokedCallback(
                    OnBackInvokedDispatcher.PRIORITY_DEFAULT, this::navigateBack);
        }
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == AppUpdates.ALLOW_UPDATE_INSTALL) {
            if (getPackageManager().canRequestPackageInstalls()) updates.install();
            return;
        }
        if (requestCode != CHOOSE_AVATAR) return;
        Uri selected = resultCode == RESULT_OK && data != null ? data.getData() : null;
        if (selected != null && (!ContentResolver.SCHEME_CONTENT.equals(selected.getScheme())
                || checkUriPermission(selected, Process.myPid(), Process.myUid(),
                        Intent.FLAG_GRANT_READ_URI_PERMISSION) != PackageManager.PERMISSION_GRANTED)) {
            selected = null;
        }
        completeAvatarSelection(selected);
    }

    private void completeAvatarSelection(Uri selected) {
        ValueCallback<Uri[]> callback = avatarSelection;
        avatarSelection = null;
        if (callback != null) callback.onReceiveValue(selected == null ? null : new Uri[]{selected});
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (resumed) syncMusicForeground();
        if (hasFocus) enterImmersiveMode();
    }

    private void enterImmersiveMode() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            WindowInsetsController bars = getWindow().getInsetsController();
            if (bars == null) return;
            bars.setSystemBarsBehavior(WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
            bars.hide(WindowInsets.Type.systemBars());
        } else {
            getWindow().getDecorView().setSystemUiVisibility(
                    View.SYSTEM_UI_FLAG_FULLSCREEN | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                            | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY);
        }
    }

    private void syncDisplayCutout(WindowInsets insets) {
        if (insets == null || Build.VERSION.SDK_INT < Build.VERSION_CODES.P) return;
        DisplayCutout cutout = insets.getDisplayCutout();
        float density = getResources().getDisplayMetrics().density;
        float top = cutout == null ? 0 : cutout.getSafeInsetTop() / density;
        float right = cutout == null ? 0 : cutout.getSafeInsetRight() / density;
        float bottom = cutout == null ? 0 : cutout.getSafeInsetBottom() / density;
        float left = cutout == null ? 0 : cutout.getSafeInsetLeft() / density;
        // The page can avoid the cutout without resizing the WebView when transient bars appear.
        game.evaluateJavascript("(() => { const style = document.documentElement.style;"
                + " style.setProperty('--safe-top', '" + top + "px');"
                + " style.setProperty('--safe-right', '" + right + "px');"
                + " style.setProperty('--safe-bottom', '" + bottom + "px');"
                + " style.setProperty('--safe-left', '" + left + "px'); })()", null);
    }

    private void syncMusicForeground() {
        boolean foreground = resumed && hasWindowFocus();
        game.evaluateJavascript("window.paohuziForeground = " + foreground
                + "; window.dispatchEvent(new Event('paohuzi-foreground-change'));", null);
    }

    private void scheduleDiagnostics() {
        game.removeCallbacks(diagnostics);
        game.postDelayed(diagnostics, 6000);
    }

    private static String webViewDescription() {
        PackageInfo webViewPackage = WebView.getCurrentWebViewPackage();
        if (webViewPackage == null) return "未找到系统 WebView（可能已被停用或缺失）";
        return webViewPackage.packageName + " " + webViewPackage.versionName;
    }

    private String diagnosticReport() {
        StringBuilder text = new StringBuilder();
        text.append("游戏页面没有正常启动。\n\n");
        text.append("设备：").append(Build.MANUFACTURER).append(' ').append(Build.MODEL).append('\n');
        text.append("系统：Android ").append(Build.VERSION.RELEASE)
                .append("（API ").append(Build.VERSION.SDK_INT).append("）\n");
        text.append("系统 WebView：").append(webViewDescription()).append('\n');
        text.append("UA：").append(WebSettings.getDefaultUserAgent(this)).append('\n');
        if (pageProblem != null) text.append("错误：").append(pageProblem).append('\n');
        text.append("\n建议：\n1. 更新或启用系统的 Android System WebView / Chrome；\n")
                .append("2. 或先用平板浏览器打开 https://hi-jie.github.io/NainaiPaohuzi/ 玩网页版；\n")
                .append("3. 把这段信息发给开发者。");
        return text.toString();
    }

    private void showDiagnosticDialog() {
        if (diagnosticShown || isFinishing() || isDestroyed()) return;
        diagnosticShown = true;
        String report = diagnosticReport();
        Log.e(TAG, report);
        new AlertDialog.Builder(this)
                .setTitle(rendererGone ? "WebView 渲染进程崩溃" : "游戏页面未能启动")
                .setMessage(report)
                .setPositiveButton(rendererGone ? "重新打开" : "重新加载", (dialog, which) -> {
                    if (rendererGone) {
                        recreate();
                        return;
                    }
                    diagnosticShown = false;
                    pageProblem = null;
                    pageStarted = false;
                    game.reload();
                    scheduleDiagnostics();
                })
                .setNeutralButton("复制信息", (dialog, which) -> {
                    ClipboardManager clipboard = (ClipboardManager) getSystemService(CLIPBOARD_SERVICE);
                    clipboard.setPrimaryClip(ClipData.newPlainText("跑胡子诊断信息", report));
                    Toast.makeText(this, "诊断信息已复制", Toast.LENGTH_SHORT).show();
                })
                .setNegativeButton("关闭", null)
                .show();
    }

    public static final class NativeDiagnostics {
        @JavascriptInterface
        public boolean compatibilityTesting() {
            return BuildConfig.COMPATIBILITY_TESTING;
        }

        @JavascriptInterface
        public String webViewInfo() {
            return webViewDescription();
        }
    }

    @Override
    public void onBackPressed() {
        navigateBack();
    }

    private void navigateBack() {
        game.evaluateJavascript("""
                (() => {
                    const dialog = document.querySelector('dialog[open]');
                    if (dialog) {
                        dialog.close();
                        return true;
                    }
                    const back = document.querySelector(
                        '#table:not([hidden]) [data-command="leave"], ' +
                        '#table:not([hidden]) .result [data-command="home"], ' +
                        '.front-screen:not([hidden]) [data-back-home]'
                    );
                    if (!back) return false;
                    back.click();
                    return true;
                })()
                """, handled -> {
            if ("false".equals(handled)) finish();
        });
    }

    @Override
    protected void onPause() {
        resumed = false;
        updates.pause();
        syncMusicForeground();
        game.onPause();
        game.pauseTimers();
        super.onPause();
    }

    @Override
    protected void onResume() {
        super.onResume();
        game.onResume();
        game.resumeTimers();
        resumed = true;
        syncMusicForeground();
        updates.resume();
    }

    @Override
    protected void onDestroy() {
        completeAvatarSelection(null);
        updatePageReady = false;
        game.removeCallbacks(diagnostics);
        updates.close();
        root.removeView(game);
        game.destroy();
        super.onDestroy();
    }
}
