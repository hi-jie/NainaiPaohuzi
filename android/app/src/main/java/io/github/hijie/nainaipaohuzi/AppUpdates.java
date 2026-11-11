package io.github.hijie.nainaipaohuzi;

import android.app.Activity;
import android.app.DownloadManager;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.content.pm.Signature;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;

import androidx.core.content.FileProvider;

import org.json.JSONException;
import org.json.JSONObject;

import java.io.File;
import java.io.IOException;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.HashSet;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.function.Consumer;

public final class AppUpdates {
    static final int ALLOW_UPDATE_INSTALL = 2;
    private static final String PAGES = "https://hi-jie.github.io/NainaiPaohuzi/";
    private static final int SIGNING_FLAGS = Build.VERSION.SDK_INT >= Build.VERSION_CODES.P
            ? PackageManager.GET_SIGNING_CERTIFICATES : PackageManager.GET_SIGNATURES;

    public static final class UpdateFileProvider extends FileProvider {}

    private record Update(long code, String name, String apk) {}

    private final Activity activity;
    private final Consumer<JSONObject> render;
    private final DownloadManager downloads;
    private final SharedPreferences preferences;
    private final PackageInfo installed;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private final ExecutorService worker = Executors.newSingleThreadExecutor();
    private final Runnable refresh = this::refreshDownload;

    private long downloadId;
    private long downloadVersion;
    private int progress = -1;
    private boolean ready;
    private boolean checking;
    private boolean validating;
    private boolean foreground;
    private boolean closed;
    private Update offered;

    AppUpdates(Activity activity, Consumer<JSONObject> render) {
        this.activity = activity;
        this.render = render;
        downloads = activity.getSystemService(DownloadManager.class);
        preferences = activity.getSharedPreferences("app-updates", Activity.MODE_PRIVATE);
        try {
            installed = activity.getPackageManager().getPackageInfo(activity.getPackageName(), SIGNING_FLAGS);
        } catch (PackageManager.NameNotFoundException error) {
            throw new IllegalStateException(error);
        }
        downloadId = preferences.getLong("downloadId", 0);
        downloadVersion = preferences.getLong("downloadVersion", 0);
        if (downloadId != 0 && downloadVersion <= versionCode(installed)) clearDownload();
    }

    void sendState() {
        publish("", null);
    }

    private void publish(String message, String available) {
        try {
            render.accept(new JSONObject()
                    .put("version", installed.versionName)
                    .put("checking", checking)
                    .put("downloading", downloadId != 0 && !ready)
                    .put("ready", ready)
                    .put("progress", progress)
                    .put("message", message)
                    .put("available", available));
        } catch (JSONException error) {
            throw new IllegalStateException(error);
        }
    }

    void check() {
        if (checking || (downloadId != 0 && !ready)) return;
        checking = true;
        offered = null;
        sendState();
        worker.execute(() -> {
            Update latest = null;
            try {
                latest = readLatest();
            } catch (IOException | JSONException ignored) {
                // The user can retry after the connection recovers.
            }
            Update result = latest;
            activity.runOnUiThread(() -> {
                if (closed) return;
                checking = false;
                if (result == null) publish("检查更新失败，请稍后重试。", null);
                else if (result.code() <= versionCode(installed)) publish("已是最新版本", null);
                else if (ready && downloadVersion >= result.code()) publish("更新已下载，可以安装。", null);
                else {
                    offered = result;
                    publish("", result.name());
                }
            });
        });
    }

    private static Update readLatest() throws IOException, JSONException {
        HttpURLConnection connection = (HttpURLConnection) new URL(
                PAGES + "update.json?check=" + System.currentTimeMillis()).openConnection();
        connection.setConnectTimeout(10000);
        connection.setReadTimeout(10000);
        connection.setUseCaches(false);
        connection.setInstanceFollowRedirects(false);
        try {
            if (connection.getResponseCode() != HttpURLConnection.HTTP_OK) throw new IOException("Update feed unavailable");
            try (InputStreamReader reader = new InputStreamReader(connection.getInputStream(), StandardCharsets.UTF_8)) {
                StringBuilder text = new StringBuilder();
                char[] buffer = new char[512];
                for (int count; (count = reader.read(buffer)) != -1;) {
                    if (text.length() + count > 4096) throw new IOException("Update feed exceeds size limit");
                    text.append(buffer, 0, count);
                }
                JSONObject data = new JSONObject(text.toString());
                long code = data.getLong("versionCode");
                String name = data.getString("versionName");
                String apk = data.getString("apk");
                if (code <= 0 || !name.matches("[0-9]+\\.[0-9]+\\.[0-9]+")
                        || !apk.equals("NainaiPaohuzi-" + name + "-release.apk")) {
                    throw new IOException("Invalid update feed");
                }
                return new Update(code, name, apk);
            }
        } finally {
            connection.disconnect();
        }
    }

    void download() {
        if (offered == null || checking || (downloadId != 0 && !ready)) return;
        Update update = offered;
        offered = null;
        clearDownload();
        try {
            DownloadManager.Request request = new DownloadManager.Request(Uri.parse(PAGES + update.apk()))
                    .setTitle("衡阳跑胡子 " + update.name())
                    .setMimeType("application/vnd.android.package-archive")
                    .setDestinationInExternalFilesDir(activity, "updates", fileName(update.code()));
            downloadId = downloads.enqueue(request);
            downloadVersion = update.code();
            preferences.edit().putLong("downloadId", downloadId).putLong("downloadVersion", downloadVersion).apply();
            sendState();
            refreshDownload();
        } catch (IllegalArgumentException | IllegalStateException | SecurityException error) {
            clearDownload();
            publish("无法开始下载，请重新检查更新。", null);
        }
    }

