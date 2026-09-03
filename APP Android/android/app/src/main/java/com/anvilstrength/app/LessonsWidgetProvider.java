package com.anvilstrength.app;

import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.content.SharedPreferences;
import android.widget.RemoteViews;

public class LessonsWidgetProvider extends AppWidgetProvider {

    @Override
    public void onUpdate(Context context, AppWidgetManager appWidgetManager, int[] appWidgetIds) {
        SharedPreferences prefs = context.getSharedPreferences("CapacitorStorage", Context.MODE_PRIVATE);
        
        String quote = prefs.getString("widget_lesson_quote", "Ser de anvil es como una espada forjada a martillazos");

        for (int appWidgetId : appWidgetIds) {
            RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget_lessons);
            views.setTextViewText(R.id.widget_lesson_quote, quote.toUpperCase());
            appWidgetManager.updateAppWidget(appWidgetId, views);
        }
    }
}
