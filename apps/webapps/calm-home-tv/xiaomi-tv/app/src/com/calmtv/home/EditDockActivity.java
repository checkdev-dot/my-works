package com.calmtv.home;

import android.app.Activity;
import android.content.Intent;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.Drawable;
import android.graphics.drawable.GradientDrawable;
import android.os.Bundle;
import android.view.Gravity;
import android.view.KeyEvent;
import android.view.View;
import android.view.ViewOutlineProvider;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Map;

/**
 * A big, easy-to-read editor for the dock. Each app is a row:
 *   OK on a row picks it up (it turns orange); Up/Down moves it; OK or Back drops it.
 *   Right on a row reaches its Remove button.
 * Buttons at the bottom add apps (opens the Library) or reset to the original dock.
 * Every change is saved immediately.
 */
public class EditDockActivity extends Activity {
    private LinearLayout rows;
    private TextView status;
    private final List<String> order = new ArrayList<>();
    private Map<String, Apps.Entry> all;
    private int grabbed = -1;

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        getWindow().setBackgroundDrawable(new GradientDrawable(GradientDrawable.Orientation.TL_BR,
                new int[]{0xFF182133, 0xFF0B0E14}));
        LinearLayout page = new LinearLayout(this);
        page.setOrientation(LinearLayout.VERTICAL);
        page.setPadding(dp(64), dp(30), dp(64), dp(24));

        page.addView(text("Edit dock", 28, "sans-serif-light", 1f));
        status = text("", 14, "sans-serif", 0.75f);
        page.addView(status);

        ScrollView scroll = new ScrollView(this);
        scroll.setVerticalScrollBarEnabled(false);
        scroll.setClipChildren(false);
        rows = new LinearLayout(this);
        rows.setOrientation(LinearLayout.VERTICAL);
        rows.setClipChildren(false);
        rows.setPadding(0, dp(12), 0, dp(12));
        scroll.addView(rows);
        page.addView(scroll, new LinearLayout.LayoutParams(-1, 0, 1f));

