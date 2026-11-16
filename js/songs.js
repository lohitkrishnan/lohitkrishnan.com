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
            link.replaceWith(frame);
        });
    });
})();
