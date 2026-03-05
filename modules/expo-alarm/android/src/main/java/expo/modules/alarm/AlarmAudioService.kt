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
 *     so the alarm screen appears above the lock screen.
 *  4. Launches the React Native alarm screen via deep link so the JS UI is
 *     visible while the user is already in the app (foreground case).
 *
 * Stopped by broadcasting ACTION_STOP (sent from ExpoAlarmModule.stopAlarm()
 * and from the notification's dismiss action).
 */
class AlarmAudioService : Service() {

  // ── Constants ──────────────────────────────────────────────────────────────

  companion object {
    const val ACTION_START = "expo.modules.alarm.ACTION_START"
    const val ACTION_STOP  = "expo.modules.alarm.ACTION_STOP"

    // Intent extras — mirrored in AlarmIntentHelper
    const val EXTRA_SCHEDULE_ID     = "scheduleId"
    const val EXTRA_MEDICATION_ID   = "medicationId"
    const val EXTRA_SCHEDULED_DATE  = "scheduledDate"
    const val EXTRA_SCHEDULED_TIME  = "scheduledTime"
    const val EXTRA_MEDICATION_NAME = "medicationName"
    const val EXTRA_DOSE            = "dose"

    private const val NOTIFICATION_ID  = 8471        // must not clash with expo-notifications
    private const val ALARM_CHANNEL_ID = "pill-alarms-v1"
    private const val TAG              = "AlarmAudioService"
    private const val WAKE_LOCK_TAG    = "PillOClock:AlarmWakeLock"
  }

  // ── State ──────────────────────────────────────────────────────────────────

  private var mediaPlayer: MediaPlayer? = null
  private var wakeLock: PowerManager.WakeLock? = null

  /**
   * Inner BroadcastReceiver that listens for ACTION_STOP.
   * Registered dynamically so it it only active while the service is alive.
   */
  private val stopReceiver = object : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
      stopSelf()
    }
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  override fun onCreate() {
    super.onCreate()
    val filter = IntentFilter(ACTION_STOP)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
      registerReceiver(stopReceiver, filter, RECEIVER_NOT_EXPORTED)
    } else {
      @Suppress("UnspecifiedRegisterReceiverFlag")
      registerReceiver(stopReceiver, filter)
    }
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    if (intent?.action == ACTION_STOP) {
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

    // ── Wake the display ─────────────────────────────────────────────────────
    // SCREEN_BRIGHT_WAKE_LOCK + ACQUIRE_CAUSES_WAKEUP wakes a sleeping device.
    // Capped at 10 minutes so we never permanently drain the battery.
    val pm = getSystemService(Context.POWER_SERVICE) as PowerManager
    @Suppress("DEPRECATION")
    wakeLock = pm.newWakeLock(
      PowerManager.SCREEN_BRIGHT_WAKE_LOCK or PowerManager.ACQUIRE_CAUSES_WAKEUP,
      WAKE_LOCK_TAG
    ).also { it.acquire(10 * 60 * 1000L) }

    // ── Start as foreground ASAP (must happen within 5 s of startForegroundService) ─
    ensureNotificationChannel()
    val notification = buildNotification(scheduleId, medicationId, scheduledDate, scheduledTime, medName, dose)

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
      // API 34+: foreground service type must be declared.
      // Using MEDIA_PLAYBACK since the service plays audio on STREAM_ALARM.
      startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK)
    } else {
      startForeground(NOTIFICATION_ID, notification)
    }

    // ── Open the React Native alarm screen ───────────────────────────────────
    // Works both when the app is in the foreground (single-top navigation) and
    // when it needs to be launched cold (new task).
    launchAlarmScreen(scheduleId, scheduledDate)

    // ── Play alarm audio ─────────────────────────────────────────────────────
    playAlarm()

    return START_NOT_STICKY
  }

  override fun onDestroy() {
    super.onDestroy()

    unregisterReceiver(stopReceiver)

    mediaPlayer?.runCatching { if (isPlaying) stop(); release() }
    mediaPlayer = null

    wakeLock?.runCatching { if (isHeld) release() }
    wakeLock = null

    // Dismiss the ongoing notification from the shade.
    (getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager)
      .cancel(NOTIFICATION_ID)
  }

  override fun onBind(intent: Intent?): IBinder? = null

  // ── Private helpers ────────────────────────────────────────────────────────

  private fun launchAlarmScreen(scheduleId: String, scheduledDate: String) {
    val uri = Uri.parse(
      "pilloclock://alarm?scheduleId=${Uri.encode(scheduleId)}&date=${Uri.encode(scheduledDate)}"
    )
    val launchIntent = Intent(Intent.ACTION_VIEW, uri).apply {
      // FLAG_ACTIVITY_NEW_TASK    : required when starting from a Service.
      // FLAG_ACTIVITY_SINGLE_TOP  : reuses an existing instance instead of stacking.
      flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP
      setPackage(packageName)
    }
    try {
      startActivity(launchIntent)
    } catch (e: Exception) {
      Log.w(TAG, "Could not launch alarm screen via deep link: ${e.message}")
      // fullScreenIntent on the notification will handle the lock-screen case.
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

  private fun buildNotification(
    scheduleId: String,
    medicationId: String,
    scheduledDate: String,
    scheduledTime: String,
    medName: String,
    dose: String,
  ): Notification {
    // The content intent and the fullScreenIntent both point to the alarm screen.
    val uri = Uri.parse(
      "pilloclock://alarm?scheduleId=${Uri.encode(scheduleId)}&date=${Uri.encode(scheduledDate)}"
    )
    val contentIntent = Intent(Intent.ACTION_VIEW, uri).apply {
      flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP
      setPackage(packageName)
    }
    val pendingFlags = PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    val contentPendingIntent = PendingIntent.getActivity(
      this, scheduleId.hashCode(), contentIntent, pendingFlags
    )

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
      .apply {
        if (canFullScreen) setFullScreenIntent(contentPendingIntent, /* highPriority= */ true)
      }
      // Sound is handled by MediaPlayer on STREAM_ALARM — setting it on the
      // notification would play it twice and through the wrong audio channel.
      .setSound(null)
      .setVibrate(null)
      .setAutoCancel(false)
      .setOngoing(true)
      .build()
  }

  private fun ensureNotificationChannel() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return

    val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    if (nm.getNotificationChannel(ALARM_CHANNEL_ID) != null) return   // already created

    val channel = NotificationChannel(
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
    }
    nm.createNotificationChannel(channel)
  }
}
