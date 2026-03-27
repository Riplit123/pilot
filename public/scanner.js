// DOM elements
const video = document.getElementById('video-background');
const canvasContainer = document.getElementById('canvas-container');
const infoPanel = document.getElementById('info-panel');
const descriptionText = document.getElementById('description-text');
const resetButton = document.getElementById('reset-button');
const audioBtn = document.getElementById('audio-btn');
const zoomInBtn = document.getElementById('zoom-in');
const zoomOutBtn = document.getElementById('zoom-out');
const panelControls = document.getElementById('panel-controls');
const spinnerOverlay = document.getElementById('spinner-overlay');

let scene, camera, renderer, controls, currentModel;
let isThreeReady = false;
let scanning = true;
let scanCanvas, scanContext;
let lastQRResult = null;
let isModelLoading = false;
let isModelActive = false;
let currentModelId = null;
let currentDescription = '';
let currentAudioUrl = null;
let speechSynth = window.speechSynthesis;
let isPlaying = false;

// Управление спиннером
function showSpinner() {
    spinnerOverlay.classList.add('active');
}
function hideSpinner() {
    spinnerOverlay.classList.remove('active');
}

// Панель управления (кнопки) показываем/скрываем внутри плашки
function showControls(show) {
    if (show) {
        panelControls.classList.add('visible');
    } else {
        panelControls.classList.remove('visible');
    }
}

// Сброс модели
function resetModel() {
    if (currentModel) scene.remove(currentModel);
    currentModel = null;
    infoPanel.classList.add('hidden');
    isModelActive = false;
    isModelLoading = false;
    currentModelId = null;
    showControls(false);
    if (speechSynth.speaking) speechSynth.cancel();
    isPlaying = false;
    audioBtn.textContent = '🔊';
}

// Загрузка модели
async function loadModel(modelId) {
    if (isModelLoading || isModelActive) return;
    isModelLoading = true;
    if (currentModel) scene.remove(currentModel);
    showSpinner();
    showControls(false); // скрываем кнопки на время загрузки
    try {
        const res = await fetch(`/api/models/${modelId}`);
        if (!res.ok) throw new Error('Model not found');
        const data = await res.json();
        currentDescription = data.description || 'Нет описания';
        currentAudioUrl = data.audioFilename ? `/api/models/${modelId}/audio` : null;
        descriptionText.innerText = currentDescription;
        descriptionText.style.fontSize = '15px';
        infoPanel.classList.remove('hidden');
        infoPanel.classList.remove('expanded'); // свёрнут по умолчанию
        currentModelId = modelId;

        const modelUrl = `/api/models/${modelId}/file`;
        const loader = new THREE.GLTFLoader();
        loader.load(modelUrl, (gltf) => {
            currentModel = gltf.scene;
            const box = new THREE.Box3().setFromObject(currentModel);
            const size = box.getSize(new THREE.Vector3());
            const scale = 1.2 / Math.max(size.x, size.y, size.z);
            currentModel.scale.set(scale, scale, scale);
            const center = box.getCenter(new THREE.Vector3());
            currentModel.position.set(-center.x * scale, -center.y * scale, -center.z * scale);
            scene.add(currentModel);
            hideSpinner();
            isModelLoading = false;
            isModelActive = true;
            showControls(true); // показываем кнопки после загрузки
        }, undefined, (err) => {
            console.error('Load error:', err);
            hideSpinner();
            isModelLoading = false;
            isModelActive = false;
            infoPanel.classList.add('hidden');
            showControls(false);
        });
    } catch (err) {
        console.error(err);
        hideSpinner();
        isModelLoading = false;
        isModelActive = false;
        infoPanel.classList.add('hidden');
        showControls(false);
    }
}

// Аудио: либо кастомный MP3, либо TTS
function playDescription() {
    if (isPlaying) {
        if (speechSynth.speaking) speechSynth.cancel();
        isPlaying = false;
        audioBtn.textContent = '🔊';
        return;
    }
    if (currentAudioUrl) {
        const audio = new Audio(currentAudioUrl);
        audio.play();
        audio.onended = () => { isPlaying = false; audioBtn.textContent = '🔊'; };
        audio.onplay = () => { isPlaying = true; audioBtn.textContent = '🔊⏵'; };
        audio.onerror = () => { isPlaying = false; audioBtn.textContent = '🔊'; };
    } else {
        if (!currentDescription) return;
        const utterance = new SpeechSynthesisUtterance(currentDescription);
        utterance.lang = 'ru-RU';
        utterance.onstart = () => { isPlaying = true; audioBtn.textContent = '🔊⏵'; };
        utterance.onend = () => { isPlaying = false; audioBtn.textContent = '🔊'; };
        utterance.onerror = () => { isPlaying = false; audioBtn.textContent = '🔊'; };
        speechSynth.speak(utterance);
    }
}

