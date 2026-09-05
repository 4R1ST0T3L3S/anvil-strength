import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.anvilstrength.app',
  appName: 'Anvil Strength',
  webDir: 'dist',
  bundledWebRuntime: false,
  plugins: {
    /**
     * Barras del sistema. Con `insetsHandling: 'css'` (el valor por defecto)
     * y SIN `viewport-fit=cover` en index.html, Capacitor aparta el WebView
     * de la barra de estado y de la de gestos él solo. `style: 'DARK'` =
     * fondo oscuro, iconos claros.
     */
    SystemBars: {
      style: 'DARK',
      insetsHandling: 'css',
    },
    SplashScreen: {
      launchShowDuration: 3000,
      launchAutoHide: false, // Ocultado manualmente desde App.tsx
      backgroundColor: "#0d0f11",
      androidSplashResourceName: "splash",
      androidScaleType: "CENTER_CROP",
      showSpinner: true,
      androidSpinnerStyle: "large",
      iosSpinnerStyle: "small",
      spinnerColor: "#f31260",
      splashFullScreen: true,
      splashImmersive: true,
      layoutName: "launch_screen",
      useDialog: true,
    },
    PushNotifications: {
      presentationOptions: ["badge", "sound", "alert"],
    },
    LocalNotifications: {
      smallIcon: "ic_stat_icon_config_sample",
      iconColor: "#f31260",
      sound: "beep.wav",
    },
  },
};

export default config;
