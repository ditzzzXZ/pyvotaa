// ---- Configuration ---------------------------------------------------
const TRACK = {
  title: "Astaga Bercanda",
  artist: "",   // intentionally blank — not shown
  album: "",    // intentionally blank — not shown
  artworkUrl: "https://x9i81nmtlladecej.public.blob.vercel-storage.com/photo/astagabercandaaphoto.png",
  audioUrl: "https://x9i81nmtlladecej.public.blob.vercel-storage.com/music/astagabercandaa.mp3",
};
// ------------------------------------------------------------------------

const audio = document.getElementById('audio');
const gate = document.getElementById('gate');
const gateBtn = document.getElementById('gateBtn');
const gateArt = document.getElementById('gateArt');
const gateGlow = document.getElementById('gateGlow');
const artWrap = document.getElementById('artWrap');
const artImg = document.getElementById('art');
const backdrop = document.getElementById('backdrop');
const seekBar = document.getElementById('seekBar');
const curTimeEl = document.getElementById('curTime');
const durTimeEl = document.getElementById('durTime');
const playBtn = document.getElementById('playBtn');
const playIcon = document.getElementById('playIcon');
const pauseIcon = document.getElementById('pauseIcon');
const backBtn = document.getElementById('backBtn');
const fwdBtn = document.getElementById('fwdBtn');

let isScrubbing = false;

// ---- Wire up source + artwork ----
audio.src = TRACK.audioUrl;
artImg.src = TRACK.artworkUrl;
gateArt.src = TRACK.artworkUrl;
backdrop.style.setProperty('--cover-url', `url("${TRACK.artworkUrl}")`);
gateGlow.style.setProperty('--cover-url', `url("${TRACK.artworkUrl}")`);
document.title = TRACK.title;

// ---- Time formatting ----
function formatTime(sec) {
  if (!isFinite(sec) || sec < 0) sec = 0;
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

// ---- UI sync ----
function setPlayingUI(playing) {
  playIcon.style.display = playing ? 'none' : 'block';
  pauseIcon.style.display = playing ? 'block' : 'none';
  playBtn.setAttribute('aria-label', playing ? 'Pause' : 'Play');
  artWrap.classList.toggle('playing', playing);
  if ('mediaSession' in navigator) {
    navigator.mediaSession.playbackState = playing ? 'playing' : 'paused';
  }
}

function updateSeekFill() {
  const pct = seekBar.max > 0 ? (seekBar.value / seekBar.max) * 100 : 0;
  seekBar.style.setProperty('--fill', `${pct}%`);
}

audio.addEventListener('loadedmetadata', () => {
  seekBar.max = audio.duration || 0;
  durTimeEl.textContent = formatTime(audio.duration);
  if ('mediaSession' in navigator) {
    try {
      navigator.mediaSession.setPositionState({
        duration: audio.duration || 0,
        playbackRate: audio.playbackRate,
        position: audio.currentTime,
      });
    } catch (e) {}
  }
});

audio.addEventListener('timeupdate', () => {
  if (isScrubbing) return;
  seekBar.value = audio.currentTime;
  curTimeEl.textContent = formatTime(audio.currentTime);
  updateSeekFill();
});

audio.addEventListener('play', () => setPlayingUI(true));
audio.addEventListener('pause', () => setPlayingUI(false));

// ---- Seek bar: live scrub (audio jumps as you drag) ----
seekBar.addEventListener('input', () => {
  isScrubbing = true;
  audio.currentTime = parseFloat(seekBar.value);
  curTimeEl.textContent = formatTime(seekBar.value);
  updateSeekFill();
});
seekBar.addEventListener('change', () => {
  isScrubbing = false;
});

// ---- Controls ----
function togglePlay() {
  if (audio.paused) {
    audio.play().catch(() => {});
  } else {
    audio.pause();
  }
}

playBtn.addEventListener('click', togglePlay);
backBtn.addEventListener('click', () => {
  audio.currentTime = Math.max(0, audio.currentTime - 10);
});
fwdBtn.addEventListener('click', () => {
  audio.currentTime = Math.min(audio.duration || Infinity, audio.currentTime + 10);
});

// ---- Tap-to-start gate (satisfies browser autoplay policy) ----
function startPlayback() {
  audio.play().then(() => {
    gate.classList.add('hidden');
    setTimeout(() => { gate.style.display = 'none'; }, 450);
  }).catch(() => {
    // playback blocked for some reason — keep gate visible so user can retry
  });
}
gateBtn.addEventListener('click', startPlayback);
gate.addEventListener('click', (e) => {
  if (e.target === gate) startPlayback();
});

// ---- Media Session (lock screen / notification) ----
if ('mediaSession' in navigator) {
  navigator.mediaSession.metadata = new MediaMetadata({
    title: TRACK.title,
    artist: TRACK.artist,
    album: TRACK.album,
    artwork: [
      { src: TRACK.artworkUrl, sizes: '512x512', type: 'image/png' },
    ],
  });

  navigator.mediaSession.setActionHandler('play', () => audio.play().catch(() => {}));
  navigator.mediaSession.setActionHandler('pause', () => audio.pause());
  navigator.mediaSession.setActionHandler('seekbackward', () => {
    audio.currentTime = Math.max(0, audio.currentTime - 10);
  });
  navigator.mediaSession.setActionHandler('seekforward', () => {
    audio.currentTime = Math.min(audio.duration || Infinity, audio.currentTime + 10);
  });
  navigator.mediaSession.setActionHandler('seekto', (details) => {
    if (details.fastSeek && 'fastSeek' in audio) {
      audio.fastSeek(details.seekTime);
      return;
    }
    audio.currentTime = details.seekTime;
  });
}
