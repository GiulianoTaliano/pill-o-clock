package expo.modules.widget

import android.appwidget.AppWidgetManager
import android.content.ComponentName
import android.content.Context
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.records.Field
import expo.modules.kotlin.records.Record

// ─── Data record ──────────────────────────────────────────────────────────

/**
 * Payload written from JS when the today-dose list changes.
 */
class WidgetData : Record {
    @Field val name:    String?  = null
    @Field val time:    String?  = null
    @Field val allDone: Boolean  = false
}

// ─── Module ────────────────────────────────────────────────────────────────

class ExpoWidgetModule : Module() {

    private val context: Context
        get() = requireNotNull(appContext.reactContext) { "React context is null" }

    override fun definition() = ModuleDefinition {

        Name("ExpoWidget")

        /**
         * updateWidget({ name, time, allDone })
         *
         * Persists the payload to SharedPreferences, then triggers an
         * AppWidgetManager update for every placed widget instance.
         */
        AsyncFunction("updateWidget") { data: WidgetData ->
            context.getSharedPreferences("pilloclock_widget", Context.MODE_PRIVATE)
                .edit()
                .putString("next_dose_name", data.name)
                .putString("next_dose_time", data.time)
                .putBoolean("all_done", data.allDone)
                .apply()

            val manager  = AppWidgetManager.getInstance(context)
            val provider = ComponentName(context, PillWidgetProvider::class.java)
            val ids      = manager.getAppWidgetIds(provider)
            ids.forEach { PillWidgetProvider.updateWidget(context, manager, it) }
        }

        /**
         * isAvailable() → true if ≥1 widget instance is placed on the home screen.
         */
        AsyncFunction("isAvailable") {
            val manager  = AppWidgetManager.getInstance(context)
            val provider = ComponentName(context, PillWidgetProvider::class.java)
            manager.getAppWidgetIds(provider).isNotEmpty()
        }
    }
}
