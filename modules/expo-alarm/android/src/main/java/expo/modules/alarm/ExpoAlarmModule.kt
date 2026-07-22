package expo.modules.alarm

import android.app.AlarmManager
import android.app.NotificationManager
import android.content.Context
import android.content.Intent
import android.media.AudioAttributes
import android.media.AudioManager
import android.media.MediaPlayer
import android.media.RingtoneManager
import android.net.Uri
import android.os.Build
import android.util.Log
import android.view.WindowManager
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

  /** Reusable MediaPlayer for sound previews — released on stop or module teardown. */
  private var previewPlayer: MediaPlayer? = null

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

      // Persist so BootReceiver can re-arm this alarm after a reboot, which
      // otherwise wipes all AlarmManager alarms (audit C4).
      AlarmPreferences.addScheduledAlarm(
        context,
        AlarmPreferences.StoredAlarm(
          scheduleId = params.scheduleId,
          medicationId = params.medicationId,
          scheduledDate = params.scheduledDate,
          scheduledTime = params.scheduledTime,
          medicationName = params.medicationName,
          dose = params.dose,
          fireTimestamp = params.fireTimestamp,
        )
      )
    }

    // ── cancelAlarm ────────────────────────────────────────────────────────
    AsyncFunction("cancelAlarm") { scheduleId: String, scheduledDate: String ->
      val alarmManager =
        context.getSystemService(Context.ALARM_SERVICE) as AlarmManager

      // Drop it from the persisted set first so a later reboot never resurrects
      // it, even if there's no live PendingIntent to cancel below (audit C4).
      AlarmPreferences.removeScheduledAlarm(context, scheduleId, scheduledDate)

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
    // ── requestFullScreenIntentPermission ──────────────────────────────
    // Opens the system settings page where the user can grant USE_FULL_SCREEN_INTENT.
    // Only relevant on Android 14+ (API 34); a no-op on older versions.
    AsyncFunction("requestFullScreenIntentPermission") {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
        // ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENTS constant added in API 34;
        // use the string literal so this compiles against any SDK >= 34.
        val intent = Intent("android.settings.MANAGE_APP_USE_FULL_SCREEN_INTENTS").apply {
          data = Uri.parse("package:${context.packageName}")
          addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        context.startActivity(intent)
      }
    }
    // ── setAlarmWindowFlags ────────────────────────────────────────────────
    // Tells Android to keep the alarm screen visible over the lock screen
    // and to wake/turn on the display as soon as the activity is foregrounded.
    // Must be called from the JS alarm screen on mount.
    AsyncFunction("setAlarmWindowFlags") {
      val activity = appContext.currentActivity ?: return@AsyncFunction null
      activity.runOnUiThread {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
          activity.setShowWhenLocked(true)
          activity.setTurnScreenOn(true)
        } else {
          @Suppress("DEPRECATION")
          activity.window.addFlags(
            WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or
            WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON or
            WindowManager.LayoutParams.FLAG_DISMISS_KEYGUARD
          )
        }
      }
    }

    // ── clearAlarmWindowFlags ──────────────────────────────────────────────
    // Removes the lock-screen / wake-up flags once the alarm screen is
    // dismissed so they don't bleed into other app screens.
    AsyncFunction("clearAlarmWindowFlags") {
      val activity = appContext.currentActivity ?: return@AsyncFunction null
      activity.runOnUiThread {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
          activity.setShowWhenLocked(false)
          activity.setTurnScreenOn(false)
        } else {
          @Suppress("DEPRECATION")
          activity.window.clearFlags(
            WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or
            WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON or
            WindowManager.LayoutParams.FLAG_DISMISS_KEYGUARD
          )
        }
      }
    }

    // ── getAvailableAlarmSounds ────────────────────────────────────────────
    // Returns an array of {uri, title} objects for all system alarm sounds
    // plus the bundled default. Uses RingtoneManager.TYPE_ALARM.
    AsyncFunction("getAvailableAlarmSounds") {
      val sounds = mutableListOf<Map<String, String>>()

      // First entry: bundled default alarm.wav
      val resId = context.resources.getIdentifier("alarm", "raw", context.packageName)
      if (resId != 0) {
        sounds.add(mapOf(
          "uri" to "",
          "title" to "Pill O-Clock"
        ))
      }

      // System alarm sounds via RingtoneManager
      val ringtoneManager = RingtoneManager(context)
      ringtoneManager.setType(RingtoneManager.TYPE_ALARM)
      val cursor = ringtoneManager.cursor
      while (cursor.moveToNext()) {
        val title = cursor.getString(RingtoneManager.TITLE_COLUMN_INDEX)
        val uri = ringtoneManager.getRingtoneUri(cursor.position).toString()
        sounds.add(mapOf("uri" to uri, "title" to title))
      }

      sounds
    }

    // ── previewAlarmSound ──────────────────────────────────────────────────
    // Plays a short preview of the given sound URI on STREAM_ALARM.
    // Pass empty string or null to preview the bundled default.
    AsyncFunction("previewAlarmSound") { uri: String ->
      stopPreviewInternal()

      val resolvedUri = if (uri.isEmpty()) {
        val resId = context.resources.getIdentifier("alarm", "raw", context.packageName)
        if (resId != 0) Uri.parse("android.resource://${context.packageName}/$resId")
        else android.provider.Settings.System.DEFAULT_ALARM_ALERT_URI
      } else {
        Uri.parse(uri)
      }

      previewPlayer = MediaPlayer().apply {
        setAudioAttributes(
          AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_ALARM)
            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
            .setLegacyStreamType(AudioManager.STREAM_ALARM)
            .build()
        )
        setDataSource(context, resolvedUri)
        isLooping = false
        setOnCompletionListener { stopPreviewInternal() }
        prepare()
        start()
      }
    }

    // ── stopSoundPreview ───────────────────────────────────────────────────
    AsyncFunction("stopSoundPreview") {
      stopPreviewInternal()
    }

    // ── setAlarmSound ──────────────────────────────────────────────────────
    // Persists the user's alarm sound choice to SharedPreferences.
    // Empty uri = revert to bundled default.
    AsyncFunction("setAlarmSound") { uri: String, title: String ->
      AlarmPreferences.setSound(context, uri.ifEmpty { null }, title.ifEmpty { null })
    }

    // ── getAlarmSound ──────────────────────────────────────────────────────
    // Returns the current selection {uri, title} or {uri: "", title: ""} for default.
    AsyncFunction("getAlarmSound") {
      mapOf(
        "uri" to (AlarmPreferences.getSoundUri(context) ?: ""),
        "title" to (AlarmPreferences.getSoundTitle(context) ?: "")
      )
    }
  }

  // ── Helpers ──────────────────────────────────────────────────────────────

  private fun stopPreviewInternal() {
    previewPlayer?.runCatching { if (isPlaying) stop(); release() }
    previewPlayer = null
  }
}