// Масштабирование текста
let currentFontSize = 15;
function zoomText(delta) {
    currentFontSize = Math.min(28, Math.max(12, currentFontSize + delta));
    descriptionText.style.fontSize = `${currentFontSize}px`;
}
zoomInBtn.onclick = () => zoomText(2);
zoomOutBtn.onclick = () => zoomText(-2);
audioBtn.onclick = playDescription;

// Сброс
resetButton.onclick = () => resetModel();

// Панель описания: свайп вверх/вниз и клик
let startY = 0, isDraggingPanel = false;
function togglePanel(expand) {
    if (expand) infoPanel.classList.add('expanded');
    else infoPanel.classList.remove('expanded');
}
infoPanel.addEventListener('touchstart', (e) => {
    startY = e.touches[0].clientY;
    isDraggingPanel = true;
});
infoPanel.addEventListener('touchmove', (e) => {
    if (!isDraggingPanel) return;
    const delta = e.touches[0].clientY - startY;
    if (delta > 40 && infoPanel.classList.contains('expanded')) {
        togglePanel(false);
        isDraggingPanel = false;
    } else if (delta < -40 && !infoPanel.classList.contains('expanded')) {
        togglePanel(true);
        isDraggingPanel = false;
    }
});
infoPanel.addEventListener('touchend', () => isDraggingPanel = false);
infoPanel.addEventListener('click', (e) => {
    if (!infoPanel.classList.contains('expanded') && (e.target === infoPanel || e.target.classList.contains('panel-handle'))) {
        togglePanel(true);
    }
});

// QR сканирование (только если модель не активна и не загружается)
async function setupQRScanner() {
    const isSecure = location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1';
    if (!isSecure) return console.warn('HTTPS required for camera');
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        video.srcObject = stream;
        await video.play();
        scanCanvas = document.createElement('canvas');
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
            scanCanvas.width = video.videoWidth;
            scanCanvas.height = video.videoHeight;
            scanContext.drawImage(video, 0, 0, scanCanvas.width, scanCanvas.height);
            const imageData = scanContext.getImageData(0, 0, scanCanvas.width, scanCanvas.height);
            const code = jsQR(imageData.data, imageData.width, imageData.height, { inversionAttempts: 'dontInvert' });
            if (code && code.data !== lastQRResult) {
                lastQRResult = code.data;
                let id = null;
                if (code.data.includes('scanner.html?id=')) {
                    const url = new URL(code.data);
                    id = url.searchParams.get('id');
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

// Инициализация Three.js
function initThree() {
    scene = new THREE.Scene();
    scene.background = null;
    camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, 1, 2);
    camera.lookAt(0, 0, 0);
    renderer = new THREE.WebGLRenderer({ alpha: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setClearColor(0x000000, 0);
    canvasContainer.appendChild(renderer.domElement);
    controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableZoom = true;
    controls.enablePan = true;
    controls.zoomSpeed = 1.2;
    controls.rotateSpeed = 1.0;
    const ambient = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambient);
    const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight.position.set(1, 1, 1);
    scene.add(dirLight);
    const backLight = new THREE.DirectionalLight(0xffffff, 0.4);
    backLight.position.set(-0.5, 0, -1);
    scene.add(backLight);
    isThreeReady = true;
    animate();
}
function animate() {
    requestAnimationFrame(animate);
    if (controls) controls.update();
    if (renderer && scene && camera) renderer.render(scene, camera);
}
window.addEventListener('resize', () => {
    if (camera && renderer) {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
    }
});

// Загрузка модели из URL-параметра
const urlParams = new URLSearchParams(window.location.search);
const idFromUrl = urlParams.get('id');
if (idFromUrl) loadModel(idFromUrl);

initThree();
setupQRScanner();
