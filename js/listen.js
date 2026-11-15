/*
 * Listen button for essays.
 *
 * Reads the essay aloud with the visitor's own device voice (the browser's
 * built-in speech synthesis). No audio file is involved, so the voice differs
 * from device to device. The button stays hidden where the browser can't do it.
 */
(function () {
    'use strict';

    var button = document.querySelector('.listen');
    var essay = document.querySelector('.essay');
    var synth = window.speechSynthesis;

    if (!button || !essay || !synth || typeof window.SpeechSynthesisUtterance !== 'function') {
        return;
    }

    var label = button.querySelector('.listen-label');
    var status = document.querySelector('.listen-status');

    var sentences = [];   // the essay, one sentence per entry
    var index = 0;        // the next sentence to read
    var state = 'idle';   // idle | playing | paused
    var run = 0;          // bumped whenever we stop, so stale callbacks are ignored
    var current = null;   // keeps the utterance alive; some browsers drop it mid-speech otherwise

    // Use the visitor's own English accent if they have one set, otherwise British English.
    var lang = /^en\b/i.test(navigator.language || '') ? navigator.language : 'en-GB';

    // Sentence-sized pieces: some browsers cut off long passages, and it lets
    // Pause pick up again at the sentence it stopped on.
    function collectSentences() {
        var out = [];
        var blocks = essay.querySelectorAll('.essay-title, p');
        Array.prototype.forEach.call(blocks, function (block) {
            var text = block.textContent.replace(/\s+/g, ' ').trim();
            if (!text) { return; }
            var parts = text.match(/[^.!?]+[.!?]+[”"’')]*|[^.!?]+$/g) || [text];
            var first = true;
            parts.forEach(function (part) {
                part = part.trim();
                if (!part) { return; }
                // A piece starting in lower case continues the sentence before it
                // (for example after a quoted question), so keep the two together.
                if (!first && /^[a-z]/.test(part)) {
                    out[out.length - 1] += ' ' + part;
                } else {
                    out.push(part);
                }
                first = false;
            });
        });
        return out;
    }

    function setState(next) {
        state = next;
        button.setAttribute('data-state', next);
        label.textContent = next === 'playing' ? 'Pause' : next === 'paused' ? 'Resume' : 'Listen';
    }

    function speakNext(myRun) {
        if (myRun !== run) { return; }

        if (index >= sentences.length) {   // reached the end
            index = 0;
            setState('idle');
            return;
        }

        var utterance = new window.SpeechSynthesisUtterance(sentences[index]);
        utterance.lang = lang;

        utterance.onend = function () {
            if (myRun !== run) { return; }
            index += 1;
            speakNext(myRun);
        };

        utterance.onerror = function (event) {
            if (myRun !== run) { return; }   // we stopped it ourselves
            run += 1;
            if (event && (event.error === 'interrupted' || event.error === 'canceled')) {
                setState('paused');          // something else cut in; Resume picks up here
                return;
            }
            index = 0;
            setState('idle');
            if (status) { status.textContent = 'This browser could not read the essay aloud.'; }
        };

        current = utterance;
        synth.speak(utterance);
    }

    function play() {
        if (!sentences.length) { sentences = collectSentences(); }
        if (status) { status.textContent = ''; }
        run += 1;
        setState('playing');
        speakNext(run);
    }

    function pause() {
        run += 1;
        synth.cancel();
        setState('paused');
    }

    button.addEventListener('click', function () {
        if (state === 'playing') { pause(); } else { play(); }
    });

    // Stop when the reader leaves; some browsers otherwise keep talking on the next page.
    window.addEventListener('pagehide', function () {
        run += 1;
        synth.cancel();
    });

    synth.cancel();          // clear anything left queued by a previous page
    setState('idle');
    button.hidden = false;   // supported, so show the button
}());
