package expo.modules.widget

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context
import android.content.res.Configuration
import android.widget.RemoteViews
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

class PillWidgetProvider : AppWidgetProvider() {
    override fun onUpdate(context: Context, manager: AppWidgetManager, appWidgetIds: IntArray) {
        appWidgetIds.forEach { updateWidget(context, manager, it) }
    }
    companion object {
        fun updateWidget(context: Context, manager: AppWidgetManager, widgetId: Int) {
            val prefs = context.getSharedPreferences("pilloclock_widget", Context.MODE_PRIVATE)
            val today = SimpleDateFormat("yyyy-MM-dd", Locale.US).format(Date())
            val current = prefs.getString("plan_date", "") == today
            val fallback = prefs.getString("fallback_text", "Pill O-Clock") ?: "Pill O-Clock"
            val title = if (current) prefs.getString("plan_title", fallback) else fallback
            val subtitle = if (current) prefs.getString("plan_subtitle", "") else ""
            val profile = if (current) prefs.getString("plan_profile", "") else ""
            val isNight = (context.resources.configuration.uiMode and Configuration.UI_MODE_NIGHT_MASK) == Configuration.UI_MODE_NIGHT_YES
            val views = RemoteViews(context.packageName, R.layout.pill_widget)
            views.setTextViewText(R.id.widget_name, title)
            views.setTextViewText(R.id.widget_time, listOfNotNull(profile, subtitle).filter { it.isNotBlank() }.joinToString(" · "))
            views.setTextColor(R.id.widget_name, if (isNight) 0xFFF1F5FB.toInt() else 0xFF17263C.toInt())
            views.setTextColor(R.id.widget_time, if (isNight) 0xFFB9C8DC.toInt() else 0xFF52647C.toInt())
            val intent = context.packageManager.getLaunchIntentForPackage(context.packageName)
            if (intent != null) {
                intent.flags = android.content.Intent.FLAG_ACTIVITY_NEW_TASK or android.content.Intent.FLAG_ACTIVITY_CLEAR_TOP
                val pending = PendingIntent.getActivity(context, 0, intent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
                views.setOnClickPendingIntent(R.id.widget_root, pending)
            }
            manager.updateAppWidget(widgetId, views)
        }
    }
}
