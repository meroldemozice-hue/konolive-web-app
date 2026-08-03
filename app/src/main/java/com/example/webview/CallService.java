package com.example.webview;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.media.AudioAttributes;
import android.media.RingtoneManager;
import android.net.Uri;
import android.os.Build;
import android.os.IBinder;
import android.os.VibrationEffect;
import android.os.Vibrator;
import androidx.core.app.NotificationCompat;

public class CallService extends Service {
    private static final String CHANNEL_ID = "IncomingCallChannel";
    private Vibrator vibrator;

    @Override
    public void onCreate() {
        super.onCreate();
        vibrator = (Vibrator) getSystemService(Context.VIBRATOR_SERVICE);
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        String action = intent != null ? intent.getAction() : null;
        if ("START_CALL".equals(action)) {
            String callerName = intent.getStringExtra("CALLER_NAME");
            if (callerName == null) callerName = "Appel entrant";
            showCallNotification(callerName);
            startVibration();
        } else if ("STOP_CALL".equals(action)) {
            stopForeground(true);
            stopSelf();
        }
        return START_STICKY;
    }

    private void showCallNotification(String callerName) {
        createNotificationChannel();

        // Intent for clicking the notification itself (opens app)
        Intent fullScreenIntent = new Intent(this, MainActivity.class);
        fullScreenIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent fullScreenPendingIntent = PendingIntent.getActivity(this, 0,
                fullScreenIntent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        // Intent for ACCEPT button
        Intent acceptIntent = new Intent(this, CallActionReceiver.class);
        acceptIntent.setAction("com.konolive.ACTION_ACCEPT");
        PendingIntent acceptPendingIntent = PendingIntent.getBroadcast(this, 1,
                acceptIntent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        // Intent for REJECT button
        Intent rejectIntent = new Intent(this, CallActionReceiver.class);
        rejectIntent.setAction("com.konolive.ACTION_REJECT");
        PendingIntent rejectPendingIntent = PendingIntent.getBroadcast(this, 2,
                rejectIntent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        Notification notification = new NotificationCompat.Builder(this, CHANNEL_ID)
                .setSmallIcon(R.mipmap.ic_launcher)
                .setContentTitle("Appel Konolive")
                .setContentText(callerName)
                .setPriority(NotificationCompat.PRIORITY_MAX)
                .setCategory(NotificationCompat.CATEGORY_CALL)
                .setAutoCancel(true)
                .setOngoing(true)
                .setFullScreenIntent(fullScreenPendingIntent, true)
                .addAction(android.R.drawable.ic_menu_call, "Accepter", acceptPendingIntent)
                .addAction(android.R.drawable.ic_menu_close_clear_cancel, "Refuser", rejectPendingIntent)
                .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
                .build();

        startForeground(1, notification);
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                    CHANNEL_ID,
                    "Appels entrants",
                    NotificationManager.IMPORTANCE_HIGH
            );
            channel.setDescription("Utilisé pour les notifications d'appels entrants Konolive");
            channel.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
            
            Uri ringtoneUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE);
            AudioAttributes audioAttributes = new AudioAttributes.Builder()
                    .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                    .setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
                    .build();
            channel.setSound(ringtoneUri, audioAttributes);

            NotificationManager manager = getSystemService(NotificationManager.class);
            if (manager != null) {
                manager.createNotificationChannel(channel);
            }
        }
    }

    private void startVibration() {
        if (vibrator != null && vibrator.hasVibrator()) {
            long[] pattern = {0, 500, 1000};
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                vibrator.vibrate(VibrationEffect.createWaveform(pattern, 0));
            } else {
                vibrator.vibrate(pattern, 0);
            }
        }
    }

    @Override
    public void onDestroy() {
        if (vibrator != null) {
            vibrator.cancel();
        }
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
