package com.example.webview;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.util.Log;

public class CallActionReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        String action = intent.getAction();
        Log.d("KonoliveCall", "Action received: " + action);

        if ("com.konolive.ACTION_ACCEPT".equals(action)) {
            // Start MainActivity to show the call
            Intent launchIntent = new Intent(context, MainActivity.class);
            launchIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
            launchIntent.putExtra("call_action", "accept");
            context.startActivity(launchIntent);
            
            // Stop the ringing service
            Intent serviceIntent = new Intent(context, CallService.class);
            context.stopService(serviceIntent);
            
        } else if ("com.konolive.ACTION_REJECT".equals(action)) {
            // Notify the web app via a temporary broadcast that MainActivity will pick up
            Intent syncIntent = new Intent("com.konolive.SYNC_WEB");
            syncIntent.putExtra("action", "reject");
            context.sendBroadcast(syncIntent);

            // Stop the ringing service
            Intent serviceIntent = new Intent(context, CallService.class);
            context.stopService(serviceIntent);
        }
    }
}
