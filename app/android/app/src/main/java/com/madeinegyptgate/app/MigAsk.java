package com.madeinegyptgate.app;

import java.util.ArrayList;
import java.util.List;
import java.util.Set;

/**
 * One system permission dialog at a time for the page's microphone / camera requests (MigChromeClient.onPermissionRequest).
 *
 * Capacitor asks Android once per request and keeps only the last request's listener: a second request while the first dialog
 * is still open (the call's own capture and the SDK's, mic-permission-race) gets an empty answer from Android, which Capacitor
 * counts as granted, and the real answer is dropped. Here a request that arrives while a dialog is open waits for that dialog,
 * every waiting request is answered from its one result, and a request is granted only when the phone really holds the
 * permissions it needs at that moment (an empty answer grants nothing). Plain Java: MigLogicTest runs it on the JVM.
 */
final class MigAsk<T> {

    private final List<T> waiting = new ArrayList<>();
    private boolean open;

    /** a new request: true = no dialog is open, ask Android now; false = it waits for the dialog already open */
    synchronized boolean add(T request) {
        waiting.add(request);
        if (open) return false;
        open = true;
        return true;
    }

    /** the page withdrew a request (WebView's onPermissionRequestCanceled): it gets no answer */
    synchronized boolean remove(T request) {
        return waiting.remove(request);
    }

    synchronized boolean isOpen() {
        return open;
    }

    /** the dialog answered: every waiting request, each to be granted or denied from what the phone holds now */
    synchronized List<T> answer() {
        open = false;
        List<T> all = new ArrayList<>(waiting);
        waiting.clear();
        return all;
    }

    /** grant only when every permission the request needs is held now (no permission needed: nothing to hold) */
    static boolean allHeld(String[] needed, Set<String> held) {
        if (needed == null) return true;
        for (String p : needed) if (held == null || !held.contains(p)) return false;
        return true;
    }
}
