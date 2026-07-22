package expo.modules.alarm

import android.content.Context
import android.content.SharedPreferences
import org.json.JSONArray
import org.json.JSONObject

/**
 * Centralized SharedPreferences helper for alarm sound selection AND for
 * persisting the set of currently-armed alarms so they can be re-scheduled
 * after a device reboot (see BootReceiver / audit C4).
 *
 * Used by ExpoAlarmModule (JS-facing), AlarmAudioService (foreground service)
 * and BootReceiver. SharedPreferences is the right choice because those run
 * when the JS runtime and SQLite DB are unavailable.
 */
object AlarmPreferences {

  private const val PREFS_NAME = "pilloclock_alarm_prefs"

  /** null or empty → use the default bundled alarm.wav from res/raw/. */
  private const val KEY_SOUND_URI   = "alarm_sound_uri"
  private const val KEY_SOUND_TITLE = "alarm_sound_title"

  /** JSON array string of the alarms currently armed via AlarmManager. */
  private const val KEY_SCHEDULED_ALARMS = "scheduled_alarms"

  private fun prefs(context: Context): SharedPreferences =
    context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

  // ── Read ──────────────────────────────────────────────────────────────

  /** Returns the saved URI string, or null if the user chose the default. */
  fun getSoundUri(context: Context): String? =
    prefs(context).getString(KEY_SOUND_URI, null)?.ifEmpty { null }

  /** Returns the saved human-readable title, or null for the default. */
  fun getSoundTitle(context: Context): String? =
    prefs(context).getString(KEY_SOUND_TITLE, null)?.ifEmpty { null }

  // ── Write ─────────────────────────────────────────────────────────────

  /**
   * Persist the user's chosen alarm sound.
   * Pass null/empty uri to revert to the bundled default.
   */
  fun setSound(context: Context, uri: String?, title: String?) {
    prefs(context).edit()
      .putString(KEY_SOUND_URI, uri ?: "")
      .putString(KEY_SOUND_TITLE, title ?: "")
      .apply()
  }

  // ── Scheduled-alarm persistence (for reboot restore — audit C4) ──────────

  /** A snapshot of the params needed to re-arm a single alarm after reboot. */
  data class StoredAlarm(
    val scheduleId: String,
    val medicationId: String,
    val scheduledDate: String,
    val scheduledTime: String,
    val medicationName: String,
    val dose: String,
    val fireTimestamp: Long,
  )

  /** Records (or updates) an armed alarm. Keyed by (scheduleId, scheduledDate)
   *  so re-scheduling the same dose replaces rather than duplicates. */
  fun addScheduledAlarm(context: Context, alarm: StoredAlarm) {
    val rc = AlarmIntentHelper.requestCodeFor(alarm.scheduleId, alarm.scheduledDate)
    val next = getScheduledAlarms(context)
      .filterNot { AlarmIntentHelper.requestCodeFor(it.scheduleId, it.scheduledDate) == rc }
      .toMutableList()
    next.add(alarm)
    setScheduledAlarms(context, next)
  }

  /** Removes an armed alarm when its dose is cancelled. */
  fun removeScheduledAlarm(context: Context, scheduleId: String, scheduledDate: String) {
    val rc = AlarmIntentHelper.requestCodeFor(scheduleId, scheduledDate)
    setScheduledAlarms(
      context,
      getScheduledAlarms(context)
        .filterNot { AlarmIntentHelper.requestCodeFor(it.scheduleId, it.scheduledDate) == rc }
    )
  }

  fun getScheduledAlarms(context: Context): List<StoredAlarm> {
    val json = prefs(context).getString(KEY_SCHEDULED_ALARMS, null) ?: return emptyList()
    return try {
      val arr = JSONArray(json)
      (0 until arr.length()).mapNotNull { i ->
        val o = arr.optJSONObject(i) ?: return@mapNotNull null
        StoredAlarm(
          scheduleId = o.optString("scheduleId"),
          medicationId = o.optString("medicationId"),
          scheduledDate = o.optString("scheduledDate"),
          scheduledTime = o.optString("scheduledTime"),
          medicationName = o.optString("medicationName"),
          dose = o.optString("dose"),
          fireTimestamp = o.optLong("fireTimestamp"),
        )
      }
    } catch (e: Exception) {
      emptyList()
    }
  }

  /** Overwrites the stored set (used by BootReceiver to prune elapsed alarms). */
  fun setScheduledAlarms(context: Context, alarms: List<StoredAlarm>) {
    val arr = JSONArray()
    alarms.forEach { a ->
      arr.put(JSONObject().apply {
        put("scheduleId", a.scheduleId)
        put("medicationId", a.medicationId)
        put("scheduledDate", a.scheduledDate)
        put("scheduledTime", a.scheduledTime)
        put("medicationName", a.medicationName)
        put("dose", a.dose)
        put("fireTimestamp", a.fireTimestamp)
      })
    }
    prefs(context).edit().putString(KEY_SCHEDULED_ALARMS, arr.toString()).apply()
  }
}
