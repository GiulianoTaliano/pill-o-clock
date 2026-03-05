package expo.modules.alarm

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build

/**
 * Awakened by AlarmManager at the exact scheduled time.
 * Immediately starts AlarmAudioService as a foreground service.
 *
 * The receiver itself is kept as thin as possible — all heavy work
 * (audio playback, notification, deep-link launch) is delegated to the service.
 */
class AlarmReceiver : BroadcastReceiver() {

  override fun onReceive(context: Context, intent: Intent) {
    val serviceIntent = Intent(context, AlarmAudioService::class.java).apply {
      action = AlarmAudioService.ACTION_START
      // Forward every extra that the AlarmManager stored in the PendingIntent.
      intent.extras?.let { putExtras(it) }
    }

    // On API 26+, background services can't start without being foreground.
    // startForegroundService() gives the app 5 seconds to call startForeground()
    // before the system kills it — the service calls it immediately.
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      context.startForegroundService(serviceIntent)
    } else {
      context.startService(serviceIntent)
    }
  }
}
