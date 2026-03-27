// DOM elements
const video = document.getElementById('video-background');
const canvasContainer = document.getElementById('canvas-container');
const infoPanel = document.getElementById('info-panel');
const modelDescription = document.getElementById('model-description');
const progressContainer = document.getElementById('progress-container');
const progressBar = document.getElementById('progress-bar');
const resetButton = document.getElementById('reset-button');
const speakBtn = document.getElementById('text-speak-btn');
const incFontBtn = document.getElementById('text-inc-btn');
const decFontBtn = document.getElementById('text-dec-btn');

// Three.js globals
let scene, camera, renderer, controls, currentModel;
let isThreeReady = false;

// QR scanning
let scanning = true;
let scanCanvas, scanContext;
let lastQRResult = null;

// Флаги блокировки
let isModelLoading = false;
let isModelActive = false;

// Текущий ID модели
let currentModelId = null;

// Web Speech
let speechSynth = window.speechSynthesis;
let currentUtterance = null;

// Размер шрифта (базовый 15px)
let currentFontSize = 15;
const MIN_FONT = 12;
const MAX_FONT = 24;

// Progress bar
function showProgress(percent) {
    if (!progressContainer.classList.contains('progress-visible')) {
        progressContainer.classList.add('progress-visible');
    }
    progressBar.style.width = `${percent}%`;
}
function hideProgress() {
    progressContainer.classList.remove('progress-visible');
    progressBar.style.width = '0%';
}

// Панель: свайп вверх/вниз
let panelStartY = 0;
let isDragging = false;
let isExpanded = false;

function setPanelExpanded(expanded) {
    if (expanded) {
        infoPanel.classList.add('expanded');
        isExpanded = true;
    } else {
        infoPanel.classList.remove('expanded');
        isExpanded = false;
    }
}

infoPanel.addEventListener('touchstart', (e) => {
    panelStartY = e.touches[0].clientY;
    isDragging = true;
});
infoPanel.addEventListener('touchmove', (e) => {
    if (!isDragging) return;
    const delta = e.touches[0].clientY - panelStartY;
    if (!isExpanded && delta < -30) {
        // свайп вверх → раскрыть
        setPanelExpanded(true);
        isDragging = false;
    } else if (isExpanded && delta > 50) {
        // свайп вниз → свернуть
        setPanelExpanded(false);
        isDragging = false;
    }
});
infoPanel.addEventListener('touchend', () => { isDragging = false; });
// Также клик по ручке для раскрытия/сворачивания
infoPanel.querySelector('.panel-handle').addEventListener('click', () => {
    setPanelExpanded(!isExpanded);
});

// Управление шрифтом
function updateFontSize() {
    modelDescription.style.fontSize = currentFontSize + 'px';
}
incFontBtn.addEventListener('click', () => {
    if (currentFontSize < MAX_FONT) {
        currentFontSize += 2;
        updateFontSize();
    }
});
decFontBtn.addEventListener('click', () => {
    if (currentFontSize > MIN_FONT) {
        currentFontSize -= 2;
        updateFontSize();
    }
});

// Озвучивание текста
function speakText(text) {
    if (!speechSynth) return;
    if (currentUtterance) {
        speechSynth.cancel();
    }
    currentUtterance = new SpeechSynthesisUtterance(text);
    currentUtterance.lang = 'ru-RU';
    currentUtterance.rate = 0.9;
    speechSynth.speak(currentUtterance);
}
speakBtn.addEventListener('click', () => {
    const text = modelDescription.innerText;
    if (text && text !== 'Нет описания') {
        speakText(text);
    }
});

// Сброс модели
function resetModel() {
    if (currentModel) {
        scene.remove(currentModel);
        currentModel = null;
    }
    infoPanel.classList.add('hidden');
    isModelActive = false;
    isModelLoading = false;
    currentModelId = null;
    if (currentUtterance) {
        speechSynth.cancel();
    }
    // Не сбрасываем lastQRResult, но разрешаем сканирование
}

// Загрузка модели (с блокировкой)
async function loadModel(modelId) {
    if (!isThreeReady) return;
    if (isModelLoading || isModelActive) return;
    isModelLoading = true;
    if (currentModel) {
        scene.remove(currentModel);
        currentModel = null;
    }
    currentModelId = modelId;
    showProgress(0);
    try {
        const modelUrl = `/api/models/${modelId}/file`;
        const loader = new THREE.GLTFLoader();
        loader.load(modelUrl, (gltf) => {
            currentModel = gltf.scene;
            const box = new THREE.Box3().setFromObject(currentModel);
            const size = box.getSize(new THREE.Vector3());
            const maxDim = Math.max(size.x, size.y, size.z);
            const scale = 1.2 / maxDim;
            currentModel.scale.set(scale, scale, scale);
            const center = box.getCenter(new THREE.Vector3());
            currentModel.position.x = -center.x * scale;
            currentModel.position.y = -center.y * scale;
            currentModel.position.z = -center.z * scale;
            scene.add(currentModel);

            // Загружаем метаданные
            fetch(`/api/models/${modelId}`)
                .then(res => res.json())
                .then(data => {
                    modelDescription.innerText = data.description || 'Нет описания';
                    infoPanel.classList.remove('hidden');
                    setPanelExpanded(false);
                    // Сброс шрифта к базовому
                    currentFontSize = 15;
                    updateFontSize();
                })
                .catch(err => console.error('Metadata error:', err));
            hideProgress();
            isModelLoading = false;
            isModelActive = true;
        }, (xhr) => {
            if (xhr.lengthComputable) {
                showProgress((xhr.loaded / xhr.total) * 100);
            }
        }, (error) => {
            console.error('Load error:', error);
            hideProgress();
            isModelLoading = false;
            isModelActive = false;
        });
    } catch (err) {
        console.error(err);
        hideProgress();
        isModelLoading = false;
        isModelActive = false;
    }
}

// Получение modelId из URL
function getModelIdFromUrl() {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get('model');
}

// QR сканер (блокируется при активности)
async function setupQRScanner() {
    const isSecure = location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1';
    if (!isSecure) return;

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
                // Из QR может прийти полный URL с параметром model
                let modelId = null;
                try {
                    const url = new URL(code.data);
                    modelId = url.searchParams.get('model');
                } catch (e) {
                    // если не URL, пробуем считать сам code.data как ID
                    modelId = code.data;
                }
                if (modelId) {
                    loadModel(modelId);
                }
            }
            requestAnimationFrame(scanFrame);
        }
        scanFrame();
    } catch (err) {
        console.error('Camera error:', err);
    }
}

// Three.js init
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

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(1, 1, 1);
    scene.add(directionalLight);
    const backLight = new THREE.DirectionalLight(0xffffff, 0.4);
    backLight.position.set(-0.5, 0, -1);
    scene.add(backLight);

    isThreeReady = true;
    animate();
}

function animate() {
    requestAnimationFrame(animate);
    if (controls) controls.update();
    if (renderer && scene && camera) {
        renderer.render(scene, camera);
    }
}

window.addEventListener('resize', () => {
    if (camera && renderer) {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
    }
});

resetButton.addEventListener('click', resetModel);

// Старт
initThree();
setupQRScanner();

// Если в URL есть параметр model, загружаем его сразу
const initialModelId = getModelIdFromUrl();
if (initialModelId) {
    // Даём время инициализироваться
    setTimeout(() => loadModel(initialModelId), 500);
}
