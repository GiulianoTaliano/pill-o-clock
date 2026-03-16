package expo.modules.alarm

import android.content.Context
import android.content.SharedPreferences

/**
 * Centralized SharedPreferences helper for alarm sound selection.
 * Used by both ExpoAlarmModule (JS-facing) and AlarmAudioService (foreground service).
 *
 * SharedPreferences is the right choice because AlarmAudioService may run
 * when the JS runtime and SQLite DB are unavailable.
 */
object AlarmPreferences {

  private const val PREFS_NAME = "pilloclock_alarm_prefs"

  /** null or empty → use the default bundled alarm.wav from res/raw/. */
  private const val KEY_SOUND_URI   = "alarm_sound_uri"
  private const val KEY_SOUND_TITLE = "alarm_sound_title"

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
}
