package com.calmtv.home;

import android.app.Activity;
import android.content.Intent;
import android.os.Bundle;

/**
 * The app list now lives inside Home's own screen (LibraryPanel), one scroll below the dock.
 * This invisible screen only remains so that every way in (the remote's grid button, Edit dock's
 * "Add apps") lands on that panel: it hands over to Home and closes at once.
 */
public class LibraryActivity extends Activity {
    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        startActivity(new Intent(this, HomeActivity.class)
                .putExtra(HomeActivity.EXTRA_OPEN_LIBRARY, true)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP));
        finish();
        overridePendingTransition(0, 0);
    }

    /** True while the app list is on screen, so Home keeps its photo. */
    static boolean isOpen() {
        return HomeActivity.libraryShowing;
    }
}
