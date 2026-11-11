package io.github.hijie.nainaipaohuzi;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.ContentResolver;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.graphics.Insets;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Process;
import android.view.View;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.Toast;
import android.window.OnBackInvokedDispatcher;

import androidx.webkit.WebViewAssetLoader;

public class MainActivity extends Activity {
    private static final String GAME_URL = "https://appassets.androidplatform.net/assets/www/index.html";
    private static final int CHOOSE_AVATAR = 1;
    private FrameLayout root;
    private WebView game;
    private ValueCallback<Uri[]> avatarSelection;
    private boolean resumed;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        WebViewAssetLoader.AssetsPathHandler assets = new WebViewAssetLoader.AssetsPathHandler(this);
        WebViewAssetLoader loader = new WebViewAssetLoader.Builder()
                .addPathHandler("/assets/", path -> {
                    WebResourceResponse response = assets.handle(path);
                    if (path.endsWith(".mjs")) {
                        response.setMimeType("text/javascript");
                        response.setEncoding("UTF-8");
                    }
                    return response;
                })
                .build();

        game = new WebView(this);
        game.setBackgroundColor(Color.rgb(16, 58, 48));
        WebSettings settings = game.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
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
                syncMusicForeground();
            }

            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                return loader.shouldInterceptRequest(request.getUrl());
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                return !GAME_URL.equals(request.getUrl().toString());
            }
        });
        root = new FrameLayout(this);
        root.addView(game, new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT));
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            getWindow().setDecorFitsSystemWindows(false);
            root.setOnApplyWindowInsetsListener((view, insets) -> {
                Insets cutout = insets.getInsets(WindowInsets.Type.displayCutout());
                view.setPadding(cutout.left, cutout.top, cutout.right, cutout.bottom);
                return insets;
            });
        }
        setContentView(root);
        game.loadUrl(GAME_URL);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            getOnBackInvokedDispatcher().registerOnBackInvokedCallback(
                    OnBackInvokedDispatcher.PRIORITY_DEFAULT, this::navigateBack);
        }
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
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
        if (!hasFocus) return;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            WindowInsetsController bars = getWindow().getInsetsController();
            bars.setSystemBarsBehavior(WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
            bars.hide(WindowInsets.Type.systemBars());
        } else {
            getWindow().getDecorView().setSystemUiVisibility(
                    View.SYSTEM_UI_FLAG_FULLSCREEN | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                            | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY);
        }
    }

    private void syncMusicForeground() {
        boolean foreground = resumed && hasWindowFocus();
        game.evaluateJavascript("window.paohuziForeground = " + foreground
                + "; window.dispatchEvent(new Event('paohuzi-foreground-change'));", null);
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
    }

    @Override
    protected void onDestroy() {
        completeAvatarSelection(null);
        root.removeView(game);
        game.destroy();
        super.onDestroy();
    }
}
