package com.calmtv.home;

import android.media.tv.TvInputManager;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.util.Log;

/**
 * All the rules for switching to the PS4 automatically, in one place.
 *
 * The HDMI port reports one of: CONNECTED (a powered device is sending a signal),
 * CONNECTED_STANDBY or DISCONNECTED. Those reports are noisy: the port briefly says
 * CONNECTED when you switch inputs and while the PS4 is shutting down. So nothing here
 * reacts to a single report; it reacts to what is true for long enough.
 *
 * Rules (numbers match the comments in the code):
 *  1. Leaving the PS4 input on purpose (Home, another app) silences auto-switch until
 *     the PS4 has really been off and come back on.
 *  2. A "PS4 woke up" needs it to have been off for at least WAKE_OFF_MS first.
 *  3. Every "on" must stay on for STABLE_MS before anything happens (filters flickers).
 *  4. Never prompt while you're already watching an HDMI input; re-check right before switching.
 *  5. If the PS4 goes off during the countdown, the countdown is cancelled.
 *  6. Back on the card: no more prompts until the PS4 has been off and on again.
 *  7. TV turned on (screen on / boot) with the PS4 already on: one prompt, after the stability check.
 *  8. PS4 turns off while you're on its HDMI: after OFF_RETURN_MS of no signal, say so and go Home.
 *  9. The PS4 switched the TV itself (HDMI-CEC): that counts as "already on HDMI" (rule 4).
 * 10. The watcher restarting (app update, memory pressure) is NOT the TV turning on: it quietly
 *     adopts the PS4's current state. Only a genuinely fresh boot counts as rule 7.
 * 11. In rest mode the PS4 keeps its port "connected". So turning the TV on only prompts if the
 *     PS4 was NOT already connected when the TV went to sleep.
 * 12. At most one prompt every PROMPT_COOLDOWN_MS, whatever the port does.
 */
final class Ps4Switch {
    static final long STABLE_MS = 3_000;
    static final long WAKE_OFF_MS = 15_000;
    static final long OFF_RETURN_MS = 8_000;
    static final long PROMPT_COOLDOWN_MS = 10 * 60_000;
    private static final String HDMI_APP = "com.mitv.livetv";
    private static final String TAG = "CalmPs4";

    /** What the switcher needs from the service (UI and environment). */
    interface Host {
        String ps4InputId();           // the PS4's input id, or null
        int inputState(String id);     // TvInputManager.INPUT_STATE_*
        String foreground();           // package on screen
        boolean promptShowing();
        void showPrompt();             // countdown card; it calls back switchConfirmed()/dismissed()
        void cancelPrompt();
        void switchToPs4();
        void ps4OffGoHome();           // card "PS4 turned off" + go Home
        boolean enabled();
    }

    private final Host host;
    private final Handler ui = new Handler(Looper.getMainLooper());

    private boolean on;                 // last stable belief: PS4 on?
    private long offSince = SystemClock.elapsedRealtime() - WAKE_OFF_MS; // treat "unknown" as long off
    private boolean silenced;           // rules 1 and 6: until the PS4 has been off and on again
    private boolean wasOnPs4Input;      // were we just watching HDMI while the PS4 was on?
    private boolean pendingScreenOn;    // rule 7
    private boolean onAtScreenOff;      // rule 11
    private long lastPromptAt = -PROMPT_COOLDOWN_MS;  // rule 12

    private final Runnable settle = this::settle;
    private final Runnable offCheck = this::offCheck;

    Ps4Switch(Host host) {
        this.host = host;
    }

    // --- events from the service ---

    /** The port reported a new state. Never act on it directly; settle after STABLE_MS (rule 3). */
    void onInputState(String inputId) {
        if (!inputId.equals(host.ps4InputId())) return;
        ui.removeCallbacks(settle);
        ui.postDelayed(settle, STABLE_MS);
        if (host.inputState(inputId) != TvInputManager.INPUT_STATE_CONNECTED && host.promptShowing()) {
            log("PS4 dropped during countdown -> cancel (rule 5)");
            host.cancelPrompt();
        }
    }

    /** The TV went to sleep: remember whether the PS4 was connected then (rule 11). */
    void onScreenOff() {
        onAtScreenOff = isOnNow();
    }

