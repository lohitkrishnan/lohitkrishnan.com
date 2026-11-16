// Show a thumbnail first and load the YouTube player only when someone presses play.
(function () {
    document.querySelectorAll('[data-youtube]').forEach(function (link) {
        link.addEventListener('click', function (e) {
            e.preventDefault();
            var id = link.getAttribute('data-youtube');
            var frame = document.createElement('iframe');
            frame.src = 'https://www.youtube-nocookie.com/embed/' + id + '?autoplay=1&rel=0';
            frame.title = link.getAttribute('aria-label').replace(/^Play /, '');
            frame.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen';
            frame.allowFullscreen = true;
            frame.className = 'song-frame';
            // take the thumbnail's size, so the player never shrinks to the browser's default
            var box = link.getBoundingClientRect();
            frame.width = Math.round(box.width) || 640;
            frame.height = Math.round(box.width * 9 / 16) || 360;
            frame.style.width = '100%';
            frame.style.height = 'auto';
            frame.style.aspectRatio = '16 / 9';
            link.replaceWith(frame);
        });
    });
})();
