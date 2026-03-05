package expo.modules.alarm

import android.app.PendingIntent
import android.content.Context
import android.content.Intent

/**
 * Centralises the creation of PendingIntents so that ExpoAlarmModule and
 * AlarmReceiver both produce identical intents (same request code, same extras).
 * This is required for AlarmManager.cancel() to find and remove the alarm.
 */
internal object AlarmIntentHelper {

  // ── Request code ──────────────────────────────────────────────────────────

  /**
   * Deterministic, collision-resistant request code derived from the schedule
   * and date.  Using the same inputs always yields the same int, so we never
   * need to store the alarm ID anywhere.
   */
  fun requestCodeFor(scheduleId: String, scheduledDate: String): Int =
    (scheduleId + scheduledDate).hashCode()

  // ── Build PendingIntent for scheduling ────────────────────────────────────

  fun buildReceiverPendingIntent(context: Context, params: AlarmParams): PendingIntent {
    val requestCode = requestCodeFor(params.scheduleId, params.scheduledDate)
    val intent = Intent(context, AlarmReceiver::class.java).apply {
      putExtra(AlarmAudioService.EXTRA_SCHEDULE_ID,     params.scheduleId)
      putExtra(AlarmAudioService.EXTRA_MEDICATION_ID,   params.medicationId)
      putExtra(AlarmAudioService.EXTRA_SCHEDULED_DATE,  params.scheduledDate)
      putExtra(AlarmAudioService.EXTRA_SCHEDULED_TIME,  params.scheduledTime)
      putExtra(AlarmAudioService.EXTRA_MEDICATION_NAME, params.medicationName)
      putExtra(AlarmAudioService.EXTRA_DOSE,            params.dose)
    }
    return PendingIntent.getBroadcast(
      context,
      requestCode,
      intent,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    )
  }

  // ── Build PendingIntent for cancellation ──────────────────────────────────

  /**
   * Returns an existing PendingIntent matching [requestCode], or null if none
   * was found (meaning no alarm was scheduled, nothing to cancel).
   */
  fun buildCancelPendingIntent(context: Context, requestCode: Int): PendingIntent? {
    val intent = Intent(context, AlarmReceiver::class.java)
    return PendingIntent.getBroadcast(
      context,
      requestCode,
      intent,
      PendingIntent.FLAG_NO_CREATE or PendingIntent.FLAG_IMMUTABLE
    )
  }
}
