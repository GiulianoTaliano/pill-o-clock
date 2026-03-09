package expo.modules.alarm

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.ServiceInfo
import android.media.AudioAttributes
import android.media.AudioManager
import android.media.MediaPlayer
import android.net.Uri
import android.os.Build
import android.os.IBinder
import android.os.PowerManager
import android.util.Log
import androidx.core.app.NotificationCompat

/**
 * Foreground service that:
 *  1. Acquires a SCREEN_BRIGHT_WAKE_LOCK so the device wakes from deep sleep.
 *  2. Plays alarm.wav on AudioManager.STREAM_ALARM — sounds even in silent /
 *     Do Not Disturb mode, because Android always honours the alarm stream.
 *  3. Posts a MAX-priority, CATEGORY_ALARM notification with fullScreenIntent
 *     so the alarm screen appears above the lock screen without any tap.
 *  4. Launches the React Native alarm screen via deep link so the JS UI is
 *     visible while the user is already in the app (foreground case).
 *  5. Exposes Take / Snooze / Skip quick-action buttons on the notification.
 *  6. If the user swipes the notification away (Android 14+), silences the
 *     alarm and posts a quiet reminder so the dose is not forgotten.
 *
 * Stopped by broadcasting ACTION_STOP (sent from ExpoAlarmModule.stopAlarm()
 * or from AlarmActionReceiver when a button is tapped).
 */
class AlarmAudioService : Service() {

  // ── Constants ──────────────────────────────────────────────────────────────

  companion object {
    const val ACTION_START          = "expo.modules.alarm.ACTION_START"
    const val ACTION_STOP           = "expo.modules.alarm.ACTION_STOP"
    /** Broadcast sent by the notification's deleteIntent when the user swipes it away. */
    const val ACTION_DISMISS        = "expo.modules.alarm.ACTION_DISMISS"
    /**
     * Sent by AlarmActionReceiver when the user taps a quick-action button.
     * The foreground service handles it because only a Service (not a bare
     * BroadcastReceiver) is allowed to start activities on Android 10+.
     */
    const val ACTION_EXECUTE_BUTTON = "expo.modules.alarm.ACTION_EXECUTE_BUTTON"

    // Intent extras — mirrored in AlarmIntentHelper
    const val EXTRA_SCHEDULE_ID     = "scheduleId"
    const val EXTRA_MEDICATION_ID   = "medicationId"
    const val EXTRA_SCHEDULED_DATE  = "scheduledDate"
    const val EXTRA_SCHEDULED_TIME  = "scheduledTime"
    const val EXTRA_MEDICATION_NAME = "medicationName"
    const val EXTRA_DOSE            = "dose"
    /** Value passed in the notification action extras — "taken" | "snooze" | "skipped". */
    const val EXTRA_ACTION          = "alarmAction"

    // Action-value constants shared with AlarmActionReceiver and alarm.tsx
    const val ACTION_VALUE_TAKEN  = "taken"
    const val ACTION_VALUE_SNOOZE = "snooze"
    const val ACTION_VALUE_SKIP   = "skipped"

    private const val ALARM_NOTIF_ID    = 8471   // must not clash with expo-notifications
    private const val SILENT_NOTIF_ID   = 8472   // silent reminder after dismiss
    private const val ALARM_CHANNEL_ID  = "pill-alarms-v1"
    private const val SILENT_CHANNEL_ID = "pill-reminders-silent-v1"
    private const val TAG               = "AlarmAudioService"
    private const val WAKE_LOCK_TAG     = "PillOClock:AlarmWakeLock"
  }

  // ── State ──────────────────────────────────────────────────────────────────

  private var mediaPlayer: MediaPlayer? = null
  private var wakeLock: PowerManager.WakeLock? = null

  // Cached payload so the dismiss handler can post a silent reminder
  // without needing access to the original Intent extras.
  private var cachedScheduleId    = ""
  private var cachedScheduledDate = ""
  private var cachedScheduledTime = ""
  private var cachedMedName       = ""
  private var cachedDose          = ""

