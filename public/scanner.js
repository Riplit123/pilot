// DOM elements
const video = document.getElementById('video-background');
const canvasContainer = document.getElementById('canvas-container');
const infoPanel = document.getElementById('info-panel');
const modelTitle = document.getElementById('model-title');
const modelDescription = document.getElementById('model-description');
const scanOverlay = document.getElementById('scan-overlay');
const statusDiv = document.getElementById('status');

// Three.js globals
let scene, camera, renderer, controls, currentModel;
let isThreeReady = false;

// QR scanning
let scanning = true;
let scanCanvas, scanContext;
let lastQRResult = null;

// Helper для обновления статуса
function setStatus(text, isError = false) {
    statusDiv.innerText = text;
    if (isError) {
        statusDiv.classList.add('error-status');
    } else {
        statusDiv.classList.remove('error-status');
    }
}

// Initialize Three.js (transparent background, overlay on video)
function initThree() {
    scene = new THREE.Scene();
    scene.background = null; // transparent

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

// Load 3D model from server
async function loadModel(modelId) {
    if (!isThreeReady) return;
    if (currentModel) {
        scene.remove(currentModel);
        currentModel = null;
    }
    setStatus(`🔄 Загрузка модели ${modelId}...`);
    try {
        const modelUrl = `/api/models/${modelId}/file`;
        const loader = new THREE.GLTFLoader();
        loader.load(modelUrl, (gltf) => {
            currentModel = gltf.scene;
            // Scale and center model
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

            // Fetch metadata
            fetch(`/api/models/${modelId}`)
                .then(res => res.json())
                .then(data => {
                    modelTitle.innerText = data.originalName || '3D Модель';
                    modelDescription.innerText = data.description || 'Нет описания';
                    infoPanel.classList.remove('hidden');
                })
                .catch(err => console.error('Metadata error:', err));
            setStatus(`✅ Модель загружена (ID: ${modelId})`);
            scanOverlay.classList.add('hidden');
        }, undefined, (error) => {
            console.error('Load error:', error);
            setStatus(`❌ Ошибка загрузки модели: ${error.message}`, true);
        });
    } catch (err) {
        console.error(err);
        setStatus(`❌ Ошибка: ${err.message}`, true);
    }
}

// QR scanning from video feed
async function setupQRScanner() {
    // Проверка, что страница открыта через HTTPS (кроме localhost)
    const isSecure = location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1';
    if (!isSecure) {
        setStatus('⚠️ Для доступа к камере требуется HTTPS. Откройте страницу через HTTPS или используйте localhost.', true);
        scanOverlay.innerHTML = '🔒 Доступ к камере недоступен.<br>Используйте HTTPS или локальный хост.';
        return;
    }

    try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        video.srcObject = stream;
        await video.play();
        setStatus('📷 Камера готова, сканируйте QR...');

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
                setStatus(`🔍 Найден QR: ${code.data}`);
                loadModel(code.data);
                // Если нужно сканировать только один раз, раскомментируйте:
                // scanning = false;
            }
            requestAnimationFrame(scanFrame);
        }
        scanFrame();
    } catch (err) {
        console.error('Camera error:', err);
        let errorMsg = '❌ Не удалось получить доступ к камере. ';
        if (err.name === 'NotAllowedError') {
            errorMsg += 'Пользователь запретил доступ. Разрешите камеру в настройках браузера.';
        } else if (err.name === 'NotFoundError') {
            errorMsg += 'На устройстве не найдена камера.';
        } else if (err.name === 'NotReadableError') {
            errorMsg += 'Камера занята другим приложением.';
        } else if (err.name === 'OverconstrainedError') {
            errorMsg += 'Не удалось найти подходящую камеру (возможно, нет тыльной камеры).';
        } else {
            errorMsg += err.message;
        }
        setStatus(errorMsg, true);
        scanOverlay.innerHTML = '📷 Ошибка камеры<br>' + errorMsg;
    }
}

// Resize handler
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