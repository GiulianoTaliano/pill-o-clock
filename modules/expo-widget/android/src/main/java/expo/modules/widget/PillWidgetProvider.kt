package expo.modules.widget

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context
import android.content.res.Configuration
import android.widget.RemoteViews

/**
 * Standard Android AppWidgetProvider (no Compose / Glance required).
 *
 * Data is read from SharedPreferences ("pilloclock_widget"), written by
 * [ExpoWidgetModule.updateWidget] whenever the JS store's dose list changes.
 *
 * Tapping the widget opens the app's main activity.
 */
class PillWidgetProvider : AppWidgetProvider() {

    override fun onUpdate(
        context: Context,
        manager: AppWidgetManager,
        appWidgetIds: IntArray
    ) {
        appWidgetIds.forEach { id -> updateWidget(context, manager, id) }
    }

    companion object {

        fun updateWidget(context: Context, manager: AppWidgetManager, widgetId: Int) {
            val prefs  = context.getSharedPreferences("pilloclock_widget", Context.MODE_PRIVATE)
            val name   = prefs.getString("next_dose_name", null)
            val time   = prefs.getString("next_dose_time", null)
            val allDone = prefs.getBoolean("all_done", false)

            // Detect night mode to choose text colours programmatically.
            val isNight = (context.resources.configuration.uiMode
                    and Configuration.UI_MODE_NIGHT_MASK) == Configuration.UI_MODE_NIGHT_YES

            val textColorPrimary = if (isNight) 0xFFF1F5F9.toInt() else 0xFF0F172A.toInt()
            val textColorAccent  = if (isNight) 0xFF93C5FD.toInt() else 0xFF4F9CFF.toInt()
            val textColorSuccess = if (isNight) 0xFF4ADE80.toInt() else 0xFF15803D.toInt()

            val views = RemoteViews(context.packageName, R.layout.pill_widget)

            if (allDone || name == null) {
                views.setTextViewText(R.id.widget_name, "\u2714  All done")
                views.setTextColor(R.id.widget_name, textColorSuccess)
                views.setTextViewText(R.id.widget_time, "")
            } else {
                // \uD83D\uDC8A = 💊
                views.setTextViewText(R.id.widget_name, "\uD83D\uDC8A  $name")
                views.setTextColor(R.id.widget_name, textColorPrimary)
                views.setTextViewText(R.id.widget_time, "Next: $time")
                views.setTextColor(R.id.widget_time, textColorAccent)
            }

            // Tap anywhere → open app.
            val intent = context.packageManager.getLaunchIntentForPackage(context.packageName)
            if (intent != null) {
                intent.flags = android.content.Intent.FLAG_ACTIVITY_NEW_TASK or
                               android.content.Intent.FLAG_ACTIVITY_CLEAR_TOP
                val pending = PendingIntent.getActivity(
                    context, 0, intent,
                    PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
                )
                views.setOnClickPendingIntent(R.id.widget_root, pending)
            }

            manager.updateAppWidget(widgetId, views)
        }
    }
}