  /**
   * Listens for ACTION_STOP — sent by ExpoAlarmModule.stopAlarm() and by
   * AlarmActionReceiver when the user taps a quick-action button.
   */
  private val stopReceiver = object : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
      stopSelf()
    }
  }

  /**
   * Listens for ACTION_DISMISS — sent by the notification deleteIntent when the
   * user swipes the alarm notification away on Android 14+.
   * Silences the alarm and posts a quiet tap-to-open reminder.
   */
  private val dismissReceiver = object : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
      postSilentReminder()
      stopSelf()
    }
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  override fun onCreate() {
    super.onCreate()

    val stopFilter = IntentFilter(ACTION_STOP)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
      registerReceiver(stopReceiver, stopFilter, RECEIVER_NOT_EXPORTED)
    } else {
      @Suppress("UnspecifiedRegisterReceiverFlag")
      registerReceiver(stopReceiver, stopFilter)
    }

    val dismissFilter = IntentFilter(ACTION_DISMISS)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
      registerReceiver(dismissReceiver, dismissFilter, RECEIVER_NOT_EXPORTED)
    } else {
      @Suppress("UnspecifiedRegisterReceiverFlag")
      registerReceiver(dismissReceiver, dismissFilter)
    }
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    if (intent?.action == ACTION_STOP) {
      stopSelf()
      return START_NOT_STICKY
    }

    // ── Quick-action button: stop alarm + launch alarm screen with action param ─
    // Routed here from AlarmActionReceiver so that startActivity() runs in a
    // foreground-service context, which is allowed on Android 10+.
    if (intent?.action == ACTION_EXECUTE_BUTTON) {
      val scheduleId    = intent.getStringExtra(EXTRA_SCHEDULE_ID)    ?: ""
      val scheduledDate = intent.getStringExtra(EXTRA_SCHEDULED_DATE) ?: ""
      val actionValue   = intent.getStringExtra(EXTRA_ACTION)         ?: ""
      // If this service instance was just created (not already in foreground),
      // we must call startForeground() within 5 s to satisfy Android 8+ rules.
      // Use a minimal, instantly-dismissed notification.
      ensureNotificationChannels()
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
        startForeground(ALARM_NOTIF_ID,
          NotificationCompat.Builder(this, ALARM_CHANNEL_ID).build(),
          ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK)
      } else {
        startForeground(ALARM_NOTIF_ID,
          NotificationCompat.Builder(this, ALARM_CHANNEL_ID).build())
      }
      if (scheduleId.isNotEmpty() && actionValue.isNotEmpty()) {
        launchAlarmScreenWithAction(scheduleId, scheduledDate, actionValue)
      }
      stopSelf()
      return START_NOT_STICKY
    }

    // ── Extract payload ──────────────────────────────────────────────────────
    val scheduleId    = intent?.getStringExtra(EXTRA_SCHEDULE_ID)    ?: run { stopSelf(); return START_NOT_STICKY }
    val medicationId  = intent.getStringExtra(EXTRA_MEDICATION_ID)   ?: ""
    val scheduledDate = intent.getStringExtra(EXTRA_SCHEDULED_DATE)  ?: ""
    val scheduledTime = intent.getStringExtra(EXTRA_SCHEDULED_TIME)  ?: ""
    val medName       = intent.getStringExtra(EXTRA_MEDICATION_NAME) ?: ""
    val dose          = intent.getStringExtra(EXTRA_DOSE)            ?: ""

    // Cache for dismiss handler
    cachedScheduleId    = scheduleId
    cachedScheduledDate = scheduledDate
    cachedScheduledTime = scheduledTime
    cachedMedName       = medName
    cachedDose          = dose

    // ── Wake the display ─────────────────────────────────────────────────────
    val pm = getSystemService(Context.POWER_SERVICE) as PowerManager
    @Suppress("DEPRECATION")
    wakeLock = pm.newWakeLock(
      PowerManager.SCREEN_BRIGHT_WAKE_LOCK or PowerManager.ACQUIRE_CAUSES_WAKEUP,
      WAKE_LOCK_TAG
    ).also { it.acquire(10 * 60 * 1000L) }

    // ── Start as foreground ASAP (must happen within 5 s of startForegroundService) ─
    ensureNotificationChannels()
    val notification = buildAlarmNotification(scheduleId, medicationId, scheduledDate, scheduledTime, medName, dose)

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
      startForeground(ALARM_NOTIF_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK)
    } else {
      startForeground(ALARM_NOTIF_ID, notification)
    }

    // ── Open the React Native alarm screen ───────────────────────────────────
    // Works both when the app is in the foreground (single-top navigation) and
    // when it needs to be launched cold (new task).
    // fullScreenIntent on the notification handles the lock-screen case.
    launchAlarmScreen(scheduleId, scheduledDate)

    // ── Play alarm audio ─────────────────────────────────────────────────────
    playAlarm()

    return START_NOT_STICKY
  }

  override fun onDestroy() {
    super.onDestroy()

    unregisterReceiver(stopReceiver)
    unregisterReceiver(dismissReceiver)

    mediaPlayer?.runCatching { if (isPlaying) stop(); release() }
    mediaPlayer = null

    wakeLock?.runCatching { if (isHeld) release() }
    wakeLock = null

    // Dismiss the ongoing alarm notification from the shade.
    // Note: this does NOT fire the deleteIntent (that only fires on user swipe).
    (getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager)
      .cancel(ALARM_NOTIF_ID)
  }

  override fun onBind(intent: Intent?): IBinder? = null

  // ── Private helpers ────────────────────────────────────────────────────────

  private fun buildAlarmUri(scheduleId: String, scheduledDate: String): Uri =
    Uri.parse(
      "pilloclock://alarm?scheduleId=${Uri.encode(scheduleId)}&date=${Uri.encode(scheduledDate)}"
    )

  private fun buildAlarmPendingIntent(
    scheduleId: String,
    scheduledDate: String,
    pendingFlags: Int,
    requestCode: Int = scheduleId.hashCode(),
  ): PendingIntent {
    val intent = Intent(Intent.ACTION_VIEW, buildAlarmUri(scheduleId, scheduledDate)).apply {
      flags = Intent.FLAG_ACTIVITY_NEW_TASK or
              Intent.FLAG_ACTIVITY_SINGLE_TOP or
              Intent.FLAG_ACTIVITY_REORDER_TO_FRONT
      setPackage(packageName)
    }
    return PendingIntent.getActivity(this, requestCode, intent, pendingFlags)
  }

  private fun buildActionPendingIntent(
    scheduleId: String,
    medicationId: String,
    scheduledDate: String,
    scheduledTime: String,
    medName: String,
    dose: String,
    actionValue: String,
    requestCode: Int,
    pendingFlags: Int,
  ): PendingIntent {
    // Explicit broadcast targeting AlarmActionReceiver by class so that the
    // PendingIntent is delivered even though the receiver has no <intent-filter>.
    val intent = Intent(this, AlarmActionReceiver::class.java).apply {
      action = AlarmActionReceiver.ACTION_ALARM_BUTTON
      putExtra(EXTRA_SCHEDULE_ID,     scheduleId)
      putExtra(EXTRA_MEDICATION_ID,   medicationId)
      putExtra(EXTRA_SCHEDULED_DATE,  scheduledDate)
      putExtra(EXTRA_SCHEDULED_TIME,  scheduledTime)
      putExtra(EXTRA_MEDICATION_NAME, medName)
      putExtra(EXTRA_DOSE,            dose)
      putExtra(EXTRA_ACTION,          actionValue)
    }
    return PendingIntent.getBroadcast(this, requestCode, intent, pendingFlags)
  }

  private fun launchAlarmScreen(scheduleId: String, scheduledDate: String) {
    val launchIntent = Intent(Intent.ACTION_VIEW, buildAlarmUri(scheduleId, scheduledDate)).apply {
      flags = Intent.FLAG_ACTIVITY_NEW_TASK or
              Intent.FLAG_ACTIVITY_SINGLE_TOP or
              Intent.FLAG_ACTIVITY_REORDER_TO_FRONT
      setPackage(packageName)
    }
    try {
      startActivity(launchIntent)
    } catch (e: Exception) {
      Log.w(TAG, "Could not launch alarm screen via deep link: ${e.message}")
    }
  }

  /** Launches alarm screen carrying an `action=` param so alarm.tsx persists the result silently. */
  private fun launchAlarmScreenWithAction(scheduleId: String, scheduledDate: String, actionValue: String) {
    val uri = Uri.parse(
      "pilloclock://alarm" +
      "?scheduleId=${Uri.encode(scheduleId)}" +
      "&date=${Uri.encode(scheduledDate)}" +
      "&action=${Uri.encode(actionValue)}"
    )
    val launchIntent = Intent(Intent.ACTION_VIEW, uri).apply {
      flags = Intent.FLAG_ACTIVITY_NEW_TASK or
              Intent.FLAG_ACTIVITY_SINGLE_TOP or
              Intent.FLAG_ACTIVITY_REORDER_TO_FRONT
      setPackage(packageName)
    }
    try {
      startActivity(launchIntent)
    } catch (e: Exception) {
      Log.w(TAG, "Could not launch alarm screen with action: ${e.message}")
    }
  }

  private fun playAlarm() {
    // Resolve alarm.wav from res/raw/ (placed there by expo-notifications plugin).
    // Falls back to the system default alarm if the file is missing.
    val resId = resources.getIdentifier("alarm", "raw", packageName)
    val uri = if (resId != 0) {
      Uri.parse("android.resource://$packageName/$resId")
    } else {
      android.provider.Settings.System.DEFAULT_ALARM_ALERT_URI
    }

    mediaPlayer?.release()
    mediaPlayer = MediaPlayer().apply {
      setAudioAttributes(
        AudioAttributes.Builder()
          // USAGE_ALARM routes audio to Android's alarm volume channel,
          // which is independent of the ringer and plays in silent mode.
          .setUsage(AudioAttributes.USAGE_ALARM)
          .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
          .setLegacyStreamType(AudioManager.STREAM_ALARM)
          .build()
      )
      setDataSource(applicationContext, uri)
      isLooping = true
      prepare()
      start()
    }
  }

  private fun buildAlarmNotification(
    scheduleId: String,
    medicationId: String,
    scheduledDate: String,
    scheduledTime: String,
    medName: String,
    dose: String,
  ): Notification {
    val pendingFlags = PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    val baseCode = scheduleId.hashCode()

    // Content / fullScreenIntent
    val contentPendingIntent = buildAlarmPendingIntent(scheduleId, scheduledDate, pendingFlags, baseCode)

    // Delete intent — fires ONLY when the user swipes the notification away (not on programmatic cancel).
    val dismissBroadcast = Intent(ACTION_DISMISS).apply { setPackage(packageName) }
    val deletePendingIntent = PendingIntent.getBroadcast(
      this, baseCode + 10, dismissBroadcast, pendingFlags
    )

    // Quick-action buttons
    val takenPI  = buildActionPendingIntent(scheduleId, medicationId, scheduledDate, scheduledTime, medName, dose, ACTION_VALUE_TAKEN,  baseCode + 1, pendingFlags)
    val snoozePI = buildActionPendingIntent(scheduleId, medicationId, scheduledDate, scheduledTime, medName, dose, ACTION_VALUE_SNOOZE, baseCode + 2, pendingFlags)
    val skipPI   = buildActionPendingIntent(scheduleId, medicationId, scheduledDate, scheduledTime, medName, dose, ACTION_VALUE_SKIP,   baseCode + 3, pendingFlags)

    // Check fullScreenIntent permission on API 34+ (requires user grant in Settings).
    val canFullScreen = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
      (getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager)
        .canUseFullScreenIntent()
    } else {
      true
    }

    return NotificationCompat.Builder(this, ALARM_CHANNEL_ID)
      .setSmallIcon(android.R.drawable.ic_lock_idle_alarm)
      .setContentTitle(medName)
      .setContentText("$dose · $scheduledTime")
      .setPriority(NotificationCompat.PRIORITY_MAX)
      .setCategory(NotificationCompat.CATEGORY_ALARM)
      // VISIBILITY_PUBLIC ensures the notification content is shown on lock screen
      // without requiring the user to unlock first.
      .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
      .setContentIntent(contentPendingIntent)
      .setDeleteIntent(deletePendingIntent)
      .apply {
        if (canFullScreen) setFullScreenIntent(contentPendingIntent, /* highPriority= */ true)
      }
      // Quick-action buttons
      .addAction(android.R.drawable.ic_menu_send,               "✅ Tomé el medicamento", takenPI)
      .addAction(android.R.drawable.ic_popup_reminder,          "⏰ Posponer 15 min",     snoozePI)
      .addAction(android.R.drawable.ic_menu_close_clear_cancel, "❌ Omitir",              skipPI)
      // Sound is handled by MediaPlayer on STREAM_ALARM — setting it on the
      // notification would play it twice and through the wrong audio channel.
      .setSound(null)
      .setVibrate(null)
      .setAutoCancel(false)
      .setOngoing(true)
      .build()
  }

  /**
   * Posts a silent, tap-to-open reminder notification after the user swipes
   * the alarm notification away.  This keeps the dose visible in the shade
   * without continuing to play audio.
   */
  private fun postSilentReminder() {
    if (cachedScheduleId.isEmpty()) return
    ensureNotificationChannels()
    val pendingFlags = PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    val contentPendingIntent = buildAlarmPendingIntent(cachedScheduleId, cachedScheduledDate, pendingFlags)

    val notification = NotificationCompat.Builder(this, SILENT_CHANNEL_ID)
      .setSmallIcon(android.R.drawable.ic_lock_idle_alarm)
      .setContentTitle(cachedMedName)
      .setContentText("$cachedDose · $cachedScheduledTime")
      .setPriority(NotificationCompat.PRIORITY_HIGH)
      .setCategory(NotificationCompat.CATEGORY_REMINDER)
      .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
      .setContentIntent(contentPendingIntent)
      .setAutoCancel(true)
      .setOngoing(false)
      .setSound(null)
      .build()

    (getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager)
      .notify(SILENT_NOTIF_ID, notification)
  }

  private fun ensureNotificationChannels() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager

    if (nm.getNotificationChannel(ALARM_CHANNEL_ID) == null) {
      nm.createNotificationChannel(NotificationChannel(
        ALARM_CHANNEL_ID,
        "Alarmas de medicamentos",
        NotificationManager.IMPORTANCE_HIGH
      ).apply {
        description = "Canal para alarmas de toma de medicamentos"
        // Silence the channel — audio is handled by MediaPlayer on STREAM_ALARM.
        setSound(null, null)
        enableLights(true)
        lightColor = 0xFF4f9cff.toInt()
        enableVibration(false)
        lockscreenVisibility = Notification.VISIBILITY_PUBLIC
        setBypassDnd(true)
      })
    }

    if (nm.getNotificationChannel(SILENT_CHANNEL_ID) == null) {
      nm.createNotificationChannel(NotificationChannel(
        SILENT_CHANNEL_ID,
        "Recordatorios silenciosos",
        NotificationManager.IMPORTANCE_DEFAULT
      ).apply {
        description = "Recordatorio silencioso luego de descartar la alarma"
        setSound(null, null)
        enableVibration(false)
        lockscreenVisibility = Notification.VISIBILITY_PUBLIC
      })
    }
  }
}
