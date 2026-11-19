package app.faithcompanion;

import android.os.Build;
import android.view.WindowInsets;

/** The space the page must keep clear: status bar (clock, notifications), camera cut-out, navigation/gesture bar and
 *  the keyboard. {left, top, right, bottom} in pixels. */
final class Insets {
    private Insets() { }

    @SuppressWarnings("deprecation")
    static int[] of(WindowInsets in) {
        if (Build.VERSION.SDK_INT >= 30) {
            android.graphics.Insets bars = in.getInsets(WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout());
            android.graphics.Insets ime = in.getInsets(WindowInsets.Type.ime());
            return new int[]{bars.left, bars.top, bars.right, Math.max(bars.bottom, ime.bottom)};
        }
        return new int[]{in.getSystemWindowInsetLeft(), in.getSystemWindowInsetTop(), in.getSystemWindowInsetRight(), in.getSystemWindowInsetBottom()};
    }
}
