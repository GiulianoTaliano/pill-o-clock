package expo.modules.alarm

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/**
 * Handles taps on the quick-action buttons (Take / Snooze / Skip) that are
 * embedded in the alarm notification.
 *
 * Delegates to AlarmAudioService with ACTION_EXECUTE_BUTTON so the foreground
 * service stops the alarm AND launches the RN screen with `action=`.
 * This delegation is required because on Android 10+ a bare BroadcastReceiver
 * cannot start activities from the background; only a foreground Service has
 * that privilege.
 *
 * We use startService (not startForegroundService) deliberately:
 *   - If AlarmAudioService is already running (alarm ringing), onStartCommand
 *     is called immediately on the existing foreground instance — no new
 *     startForeground() call is needed.
 *   - If the service already stopped, startService brings it up without the
 *     mandatory-5 s startForeground() timer that startForegroundService imposes.
 */
class AlarmActionReceiver : BroadcastReceiver() {

  companion object {
    const val ACTION_ALARM_BUTTON = "expo.modules.alarm.ACTION_ALARM_BUTTON"
  }

  override fun onReceive(context: Context, intent: Intent) {
    val actionValue   = intent.getStringExtra(AlarmAudioService.EXTRA_ACTION)         ?: return
    val scheduleId    = intent.getStringExtra(AlarmAudioService.EXTRA_SCHEDULE_ID)    ?: return
    val scheduledDate = intent.getStringExtra(AlarmAudioService.EXTRA_SCHEDULED_DATE) ?: return

    val serviceIntent = Intent(context, AlarmAudioService::class.java).apply {
      action = AlarmAudioService.ACTION_EXECUTE_BUTTON
      putExtra(AlarmAudioService.EXTRA_ACTION,         actionValue)
      putExtra(AlarmAudioService.EXTRA_SCHEDULE_ID,    scheduleId)
      putExtra(AlarmAudioService.EXTRA_SCHEDULED_DATE, scheduledDate)
    }
    context.startService(serviceIntent)
  }
}