    /** The watcher started. A fresh boot is rule 7; any other restart just adopts the state (rule 10). */
    void onServiceStart(boolean freshBoot) {
        if (freshBoot) {
            onScreenOn();
            return;
        }
        on = isOnNow();
        log("watcher restarted -> adopted PS4 " + (on ? "on" : "off") + " quietly (rule 10)");
    }

    /** The TV screen turned on (rule 7), unless the PS4 was already connected before it slept (rule 11). */
    void onScreenOn() {
        pendingScreenOn = !onAtScreenOff;
        if (onAtScreenOff) log("TV on, PS4 was already connected before sleep (rest mode) -> no prompt (rule 11)");
        onAtScreenOff = false;
        ui.removeCallbacks(settle);
        ui.postDelayed(settle, STABLE_MS);
    }

    /** The app on screen changed. */
    void onForeground(String pkg) {
        boolean onHdmi = HDMI_APP.equals(pkg);
        if (wasOnPs4Input && !onHdmi && on) {
            log("left the PS4 input on purpose -> silenced until the PS4 sleeps (rule 1)");
            silenced = true;
        }
        wasOnPs4Input = onHdmi && on;
        if (onHdmi && host.promptShowing()) host.cancelPrompt();  // rule 9: the TV is already there
    }

    /** Back pressed on the card (rule 6). */
    void dismissed() {
        log("dismissed -> silenced until the PS4 sleeps (rule 6)");
        silenced = true;
    }

    /** OK pressed, or the countdown ran out. Re-check everything first (rule 4). */
    void switchConfirmed() {
        if (!isOnNow()) {
            log("PS4 no longer on at switch time -> skip");
            return;
        }
        if (HDMI_APP.equals(host.foreground())) {
            log("already on HDMI at switch time -> skip (rule 4/9)");
            return;
        }
        host.switchToPs4();
        wasOnPs4Input = true;
    }

    // --- the logic ---

    private boolean isOnNow() {
        String id = host.ps4InputId();
        return id != null && host.inputState(id) == TvInputManager.INPUT_STATE_CONNECTED;
    }

    /** Runs STABLE_MS after the last report: decide what is really true now. */
    private void settle() {
        boolean nowOn = isOnNow();
        long now = SystemClock.elapsedRealtime();
        boolean screenOn = pendingScreenOn;
        pendingScreenOn = false;

        if (!nowOn) {
            if (on) {
                log("PS4 went off");
                on = false;
                offSince = now;
                // Rule 8: if you're looking at its (now dead) input, offer to go Home.
                ui.removeCallbacks(offCheck);
                ui.postDelayed(offCheck, OFF_RETURN_MS);
            }
            if (host.promptShowing()) host.cancelPrompt();  // rule 5
            return;
        }

        boolean woke = !on;
        on = true;
        if (woke) {
            long offFor = now - offSince;
            if (offFor >= WAKE_OFF_MS) {
                if (silenced) log("PS4 came back after being off -> un-silenced (rules 1/6)");
                silenced = false;
            } else {
                log("PS4 'on' after only " + offFor + " ms off -> a flicker, ignore (rule 2)");
                return;
            }
        } else if (!screenOn) {
            return;  // still on; nothing new
        }
        maybePrompt(woke ? "PS4 woke up" : "TV turned on with PS4 on");
    }

    private void maybePrompt(String why) {
        if (!host.enabled()) return;
        if (silenced) { log(why + " but silenced (rules 1/6)"); return; }
        if (HDMI_APP.equals(host.foreground())) { log(why + " but already on HDMI (rule 4/9)"); return; }
        if (host.promptShowing()) return;
        long now = SystemClock.elapsedRealtime();
        if (now - lastPromptAt < PROMPT_COOLDOWN_MS) { log(why + " but prompted recently (rule 12)"); return; }
        lastPromptAt = now;
        log(why + " -> countdown");
        host.showPrompt();
    }

    /** Rule 8: OFF_RETURN_MS after the PS4 went off, if it's still off and you're on HDMI, go Home. */
    private void offCheck() {
        if (!on && HDMI_APP.equals(host.foreground()) && !isOnNow()) {
            log("PS4 off and you're on its dead input -> back Home (rule 8)");
            host.ps4OffGoHome();
        }
    }

    private static void log(String s) {
        Log.i(TAG, s);
    }
}
