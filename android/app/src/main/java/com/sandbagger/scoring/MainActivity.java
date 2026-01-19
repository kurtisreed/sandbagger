package com.sandbagger.scoring;

import android.os.Bundle;
import androidx.core.view.WindowCompat;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        // Disable edge-to-edge to keep content below status bar
        WindowCompat.setDecorFitsSystemWindows(getWindow(), true);
    }
}