        LinearLayout buttons = new LinearLayout(this);
        buttons.addView(button("+  Add apps", v -> startActivity(new Intent(this, LibraryActivity.class))));
        View reset = button("↺  Reset to original", v -> {
            order.clear();
            order.addAll(Arrays.asList(Apps.DEFAULT_DOCK));
            save();
            build(-1);
        });
        LinearLayout.LayoutParams rlp = new LinearLayout.LayoutParams(-2, -2);
        rlp.leftMargin = dp(14);
        buttons.addView(reset, rlp);
        page.addView(buttons);
        setContentView(page);
    }

    @Override
    protected void onResume() {
        super.onResume();
        all = Apps.installed(this);
        order.clear();
        order.addAll(Apps.dock(this));
        grabbed = -1;
        build(0);
    }

    @Override
    public void onBackPressed() {
        if (grabbed >= 0) drop();
        else super.onBackPressed();
    }

    @Override
    public boolean dispatchKeyEvent(KeyEvent e) {
        if (grabbed < 0 || e.getAction() != KeyEvent.ACTION_DOWN) return super.dispatchKeyEvent(e);
        switch (e.getKeyCode()) {
            case KeyEvent.KEYCODE_DPAD_UP: move(-1); return true;
            case KeyEvent.KEYCODE_DPAD_DOWN: move(+1); return true;
            case KeyEvent.KEYCODE_DPAD_CENTER:
            case KeyEvent.KEYCODE_ENTER: drop(); return true;
            case KeyEvent.KEYCODE_BACK: return super.dispatchKeyEvent(e);
            default: return true;
        }
    }

    private void build(int focus) {
        rows.removeAllViews();
        int n = 0;
        for (int i = 0; i < order.size(); i++) {
            String id = order.get(i);
            Apps.Entry e = Apps.PS4.equals(id) ? Apps.ps4(this, all) : all.get(id);
            if (e == null) continue;  // not installed (e.g. Apple Music): kept in the order, not shown
            rows.addView(row(i, e, ++n));
        }
        status.setText(grabbed >= 0
                ? "Moving  ·  ▲ ▼ to move    OK to place"
                : "OK picks an app up  ·  ▶ to remove  ·  changes save instantly");
        View target = null;
        for (int i = 0; i < rows.getChildCount(); i++) {
            View r = rows.getChildAt(i);
            if ((int) r.getTag() == focus) target = ((LinearLayout) r).getChildAt(0);
        }
        if (target == null && rows.getChildCount() > 0) target = ((LinearLayout) rows.getChildAt(0)).getChildAt(0);
        if (target != null) target.requestFocus();
    }

    private View row(int index, Apps.Entry e, int position) {
        LinearLayout row = new LinearLayout(this);
        row.setTag(index);
        row.setGravity(Gravity.CENTER_VERTICAL);
        row.setClipChildren(false);

        LinearLayout body = new LinearLayout(this);
        body.setGravity(Gravity.CENTER_VERTICAL);
        body.setFocusable(true);
        body.setDefaultFocusHighlightEnabled(false);
        body.setPadding(dp(14), dp(8), dp(14), dp(8));
        boolean isGrabbed = index == grabbed;
        GradientDrawable bg = new GradientDrawable();
        bg.setCornerRadius(dp(12));
        body.setBackground(bg);

        TextView num = text(String.valueOf(position), 16, "sans-serif-medium", 0.6f);
        num.setMinWidth(dp(28));
        body.addView(num);
        ImageView icon = new ImageView(this);
        Drawable d = e.icon != null ? e.icon : e.banner;
        icon.setImageDrawable(d);
        icon.setScaleType(ImageView.ScaleType.CENTER_CROP);
        GradientDrawable clip = new GradientDrawable();
        clip.setCornerRadius(dp(6));
        icon.setBackground(clip);
        icon.setOutlineProvider(ViewOutlineProvider.BACKGROUND);
        icon.setClipToOutline(true);
        LinearLayout.LayoutParams ilp = new LinearLayout.LayoutParams(dp(e.icon != null ? 32 : 56), dp(32));
        ilp.rightMargin = dp(14);
        body.addView(icon, ilp);
        TextView name = text(e.label.toString(), 18, "sans-serif", 1f);
        body.addView(name, new LinearLayout.LayoutParams(0, -2, 1f));
        TextView hint = text(isGrabbed ? "▲ ▼" : "", 16, "sans-serif-medium", 1f);
        body.addView(hint);

        Runnable paint = () -> {
            boolean f = body.hasFocus();
            bg.setColor(index == grabbed ? 0xFFE8833A : f ? 0x40FFFFFF : 0x14FFFFFF);
            bg.setStroke(dp(2), f ? Color.WHITE : 0x00000000);
        };
        paint.run();
        body.setOnFocusChangeListener((v, has) -> paint.run());
        body.setOnClickListener(v -> {
            grabbed = index;
            build(index);
        });
        row.addView(body, new LinearLayout.LayoutParams(0, -2, 1f));

        View remove = button("Remove", v -> {
            order.remove(index);
            save();
            build(index);
        });
        LinearLayout.LayoutParams xlp = new LinearLayout.LayoutParams(-2, -2);
        xlp.leftMargin = dp(12);
        row.addView(remove, xlp);

        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(-1, -2);
        lp.bottomMargin = dp(8);
        row.setLayoutParams(lp);
        return row;
    }

    private void move(int dir) {
        int j = grabbed + dir;
        // Skip over entries that aren't shown (apps not installed).
        while (j >= 0 && j < order.size() && !isShown(order.get(j))) j += dir;
        if (j < 0 || j >= order.size()) return;
        String id = order.remove(grabbed);
        order.add(j, id);
        grabbed = j;
        save();
        build(j);
    }

    private boolean isShown(String id) {
        return Apps.PS4.equals(id) ? Apps.ps4(this, all) != null : all.containsKey(id);
    }

    private void drop() {
        int at = grabbed;
        grabbed = -1;
        build(at);
    }

    private void save() {
        Apps.saveDock(this, order);
    }

    private View button(String label, View.OnClickListener l) {
        TextView b = text(label, 15, "sans-serif-medium", 1f);
        b.setPadding(dp(16), dp(9), dp(16), dp(9));
        b.setFocusable(true);
        b.setDefaultFocusHighlightEnabled(false);
        GradientDrawable bg = new GradientDrawable();
        bg.setCornerRadius(dp(20));
        bg.setColor(0x26FFFFFF);
        b.setBackground(bg);
        b.setOnFocusChangeListener((v, has) -> {
            bg.setColor(has ? Color.WHITE : 0x26FFFFFF);
            b.setTextColor(has ? 0xFF111111 : Color.WHITE);
        });
        b.setOnClickListener(l);
        return b;
    }

    private TextView text(String s, int sp, String family, float alpha) {
        TextView t = new TextView(this);
        t.setText(s);
        t.setTextColor(Color.WHITE);
        t.setTextSize(sp);
        t.setTypeface(Typeface.create(family, Typeface.NORMAL));
        t.setAlpha(alpha);
        return t;
    }

    private int dp(float v) {
        return Tile.dp(this, v);
    }
}
