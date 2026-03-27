// ─── DOM ───────────────────────────────────────────────
const video          = document.getElementById('video-background');
const canvasContainer= document.getElementById('canvas-container');
const infoPanel      = document.getElementById('info-panel');
const descriptionText= document.getElementById('description-text');
const resetButton    = document.getElementById('reset-button');
const audioBtn       = document.getElementById('audio-btn');
const zoomInBtn      = document.getElementById('zoom-in');
const zoomOutBtn     = document.getElementById('zoom-out');
const spinnerOverlay = document.getElementById('spinner-overlay');
const loadingPercent = document.getElementById('loading-percent');
const scanHint       = document.getElementById('scan-hint');
const panelHandle    = document.getElementById('panel-handle');

// ─── State ─────────────────────────────────────────────
let scene, camera, renderer, controls, currentModel;
let isThreeReady    = false;
let scanning        = true;
let scanCanvas, scanContext;
let lastQRResult    = null;
let isModelLoading  = false;
let isModelActive   = false;
let currentModelId  = null;
let currentDescription = '';
let currentAudioUrl = null;
let speechSynth     = window.speechSynthesis;
let isPlaying       = false;
let currentFontSize = 15;

// ─── Spinner ───────────────────────────────────────────
function showSpinner() {
    spinnerOverlay.classList.add('active');
    loadingPercent.textContent = '0%';
}
function updateSpinnerPercent(pct) {
    loadingPercent.textContent = `${Math.round(pct)}%`;
}
function hideSpinner() {
    spinnerOverlay.classList.remove('active');
}

// ─── Panel helpers ─────────────────────────────────────
function showPanel() {
    infoPanel.classList.remove('hidden');
    // Trigger animation on next frame so CSS transition fires
    requestAnimationFrame(() => infoPanel.classList.add('visible'));
    scanHint.classList.add('hidden');
}
function hidePanel() {
    infoPanel.classList.remove('visible', 'expanded');
    infoPanel.classList.add('hidden');
    scanHint.classList.remove('hidden');
}
function expandPanel() {
    infoPanel.classList.add('expanded');
}
function collapsePanel() {
    infoPanel.classList.remove('expanded');
}
function isPanelExpanded() {
    return infoPanel.classList.contains('expanded');
}

// Toggle on handle / peek area click
panelHandle.addEventListener('click', () => {
    isPanelExpanded() ? collapsePanel() : expandPanel();
});
// Also allow tapping the peek row
document.querySelector('.panel-peek').addEventListener('click', () => {
    isPanelExpanded() ? collapsePanel() : expandPanel();
});

// Swipe gesture on the panel
let touchStartY = 0;
infoPanel.addEventListener('touchstart', (e) => {
    touchStartY = e.touches[0].clientY;
}, { passive: true });
infoPanel.addEventListener('touchmove', (e) => {
    const delta = e.touches[0].clientY - touchStartY;
    if (delta < -40 && !isPanelExpanded()) {
        expandPanel();
    } else if (delta > 40 && isPanelExpanded()) {
        collapsePanel();
    }
}, { passive: true });

// ─── Reset ─────────────────────────────────────────────
function resetModel() {
    if (currentModel) scene.remove(currentModel);
    currentModel      = null;
    isModelActive     = false;
    isModelLoading    = false;
    currentModelId    = null;
    lastQRResult      = null;
    if (speechSynth.speaking) speechSynth.cancel();
    isPlaying = false;
    audioBtn.textContent = '🔊';
    audioBtn.classList.remove('audio-active');
    hidePanel();
}
resetButton.onclick = resetModel;

// ─── Load model ────────────────────────────────────────
async function loadModel(modelId) {
    if (isModelLoading || isModelActive) return;
    isModelLoading = true;
    if (currentModel) scene.remove(currentModel);
    showSpinner();

    try {
        const res = await fetch(`/api/models/${modelId}`);
        if (!res.ok) throw new Error('Model not found');
        const data = await res.json();

        currentDescription = data.description || 'Нет описания';
        currentAudioUrl    = data.audioFilename ? `/api/models/${modelId}/audio` : null;
        descriptionText.innerText = currentDescription;
        descriptionText.style.fontSize = `${currentFontSize}px`;
        currentModelId = modelId;

        const loader = new THREE.GLTFLoader();
        loader.load(
            `/api/models/${modelId}/file`,
            (gltf) => {
                currentModel = gltf.scene;
                const box    = new THREE.Box3().setFromObject(currentModel);
                const size   = box.getSize(new THREE.Vector3());
                const scale  = 1.2 / Math.max(size.x, size.y, size.z);
                currentModel.scale.set(scale, scale, scale);
                const center = box.getCenter(new THREE.Vector3());
                currentModel.position.set(
                    -center.x * scale,
                    -center.y * scale,
                    -center.z * scale
                );
                scene.add(currentModel);
                hideSpinner();
                isModelLoading = false;
                isModelActive  = true;
                showPanel();
            },
            (xhr) => {
                if (xhr.lengthComputable) {
                    updateSpinnerPercent((xhr.loaded / xhr.total) * 100);
                }
            },
            (err) => {
                console.error('Load error:', err);
                hideSpinner();
                isModelLoading = false;
                isModelActive  = false;
            }
        );
    } catch (err) {
        console.error(err);
        hideSpinner();
        isModelLoading = false;
        isModelActive  = false;
    }
}

