package com.konolive.app;

import android.content.Intent;
import android.util.Log;
import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;

public class CallNotificationService extends FirebaseMessagingService {
    
    private static final String TAG = "CallNotificationService";

    @Override
    public void onMessageReceived(RemoteMessage remoteMessage) {
        super.onMessageReceived(remoteMessage);
        
        Log.d(TAG, "From: " + remoteMessage.getFrom());

        // Check if message contains a data payload with a call event.
        if (remoteMessage.getData().size() > 0) {
            Log.d(TAG, "Message data payload: " + remoteMessage.getData());
            
            String event = remoteMessage.getData().get("event");
            if ("call_offer".equals(event)) {
                String callerName = remoteMessage.getData().get("callerName");
                
                // Lancer l'Activity d'appel entrant
                Intent intent = new Intent(this, IncomingCallActivity.class);
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
                intent.putExtra("callerName", callerName != null ? callerName : "Agent Konolive");
                startActivity(intent);
            }
        }
    }

    @Override
    public void onNewToken(String token) {
        Log.d(TAG, "Refreshed token: " + token);
        // Send token to your app server if needed.
    }
}
