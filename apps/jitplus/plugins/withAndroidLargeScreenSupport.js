const { withAndroidManifest } = require('expo/config-plugins');

module.exports = function withAndroidLargeScreenSupport(config) {
  return withAndroidManifest(config, async (config) => {
    const androidManifest = config.modResults;
    const manifest = androidManifest.manifest;
    
    // Ensure tools namespace is available
    if (!manifest.$['xmlns:tools']) {
      manifest.$['xmlns:tools'] = 'http://schemas.android.com/tools';
    }

    const application = manifest.application[0];
    
    // 1. Remove from all existing activities that config-plugins can see
    if (application.activity) {
      application.activity.forEach((act) => {
        if (act.$ && act.$['android:screenOrientation']) {
          delete act.$['android:screenOrientation'];
        }
      });
    } else {
      application.activity = [];
    }

    // 2. Add an override for the ML Kit GMS Activity to remove the portrait restriction merged by Gradle
    const hasMlKitActivity = application.activity.find(
      (a) => a.$['android:name'] === 'com.google.mlkit.vision.codescanner.internal.GmsBarcodeScanningDelegateActivity'
    );
    
    if (!hasMlKitActivity) {
      application.activity.push({
        $: {
          'android:name': 'com.google.mlkit.vision.codescanner.internal.GmsBarcodeScanningDelegateActivity',
          'android:screenOrientation': 'unspecified',
          'tools:replace': 'android:screenOrientation'
        }
      });
    }

    return config;
  });
};