/*
 * Listen button for essays.
 *
 * Reads the essay aloud with the visitor's own device voice (the browser's
 * built-in speech synthesis), highlights the sentence being read, and lets the
 * reader tap or click any sentence to jump to it. No audio file is involved, so
 * the voice differs from device to device. The button stays hidden where the
 * browser can't read aloud.
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
    var HINT = 'Tap or click any sentence to jump to it.';

    var sentences = [];      // { text: what to say, spans: the elements that show it }
    var prepared = false;    // sentences are wrapped the first time Listen is pressed
    var index = 0;           // the sentence being read, or the next one to read
    var reading = -1;        // the sentence currently highlighted
    var state = 'idle';      // idle | playing | paused
    var run = 0;             // bumped whenever we stop or jump, so stale callbacks are ignored
    var current = null;      // keeps the utterance alive; some browsers drop it mid-speech otherwise
    var lastUserScroll = 0;  // when the reader last scrolled by hand

    // Use the visitor's own English accent if they have one set, otherwise British English.
    var lang = /^en\b/i.test(navigator.language || '') ? navigator.language : 'en-GB';
    var reduceMotion = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

    /* ---------- Splitting the essay into sentences ---------- */

    // Where each sentence starts and ends inside a block of text. Simple rule:
    // a sentence ends at . ! or ? (plus any closing quote). Abbreviations with
    // full stops would be split too early; none are used so far.
    function findRanges(text) {
        var pattern = /[^.!?]+[.!?]+[”"’')]*|[^.!?]+$/g;
        var ranges = [];
        var match;
        while ((match = pattern.exec(text)) !== null) {
            var raw = match[0];
            var spoken = raw.replace(/\s+/g, ' ').trim();
            if (!spoken) { continue; }
            var start = match.index + raw.match(/^\s*/)[0].length;
            var end = match.index + raw.replace(/\s+$/, '').length;
            var last = ranges[ranges.length - 1];
            // A piece starting in lower case continues the sentence before it
            // (for example after a quoted question), so keep the two together.
            if (last && /^[a-z]/.test(spoken)) {
                last.end = end;
                last.text += ' ' + spoken;
            } else {
                ranges.push({ start: start, end: end, text: spoken });
            }
        }
        return ranges;
    }

    // Wrap every sentence of a heading or paragraph in <span class="sentence">.
    // A sentence that runs across bold or linked text gets one span per piece.
    function wrapBlock(block) {
        var ranges = findRanges(block.textContent);
        if (!ranges.length) { return; }

        var base = sentences.length;
        ranges.forEach(function (range) {
            sentences.push({ text: range.text, spans: [] });
        });

        var walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT, null);
        var textNodes = [];
        var node;
        while ((node = walker.nextNode())) { textNodes.push(node); }

        var offset = 0;
        textNodes.forEach(function (textNode) {
            var value = textNode.nodeValue;
            var nodeStart = offset;
            var nodeEnd = offset + value.length;
            offset = nodeEnd;

            var pieces = document.createDocumentFragment();
            var cursor = nodeStart;

            ranges.forEach(function (range, i) {
                var from = Math.max(range.start, nodeStart);
                var to = Math.min(range.end, nodeEnd);
                if (from >= to) { return; }
                if (from > cursor) {
                    pieces.appendChild(document.createTextNode(value.slice(cursor - nodeStart, from - nodeStart)));
                }
                var span = document.createElement('span');
                span.className = 'sentence';
                span.setAttribute('data-sentence', String(base + i));
                span.textContent = value.slice(from - nodeStart, to - nodeStart);
                sentences[base + i].spans.push(span);
                pieces.appendChild(span);
                cursor = to;
            });

            if (cursor < nodeEnd) {
                pieces.appendChild(document.createTextNode(value.slice(cursor - nodeStart)));
            }
            textNode.parentNode.replaceChild(pieces, textNode);
        });
    }

    function prepare() {
        var blocks = essay.querySelectorAll('.essay-title, p');
        Array.prototype.forEach.call(blocks, wrapBlock);
        prepared = true;
    }

    /* ---------- Showing where we are ---------- */

    // Bring the sentence on screen if it has scrolled out of view. When the page
    // is just reading along, leave the reader alone if they scrolled a moment ago.
    function keepInView(element, becauseReaderJumped) {
        if (!becauseReaderJumped && Date.now() - lastUserScroll < 4000) { return; }
        var box = element.getBoundingClientRect();
        var viewport = window.innerHeight || document.documentElement.clientHeight;
        if (box.top >= 0 && box.bottom <= viewport) { return; }
        element.scrollIntoView({ block: 'center', behavior: reduceMotion ? 'auto' : 'smooth' });
    }

    function highlight(i, becauseReaderJumped) {
        if (reading >= 0 && sentences[reading]) {
            sentences[reading].spans.forEach(function (span) { span.classList.remove('is-reading'); });
        }
        reading = i;
        if (i < 0 || !sentences[i]) { return; }
        sentences[i].spans.forEach(function (span) { span.classList.add('is-reading'); });
        if (sentences[i].spans.length) { keepInView(sentences[i].spans[0], becauseReaderJumped); }
    }

    function setState(next) {
        state = next;
        var listening = next !== 'idle';
        button.setAttribute('data-state', next);
        label.textContent = next === 'playing' ? 'Pause' : next === 'paused' ? 'Resume' : 'Listen';
        if (listening) { essay.classList.add('is-listening'); } else { essay.classList.remove('is-listening'); }
        if (status) { status.textContent = listening ? HINT : ''; }
    }

    /* ---------- Reading ---------- */

    function backToStart() {
        index = 0;
        highlight(-1);
        setState('idle');
    }

    function speakNext(myRun) {
        if (myRun !== run) { return; }

        if (index >= sentences.length) {   // reached the end
            backToStart();
            return;
        }

        if (reading !== index) { highlight(index, false); }

        var utterance = new window.SpeechSynthesisUtterance(sentences[index].text);
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
            backToStart();
            if (status) { status.textContent = 'This browser could not read the essay aloud.'; }
        };

        current = utterance;
        synth.speak(utterance);
    }

    // Start reading from sentence i. If something is being spoken right now it
    // has to be cancelled first, and browsers need a moment after a cancel
    // before they will reliably speak again.
    function startAt(i, speakingNow) {
        run += 1;
        var myRun = run;
        index = i;
        setState('playing');
        highlight(i, true);
        if (speakingNow) {
            synth.cancel();
            window.setTimeout(function () { speakNext(myRun); }, 150);
        } else {
            speakNext(myRun);
        }
    }

    function play() {
        if (!prepared) { prepare(); }
        startAt(index, false);
    }

    function pause() {
        run += 1;
        synth.cancel();
        setState('paused');   // the highlight stays, to show where Resume picks up
    }

    /* ---------- Controls ---------- */

    button.addEventListener('click', function () {
        if (state === 'playing') { pause(); } else { play(); }
    });

    // Once listening has started, tapping or clicking a sentence jumps to it.
    essay.addEventListener('click', function (event) {
        if (state === 'idle') { return; }
        var target = event.target;
        if (!target || !target.closest || target.closest('a, button')) { return; }
        var span = target.closest('.sentence');
        if (!span) { return; }
        var selection = window.getSelection ? String(window.getSelection()) : '';
        if (selection.length) { return; }   // the reader is selecting text, not jumping
        startAt(Number(span.getAttribute('data-sentence')), state === 'playing');
    });

    // Keyboard equivalent: with the button focused, the left and right arrow
    // keys step back or forward one sentence.
    button.addEventListener('keydown', function (event) {
        if (state === 'idle') { return; }
        var step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
        if (!step) { return; }
        event.preventDefault();
        var next = Math.min(sentences.length - 1, Math.max(0, index + step));
        startAt(next, state === 'playing');
    });

    ['wheel', 'touchmove', 'keydown'].forEach(function (type) {
        window.addEventListener(type, function () { lastUserScroll = Date.now(); }, { passive: true });
    });

    // Stop when the reader leaves; some browsers otherwise keep talking on the next page.
    window.addEventListener('pagehide', function () {
        run += 1;
        synth.cancel();
        if (state === 'playing') { setState('paused'); }
    });

    synth.cancel();          // clear anything left queued by a previous page
    setState('idle');
    button.hidden = false;   // supported, so show the button
}());
