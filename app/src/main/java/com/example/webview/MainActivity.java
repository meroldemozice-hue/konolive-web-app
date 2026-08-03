package com.example.webview;

import android.Manifest;
import android.app.KeyguardManager;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.pm.PackageManager;
import android.media.AudioManager;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.view.WindowManager;
import android.webkit.PermissionRequest;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.webkit.JavascriptInterface;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import java.util.ArrayList;
import java.util.List;

public class MainActivity extends AppCompatActivity {

    private WebView webView;
    private View splashContainer;
    private AudioManager audioManager;
    private static final int PERMISSION_REQUEST_CODE = 123;

    private final BroadcastReceiver syncReceiver = new BroadcastReceiver() {
        @Override
        public void onReceive(Context context, Intent intent) {
            String action = intent.getStringExtra("action");
            if ("reject".equals(action)) {
                syncActionWithWeb("reject");
            }
        }
    };

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        
        handleWindowFlags();

        setContentView(R.layout.activity_main);
        
        audioManager = (AudioManager) getSystemService(Context.AUDIO_SERVICE);
        webView = findViewById(R.id.webview);
        splashContainer = findViewById(R.id.splash_container);
        
        setupWebView();
        checkAndRequestPermissions();
        
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            registerReceiver(syncReceiver, new IntentFilter("com.konolive.SYNC_WEB"), Context.RECEIVER_NOT_EXPORTED);
        } else {
            registerReceiver(syncReceiver, new IntentFilter("com.konolive.SYNC_WEB"));
        }
        
        webView.setWebViewClient(new WebViewClient() {
            @Override
            public void onPageFinished(WebView view, String url) {
                splashContainer.setVisibility(View.GONE);
                handleIntentExtras(getIntent());
            }
        });
        
        webView.loadUrl("https://meroldemozice-hue.github.io/miaoda-react-admin/");
    }

    private void handleWindowFlags() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
            setShowWhenLocked(true);
            setTurnScreenOn(true);
            KeyguardManager km = (KeyguardManager) getSystemService(Context.KEYGUARD_SERVICE);
            if (km != null) km.requestDismissKeyguard(this, null);
        } else {
            getWindow().addFlags(WindowManager.LayoutParams.FLAG_DISMISS_KEYGUARD |
                                WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED |
                                WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON |
                                WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        }
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        handleIntentExtras(intent);
    }

    private void handleIntentExtras(Intent intent) {
        if (intent != null && "accept".equals(intent.getStringExtra("call_action"))) {
            syncActionWithWeb("accept");
        }
    }

    private void syncActionWithWeb(String action) {
        String js = "javascript:if(window.onNativeCallSync){ window.onNativeCallSync('" + action + "'); }";
        webView.evaluateJavascript(js, null);
    }

    private void setupWebView() {
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setJavaScriptCanOpenWindowsAutomatically(true);
        settings.setAllowFileAccess(true);
        settings.setCacheMode(WebSettings.LOAD_DEFAULT);
        
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            settings.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
        }

        webView.addJavascriptInterface(new WebAppInterface(this), "AndroidNative");

        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onPermissionRequest(final PermissionRequest request) {
                MainActivity.this.runOnUiThread(() -> request.grant(request.getResources()));
            }
        });
    }

    public class WebAppInterface {
        Context mContext;
        WebAppInterface(Context c) { mContext = c; }

        @JavascriptInterface
        public void onIncomingCall(String callerName) {
            Intent serviceIntent = new Intent(mContext, CallService.class);
            serviceIntent.setAction("START_CALL");
            serviceIntent.putExtra("CALLER_NAME", callerName);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                mContext.startForegroundService(serviceIntent);
            } else {
                mContext.startService(serviceIntent);
            }
        }

        @JavascriptInterface
        public void onCallEnded() {
            Intent serviceIntent = new Intent(mContext, CallService.class);
            serviceIntent.setAction("STOP_CALL");
            mContext.startService(serviceIntent);
            audioManager.setMode(AudioManager.MODE_NORMAL);
        }
        
        @JavascriptInterface
        public void setAudioMode(boolean isCallActive) {
            runOnUiThread(() -> {
                if (isCallActive) {
                    audioManager.setMode(AudioManager.MODE_IN_COMMUNICATION);
                    audioManager.setSpeakerphoneOn(true);
                } else {
                    audioManager.setMode(AudioManager.MODE_NORMAL);
                    audioManager.setSpeakerphoneOn(false);
                }
            });
        }
    }

    private void checkAndRequestPermissions() {
        List<String> permissions = new ArrayList<>();
        permissions.add(Manifest.permission.CAMERA);
        permissions.add(Manifest.permission.RECORD_AUDIO);
        permissions.add(Manifest.permission.MODIFY_AUDIO_SETTINGS);
        permissions.add(Manifest.permission.VIBRATE);
        permissions.add(Manifest.permission.WAKE_LOCK);
        
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            permissions.add(Manifest.permission.POST_NOTIFICATIONS);
        }

        List<String> needed = new ArrayList<>();
        for (String p : permissions) {
            if (ContextCompat.checkSelfPermission(this, p) != PackageManager.PERMISSION_GRANTED) {
                needed.add(p);
            }
        }
        if (!needed.isEmpty()) {
            ActivityCompat.requestPermissions(this, needed.toArray(new String[0]), PERMISSION_REQUEST_CODE);
        }
    }

    @Override
    protected void onDestroy() {
        try {
            unregisterReceiver(syncReceiver);
        } catch (Exception e) {
            // Already unregistered
        }
        super.onDestroy();
    }
}
