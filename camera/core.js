// ---------------------------------------------------------------------
// IndexedDB — minimal promise wrapper
// ---------------------------------------------------------------------
const DB_NAME = 'selfie-app';
const STORE = 'shots';
let dbPromise = null;

function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true });
        store.createIndex('createdAt', 'createdAt');
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

async function dbAdd(record) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    const req = tx.objectStore(STORE).add(record);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function dbGetAll() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).getAll();
    req.onsuccess = () => resolve(req.result.sort((a, b) => a.createdAt - b.createdAt));
    req.onerror = () => reject(req.error);
  });
}

async function dbDelete(ids) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    const store = tx.objectStore(STORE);
    ids.forEach((id) => store.delete(id));
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// ---------------------------------------------------------------------
// Elements
// ---------------------------------------------------------------------
const video = document.getElementById('video');
const canvas = document.getElementById('canvas');
const flash = document.getElementById('flash');
const camError = document.getElementById('camError');
const shutterBtn = document.getElementById('shutterBtn');
const flipBtn = document.getElementById('flipBtn');
const frameCounter = document.getElementById('frameCounter');

const openGalleryBtn = document.getElementById('openGallery');
const lastThumb = document.getElementById('lastThumb');
const thumbPlaceholder = document.getElementById('thumbPlaceholder');

const galleryView = document.getElementById('galleryView');
const closeGalleryBtn = document.getElementById('closeGallery');
const galleryCount = document.getElementById('galleryCount');
const grid = document.getElementById('grid');
const emptyState = document.getElementById('emptyState');
const deleteBtn = document.getElementById('deleteBtn');
const sendBtn = document.getElementById('sendBtn');

// ---------------------------------------------------------------------
// Camera
// ---------------------------------------------------------------------
let currentStream = null;
let facingMode = 'user'; // 'user' = front, 'environment' = rear
let shotCount = 0;
let selection = new Set();
const objectUrls = new Map(); // id -> object URL, so we can revoke later

async function startCamera() {
  if (currentStream) {
    currentStream.getTracks().forEach((t) => t.stop());
  }
  try {
    currentStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode, width: { ideal: 1080 }, height: { ideal: 1440 } },
      audio: false,
    });
    video.srcObject = currentStream;
    video.classList.toggle('rear', facingMode === 'environment');
    camError.classList.remove('show');
  } catch (err) {
    camError.classList.add('show');
  }
}

flipBtn.addEventListener('click', () => {
  facingMode = facingMode === 'user' ? 'environment' : 'user';
  startCamera();
});

// ---------------------------------------------------------------------
// Capture
// ---------------------------------------------------------------------
async function capture() {
  if (!currentStream) return;

  const w = video.videoWidth;
  const h = video.videoHeight;
  if (!w || !h) return;

  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');

  // Mirror the capture to match what the user sees for the front camera
  if (facingMode === 'user') {
    ctx.translate(w, 0);
    ctx.scale(-1, 1);
  }
  ctx.drawImage(video, 0, 0, w, h);

  flash.classList.remove('fire');
  void flash.offsetWidth; // restart animation
  flash.classList.add('fire');

  canvas.toBlob(async (blob) => {
    if (!blob) return;
    shotCount += 1;
    const record = {
      blob,
      frameNo: shotCount,
      createdAt: Date.now(),
    };
    await dbAdd(record);
    updateFrameCounter();
    refreshLastThumb();
  }, 'image/jpeg', 0.92);
}

shutterBtn.addEventListener('click', capture);

function updateFrameCounter() {
  frameCounter.textContent = String(shotCount).padStart(3, '0');
}

async function refreshLastThumb() {
  const all = await dbGetAll();
  if (all.length === 0) {
    lastThumb.style.display = 'none';
    thumbPlaceholder.style.display = 'block';
    return;
  }
  const last = all[all.length - 1];
  const url = getObjectUrl(last.id, last.blob);
  lastThumb.src = url;
  lastThumb.style.display = 'block';
  thumbPlaceholder.style.display = 'none';
}

function getObjectUrl(id, blob) {
  if (!objectUrls.has(id)) {
    objectUrls.set(id, URL.createObjectURL(blob));
  }
  return objectUrls.get(id);
}

// ---------------------------------------------------------------------
// Gallery
// ---------------------------------------------------------------------
async function renderGallery() {
  const all = await dbGetAll();
  shotCount = all.length ? Math.max(...all.map((s) => s.frameNo)) : 0;
  updateFrameCounter();

  galleryCount.textContent = `${all.length} shot${all.length === 1 ? '' : 's'}`;
  grid.innerHTML = '';

  if (all.length === 0) {
    emptyState.style.display = 'block';
  } else {
    emptyState.style.display = 'none';
    all.forEach((rec) => {
      const url = getObjectUrl(rec.id, rec.blob);
      const el = document.createElement('div');
      el.className = 'shot';
      el.dataset.id = rec.id;
      if (selection.has(rec.id)) el.classList.add('selected');
      el.innerHTML = `
        <img src="${url}" alt="Selfie frame ${rec.frameNo}">
        <div class="sel-ring"></div>
        <div class="check">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
            <path d="M20 6L9 17l-5-5"/>
          </svg>
        </div>
        <div class="frame-no">#${String(rec.frameNo).padStart(3, '0')}</div>
      `;
      el.addEventListener('click', () => toggleSelect(rec.id, el));
      grid.appendChild(el);
    });
  }

  updateFooter();
}

function toggleSelect(id, el) {
  if (selection.has(id)) {
    selection.delete(id);
    el.classList.remove('selected');
  } else {
    selection.add(id);
    el.classList.add('selected');
  }
  updateFooter();
}

function updateFooter() {
  const n = selection.size;
  deleteBtn.disabled = n === 0;
  deleteBtn.textContent = n > 0 ? `Delete (${n})` : 'Delete';
  // Send stays disabled — feature not built yet
  sendBtn.disabled = true;
}

deleteBtn.addEventListener('click', async () => {
  if (selection.size === 0) return;
  const ids = Array.from(selection);
  await dbDelete(ids);
  ids.forEach((id) => {
    if (objectUrls.has(id)) {
      URL.revokeObjectURL(objectUrls.get(id));
      objectUrls.delete(id);
    }
  });
  selection.clear();
  await renderGallery();
  await refreshLastThumb();
});

openGalleryBtn.addEventListener('click', async () => {
  await renderGallery();
  galleryView.classList.add('open');
});

closeGalleryBtn.addEventListener('click', () => {
  galleryView.classList.remove('open');
  selection.clear();
});

// ---------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------
(async function init() {
  await startCamera();
  await refreshLastThumb();
  const all = await dbGetAll();
  shotCount = all.length ? Math.max(...all.map((s) => s.frameNo)) : 0;
  updateFrameCounter();
})();
