// DOM elements
const video = document.getElementById('video-background');
const canvasContainer = document.getElementById('canvas-container');
const infoPanel = document.getElementById('info-panel');
const modelDescription = document.getElementById('model-description');
const statusMessageSpan = document.getElementById('status-message');
const statusIconSpan = document.querySelector('#status-text .status-icon');
const statusBar = document.getElementById('status-bar');
const progressContainer = document.getElementById('progress-container');
const progressBar = document.getElementById('progress-bar');

// Three.js globals
let scene, camera, renderer, controls, currentModel;
let isThreeReady = false;

// QR scanning
let scanning = true;
let scanCanvas, scanContext;
let lastQRResult = null;

// Helper for status updates
function setStatus(message, isError = false) {
    statusMessageSpan.innerText = message;
    if (isError) {
        statusBar.classList.add('error-status');
        statusIconSpan.innerText = '⚠️';
    } else {
        statusBar.classList.remove('error-status');
        if (message.includes('готова')) statusIconSpan.innerText = '📷';
        else if (message.includes('QR')) statusIconSpan.innerText = '🔍';
        else if (message.includes('Загрузка')) statusIconSpan.innerText = '📥';
        else statusIconSpan.innerText = '🔄';
    }
}

// Progress bar control
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

// Panel expand/collapse logic
let panelStartY = 0;
let isDragging = false;

function togglePanel(expand) {
    if (expand) {
        infoPanel.classList.add('expanded');
    } else {
        infoPanel.classList.remove('expanded');
    }
}

// Touch events for swipe down to collapse
infoPanel.addEventListener('touchstart', (e) => {
    if (!infoPanel.classList.contains('expanded')) return;
    panelStartY = e.touches[0].clientY;
    isDragging = true;
});

infoPanel.addEventListener('touchmove', (e) => {
    if (!isDragging) return;
    const delta = e.touches[0].clientY - panelStartY;
    if (delta > 50) {
        togglePanel(false);
        isDragging = false;
    }
});

infoPanel.addEventListener('touchend', () => {
    isDragging = false;
});

// Click on panel to expand (if collapsed)
infoPanel.addEventListener('click', (e) => {
    if (!infoPanel.classList.contains('expanded')) {
        togglePanel(true);
    }
});

// Load 3D model with progress (без текстовых сообщений о проценте)
async function loadModel(modelId) {
    if (!isThreeReady) return;
    if (currentModel) {
        scene.remove(currentModel);
        currentModel = null;
    }
    // Показываем прогресс-бар, но не меняем статусную строку
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

            fetch(`/api/models/${modelId}`)
                .then(res => res.json())
                .then(data => {
                    modelDescription.innerText = data.description || 'Нет описания';
                    infoPanel.classList.remove('hidden');
                    togglePanel(false);
                })
                .catch(err => console.error('Metadata error:', err));
            
            // После загрузки скрываем прогресс-бар и не выводим текстовое сообщение
            hideProgress();
            // Статусную строку можно оставить как "Камера готова..." (не меняем)
            // Но если хотим показать, что модель загружена, можно просто ничего не писать.
            // Оставляем без изменений.
        }, (xhr) => {
            if (xhr.lengthComputable) {
                const percentComplete = (xhr.loaded / xhr.total) * 100;
                showProgress(percentComplete);
                // Убираем текстовое сообщение о проценте:
                // setStatus(`Загрузка: ${Math.round(percentComplete)}%`); 
                // больше не вызываем
            }
        }, (error) => {
            console.error('Load error:', error);
            setStatus(`Ошибка загрузки модели`, true);
            hideProgress();
        });
    } catch (err) {
        console.error(err);
        setStatus(`Ошибка: ${err.message}`, true);
        hideProgress();
    }
}

// QR scanning
async function setupQRScanner() {
    const isSecure = location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1';
    if (!isSecure) {
        setStatus('Требуется HTTPS (используйте ngrok или localhost)', true);
        return;
    }

    try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        video.srcObject = stream;
        await video.play();
        setStatus('Камера готова, наведите на QR-код');

        scanCanvas = document.createElement('canvas');
        scanContext = scanCanvas.getContext('2d');

        function scanFrame() {
            if (!scanning) return;
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
                setStatus(`QR найден, загружаем...`);
                loadModel(code.data);
            }
            requestAnimationFrame(scanFrame);
        }
        scanFrame();
    } catch (err) {
        console.error('Camera error:', err);
        let errorMsg = 'Не удалось получить доступ к камере. ';
        if (err.name === 'NotAllowedError') {
            errorMsg += 'Разрешите доступ в настройках браузера.';
        } else if (err.name === 'NotFoundError') {
            errorMsg += 'На устройстве не найдена камера.';
        } else if (err.name === 'NotReadableError') {
            errorMsg += 'Камера занята другим приложением.';
        } else {
            errorMsg += err.message;
        }
        setStatus(errorMsg, true);
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

// Resize
window.addEventListener('resize', () => {
    if (camera && renderer) {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
    }
});

// Start
initThree();
setupQRScanner();
