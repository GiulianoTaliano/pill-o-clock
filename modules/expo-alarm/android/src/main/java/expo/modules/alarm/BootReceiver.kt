package expo.modules.alarm

import android.app.AlarmManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log

/**
 * Re-arms all future medication alarms after a device reboot or an app update.
 *
 * Android clears EVERY AlarmManager alarm on reboot. The app's only other
 * reschedule mechanism (expo-background-fetch with startOnBoot) merely
 * re-REGISTERS the periodic task after boot — it does not run at boot and can be
 * delayed for hours (or skipped) by Doze/battery-saver. Without this receiver a
 * reboot silently wipes every dose alarm until the app is next opened, which is
 * a direct missed-medication path (audit C4).
 *
 * Each alarm's params are persisted in SharedPreferences by
 * ExpoAlarmModule.scheduleAlarm; here we read them back and re-arm the ones that
 * are still in the future, using the exact same PendingIntent (deterministic
 * request code + FLAG_UPDATE_CURRENT), so this can never create duplicates.
 */
class BootReceiver : BroadcastReceiver() {

  override fun onReceive(context: Context, intent: Intent) {
    val action = intent.action
    if (action != Intent.ACTION_BOOT_COMPLETED &&
      action != "android.intent.action.QUICKBOOT_POWERON" &&
      action != Intent.ACTION_MY_PACKAGE_REPLACED
    ) {
      return
    }

    val alarmManager =
      context.getSystemService(Context.ALARM_SERVICE) as? AlarmManager ?: return
    val now = System.currentTimeMillis()

    val stored = AlarmPreferences.getScheduledAlarms(context)
    val stillFuture = ArrayList<AlarmPreferences.StoredAlarm>(stored.size)

    for (alarm in stored) {
      // Drop alarms whose time elapsed while the device was powered off.
      if (alarm.fireTimestamp <= now) continue

      try {
        val pendingIntent = AlarmIntentHelper.buildReceiverPendingIntent(
          context,
          alarm.scheduleId,
          alarm.medicationId,
          alarm.scheduledDate,
          alarm.scheduledTime,
          alarm.medicationName,
          alarm.dose,
          repeatCount = alarm.repeatCount,
        )
        // setAlarmClock() needs no permission and bypasses Doze (same call
        // ExpoAlarmModule.scheduleAlarm uses).
        val clockInfo = AlarmManager.AlarmClockInfo(alarm.fireTimestamp, null)
        alarmManager.setAlarmClock(clockInfo, pendingIntent)
        stillFuture.add(alarm)
      } catch (e: Exception) {
        Log.w("BootReceiver", "Failed to re-arm alarm ${alarm.scheduleId}", e)
      }
    }

    // Prune elapsed alarms from storage so it doesn't grow unbounded.
    if (stillFuture.size != stored.size) {
      AlarmPreferences.setScheduledAlarms(context, stillFuture)
    }
  }
}
