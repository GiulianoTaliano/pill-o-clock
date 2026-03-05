package expo.modules.alarm

import android.app.AlarmManager
import android.app.NotificationManager
import android.content.Context
import android.content.Intent
import android.os.Build
import androidx.core.content.ContextCompat
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.records.Field
import expo.modules.kotlin.records.Record

// ─── AlarmParams record ────────────────────────────────────────────────────

/**
 * Mirrors AlarmParams in src/ExpoAlarm.types.ts.
 * Expo Modules API deserialises JS objects into Records automatically.
 */
class AlarmParams : Record {
  @Field val scheduleId: String = ""
  @Field val medicationId: String = ""
  @Field val scheduledDate: String = ""
  @Field val scheduledTime: String = ""
  @Field val medicationName: String = ""
  @Field val dose: String = ""
  /** Unix timestamp in milliseconds — matches JS Date.getTime(). */
  @Field val fireTimestamp: Long = 0L
}

// ─── Module ────────────────────────────────────────────────────────────────

class ExpoAlarmModule : Module() {

  private val context: Context
    get() = requireNotNull(appContext.reactContext) { "React context is null" }

  override fun definition() = ModuleDefinition {

    Name("ExpoAlarm")

    // ── scheduleAlarm ──────────────────────────────────────────────────────
    AsyncFunction("scheduleAlarm") { params: AlarmParams ->
      val alarmManager =
        context.getSystemService(Context.ALARM_SERVICE) as AlarmManager

      val pendingIntent = AlarmIntentHelper.buildReceiverPendingIntent(context, params)

      // setAlarmClock() is the gold standard for user-facing alarms:
      // • Bypasses Doze idle and battery optimisation without any permission on API 21+.
      // • Shows a clock icon in the status bar.
      // • Does NOT require SCHEDULE_EXACT_ALARM (unlike setExact on API 31+).
      val clockInfo = AlarmManager.AlarmClockInfo(params.fireTimestamp, null)
      alarmManager.setAlarmClock(clockInfo, pendingIntent)
    }

    // ── cancelAlarm ────────────────────────────────────────────────────────
    AsyncFunction("cancelAlarm") { scheduleId: String, scheduledDate: String ->
      val alarmManager =
        context.getSystemService(Context.ALARM_SERVICE) as AlarmManager

      // Rebuild the same PendingIntent that was used to schedule — same
      // request code + same intent = cancel succeeds even without storing the ID.
      val requestCode = AlarmIntentHelper.requestCodeFor(scheduleId, scheduledDate)
      val pendingIntent = AlarmIntentHelper.buildCancelPendingIntent(
        context, requestCode
      ) ?: return@AsyncFunction

      alarmManager.cancel(pendingIntent)
      pendingIntent.cancel()
    }

    // ── stopAlarm ──────────────────────────────────────────────────────────
    AsyncFunction("stopAlarm") {
      // Sends the STOP broadcast to AlarmAudioService regardless of whether
      // it's currently running — safe as a no-op if not running.
      val stopIntent = Intent(AlarmAudioService.ACTION_STOP).apply {
        setPackage(context.packageName)
      }
      context.sendBroadcast(stopIntent)
    }

    // ── checkFullScreenIntentPermission ────────────────────────────────────
    AsyncFunction("checkFullScreenIntentPermission") {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
        val nm = context.getSystemService(Context.NOTIFICATION_SERVICE)
            as NotificationManager
        nm.canUseFullScreenIntent()
      } else {
        true
      }
    }
  }
}
