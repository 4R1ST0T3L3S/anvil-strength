package com.anvilstrength.app;

import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.content.SharedPreferences;
import android.widget.RemoteViews;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;

public class CountdownWidgetProvider extends AppWidgetProvider {

    @Override
    public void onUpdate(Context context, AppWidgetManager appWidgetManager, int[] appWidgetIds) {
        SharedPreferences prefs = context.getSharedPreferences("CapacitorStorage", Context.MODE_PRIVATE);
        
        String compName = prefs.getString("widget_comp_name", "Sin competición");
        String compDateStr = prefs.getString("widget_comp_date", null);
        String compLoc = prefs.getString("widget_comp_location", "");
        String theme = prefs.getString("widget_comp_theme", "dark");
        
        String d = "00", h = "00";
        
        if (compDateStr != null && !compDateStr.isEmpty()) {
            try {
                SimpleDateFormat sdf = new SimpleDateFormat("yyyy-MM-dd", Locale.getDefault());
                Date compDate = sdf.parse(compDateStr.substring(0, 10));
                
                long diff = compDate.getTime() - System.currentTimeMillis();
                if (diff < 0) diff = 0;
                
                long days = diff / (1000 * 60 * 60 * 24);
                long hours = (diff / (1000 * 60 * 60)) % 24;
                
                d = String.format(Locale.getDefault(), "%02d", days);
                h = String.format(Locale.getDefault(), "%02d", hours);
            } catch (Exception e) {
                e.printStackTrace();
            }
        }

        for (int appWidgetId : appWidgetIds) {
            RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget_countdown);
            views.setTextViewText(R.id.widget_comp_name, compName);
            
            if (compLoc.isEmpty()) {
                views.setTextViewText(R.id.widget_comp_location, "");
            } else {
                views.setTextViewText(R.id.widget_comp_location, "📍 " + compLoc);
            }
            
            views.setTextViewText(R.id.widget_days, d);
            views.setTextViewText(R.id.widget_hours, h);
            
            int bgRes = R.drawable.bg_widget_dark;
            if ("blue".equals(theme)) bgRes = R.drawable.bg_widget_blue;
            else if ("gold".equals(theme)) bgRes = R.drawable.bg_widget_gold;
            else if ("orange".equals(theme)) bgRes = R.drawable.bg_widget_orange;
            else if ("red".equals(theme)) bgRes = R.drawable.bg_widget_red;
            else if ("purple".equals(theme)) bgRes = R.drawable.bg_widget_purple;
            else if ("emerald".equals(theme)) bgRes = R.drawable.bg_widget_emerald;
            else if ("dark_blue".equals(theme)) bgRes = R.drawable.bg_widget_dark_blue;
            
            views.setInt(R.id.widget_container, "setBackgroundResource", bgRes);
            
            appWidgetManager.updateAppWidget(appWidgetId, views);
        }
    }
}