// ─── Audio ─────────────────────────────────────────────
function playDescription() {
    if (isPlaying) {
        if (speechSynth.speaking) speechSynth.cancel();
        isPlaying = false;
        audioBtn.textContent = '🔊';
        audioBtn.classList.remove('audio-active');
        return;
    }

    const onPlay = () => {
        isPlaying = true;
        audioBtn.textContent = '■';
        audioBtn.classList.add('audio-active');
    };
    const onEnd = () => {
        isPlaying = false;
        audioBtn.textContent = '🔊';
        audioBtn.classList.remove('audio-active');
    };

    if (currentAudioUrl) {
        const audio = new Audio(currentAudioUrl);
        audio.onplay  = onPlay;
        audio.onended = onEnd;
        audio.onerror = onEnd;
        audio.play();
    } else {
        if (!currentDescription) return;
        const utterance  = new SpeechSynthesisUtterance(currentDescription);
        utterance.lang   = 'ru-RU';
        utterance.onstart= onPlay;
        utterance.onend  = onEnd;
        utterance.onerror= onEnd;
        speechSynth.speak(utterance);
    }
}
audioBtn.onclick = playDescription;

// ─── Font size ─────────────────────────────────────────
function zoomText(delta) {
    currentFontSize = Math.min(28, Math.max(11, currentFontSize + delta));
    descriptionText.style.fontSize = `${currentFontSize}px`;
}
zoomInBtn.onclick  = () => zoomText(2);
zoomOutBtn.onclick = () => zoomText(-2);

// ─── QR Scanner ────────────────────────────────────────
async function setupQRScanner() {
    const isSecure =
        location.protocol === 'https:' ||
        location.hostname  === 'localhost' ||
        location.hostname  === '127.0.0.1';
    if (!isSecure) return console.warn('HTTPS required for camera');

    try {
        const stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: 'environment' }
        });
        video.srcObject = stream;
        await video.play();

        scanCanvas  = document.createElement('canvas');
        scanContext = scanCanvas.getContext('2d');

        function scanFrame() {
            if (!scanning) return;
            if (isModelActive || isModelLoading) {
                requestAnimationFrame(scanFrame);
                return;
            }
            if (video.videoWidth === 0 || video.videoHeight === 0) {
                requestAnimationFrame(scanFrame);
                return;
            }
            scanCanvas.width  = video.videoWidth;
            scanCanvas.height = video.videoHeight;
            scanContext.drawImage(video, 0, 0, scanCanvas.width, scanCanvas.height);
            const imageData = scanContext.getImageData(0, 0, scanCanvas.width, scanCanvas.height);
            const code = jsQR(imageData.data, imageData.width, imageData.height, {
                inversionAttempts: 'dontInvert'
            });
            if (code && code.data !== lastQRResult) {
                lastQRResult = code.data;
                let id = null;
                if (code.data.includes('scanner.html?id=')) {
                    id = new URL(code.data).searchParams.get('id');
                } else {
                    id = code.data;
                }
                if (id) loadModel(id);
            }
            requestAnimationFrame(scanFrame);
        }
        scanFrame();
    } catch (err) {
        console.error('Camera error:', err);
    }
}

// ─── Three.js ─────────────────────────────────────────
function initThree() {
    scene = new THREE.Scene();
    scene.background = null;

    camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, 1, 2);
    camera.lookAt(0, 0, 0);

    renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setClearColor(0x000000, 0);
    canvasContainer.appendChild(renderer.domElement);

    controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableZoom    = true;
    controls.enablePan     = true;
    controls.zoomSpeed     = 1.2;
    controls.rotateSpeed   = 1.0;
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;

    // Lighting
    scene.add(new THREE.AmbientLight(0xffffff, 0.7));
    const dir = new THREE.DirectionalLight(0xffffff, 0.9);
    dir.position.set(1, 1.5, 1);
    scene.add(dir);
    const back = new THREE.DirectionalLight(0x88ccff, 0.35);
    back.position.set(-1, 0.5, -1);
    scene.add(back);
    const rim = new THREE.DirectionalLight(0x00e5ff, 0.2);
    rim.position.set(0, -1, 0);
    scene.add(rim);

    isThreeReady = true;
    animate();
}

function animate() {
    requestAnimationFrame(animate);
    if (controls) controls.update();
    if (renderer && scene && camera) renderer.render(scene, camera);
}

window.addEventListener('resize', () => {
    if (!camera || !renderer) return;
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

// ─── Boot ─────────────────────────────────────────────
const urlParams  = new URLSearchParams(window.location.search);
const idFromUrl  = urlParams.get('id');
if (idFromUrl) loadModel(idFromUrl);

initThree();
setupQRScanner();
