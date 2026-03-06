package expo.modules.alarm

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.net.Uri

/**
 * Handles taps on the quick-action buttons (Take / Snooze / Skip) that are
 * embedded in the alarm notification.
 *
 * For each action:
 *  1. Broadcasts ACTION_STOP so AlarmAudioService silences the alarm
 *     immediately, even before the app is fully in the foreground.
 *  2. Launches the React Native alarm screen with an `action=` query
 *     parameter so the JS layer can persist the result to the database and
 *     navigate away without showing the full alarm UI.
 */
class AlarmActionReceiver : BroadcastReceiver() {

  companion object {
    const val ACTION_ALARM_BUTTON = "expo.modules.alarm.ACTION_ALARM_BUTTON"
  }

  override fun onReceive(context: Context, intent: Intent) {
    val actionValue   = intent.getStringExtra(AlarmAudioService.EXTRA_ACTION)         ?: return
    val scheduleId    = intent.getStringExtra(AlarmAudioService.EXTRA_SCHEDULE_ID)    ?: return
    val scheduledDate = intent.getStringExtra(AlarmAudioService.EXTRA_SCHEDULED_DATE) ?: return

    // 1. Stop the alarm audio immediately (safe no-op if service is not running).
    context.sendBroadcast(Intent(AlarmAudioService.ACTION_STOP).apply {
      setPackage(context.packageName)
    })

    // 2. Open the alarm screen with the action parameter.
    //    alarm.tsx reads `action` on mount, executes silently, and pops back.
    val uri = Uri.parse(
      "pilloclock://alarm" +
      "?scheduleId=${Uri.encode(scheduleId)}" +
      "&date=${Uri.encode(scheduledDate)}" +
      "&action=${Uri.encode(actionValue)}"
    )
    context.startActivity(
      Intent(Intent.ACTION_VIEW, uri).apply {
        flags = Intent.FLAG_ACTIVITY_NEW_TASK or
                Intent.FLAG_ACTIVITY_SINGLE_TOP or
                Intent.FLAG_ACTIVITY_REORDER_TO_FRONT
        setPackage(context.packageName)
      }
    )
  }
}