    void resume() {
        foreground = true;
        refreshDownload();
    }

    void pause() {
        foreground = false;
        handler.removeCallbacks(refresh);
    }

    void close() {
        closed = true;
        pause();
        worker.shutdownNow();
    }

    private void refreshDownload() {
        handler.removeCallbacks(refresh);
        if (!foreground || downloadId == 0 || ready || validating) return;
        try (Cursor result = downloads.query(new DownloadManager.Query().setFilterById(downloadId))) {
            if (result == null || !result.moveToFirst()) {
                downloadFailed("找不到下载任务，请重新检查更新。");
                return;
            }
            int state = result.getInt(result.getColumnIndexOrThrow(DownloadManager.COLUMN_STATUS));
            if (state == DownloadManager.STATUS_FAILED) {
                downloadFailed("下载失败，请重新检查更新。");
                return;
            }
            if (state == DownloadManager.STATUS_SUCCESSFUL) {
                validateDownload();
                return;
            }
            long total = result.getLong(result.getColumnIndexOrThrow(DownloadManager.COLUMN_TOTAL_SIZE_BYTES));
            long received = result.getLong(result.getColumnIndexOrThrow(DownloadManager.COLUMN_BYTES_DOWNLOADED_SO_FAR));
            progress = total > 0 ? (int) Math.min(99, received * 100.0 / total) : -1;
            publish(state == DownloadManager.STATUS_PAUSED ? "等待网络恢复后继续下载。" : "", null);
        } catch (IllegalArgumentException | IllegalStateException | SecurityException error) {
            downloadFailed("无法读取下载状态，请重新检查更新。");
            return;
        }
        handler.postDelayed(refresh, 500);
    }

    private void validateDownload() {
        validating = true;
        progress = 100;
        publish("正在校验安装包…", null);
        long expectedVersion = downloadVersion;
        File file = downloadFile(expectedVersion);
        worker.execute(() -> {
            boolean valid = isValidUpdate(file, expectedVersion);
            activity.runOnUiThread(() -> {
                if (closed) return;
                validating = false;
                if (!valid) downloadFailed("安装包校验失败，请重新检查更新。");
                else {
                    ready = true;
                    sendState();
                }
            });
        });
    }

    private boolean isValidUpdate(File file, long expectedVersion) {
        if (file == null || !file.isFile()) return false;
        PackageInfo candidate = activity.getPackageManager().getPackageArchiveInfo(file.getPath(), SIGNING_FLAGS);
        if (candidate == null || !installed.packageName.equals(candidate.packageName)
                || versionCode(candidate) != expectedVersion || expectedVersion <= versionCode(installed)) return false;
        Signature[] current = signatures(installed);
        Signature[] next = signatures(candidate);
        return current != null && current.length > 0 && next != null
                && new HashSet<>(Arrays.asList(current)).equals(new HashSet<>(Arrays.asList(next)));
    }

    private static long versionCode(PackageInfo info) {
        return Build.VERSION.SDK_INT >= Build.VERSION_CODES.P ? info.getLongVersionCode() : info.versionCode;
    }

    private static Signature[] signatures(PackageInfo info) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.P) return info.signatures;
        return info.signingInfo == null ? null : info.signingInfo.getApkContentsSigners();
    }

    private static String fileName(long version) {
        return "update-" + version + ".apk";
    }

    private File downloadFile(long version) {
        File folder = activity.getExternalFilesDir("updates");
        return folder == null ? null : new File(folder, fileName(version));
    }

    private void downloadFailed(String message) {
        clearDownload();
        publish(message, null);
    }

    private void clearDownload() {
        if (downloadId != 0) {
            try {
                downloads.remove(downloadId);
            } catch (IllegalArgumentException | IllegalStateException | SecurityException ignored) {
                // Clear the app's state even if the system download service is unavailable.
            }
        }
        downloadId = 0;
        downloadVersion = 0;
        progress = -1;
        ready = false;
        preferences.edit().clear().apply();
    }

    void install() {
        if (!ready) return;
        File file = downloadFile(downloadVersion);
        if (file == null || !file.isFile()) {
            downloadFailed("找不到安装包，请重新检查更新。");
            return;
        }
        try {
            if (!activity.getPackageManager().canRequestPackageInstalls()) {
                Intent permission = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                        Uri.fromParts("package", activity.getPackageName(), null));
                activity.startActivityForResult(permission, ALLOW_UPDATE_INSTALL);
                return;
            }
            Uri uri = FileProvider.getUriForFile(activity, activity.getPackageName() + ".updates", file);
            Intent installer = new Intent(Intent.ACTION_VIEW)
                    .setDataAndType(uri, "application/vnd.android.package-archive")
                    .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            activity.startActivity(installer);
        } catch (IllegalArgumentException | IllegalStateException | SecurityException | android.content.ActivityNotFoundException error) {
            publish("无法打开系统安装器。", null);
        }
    }
}
