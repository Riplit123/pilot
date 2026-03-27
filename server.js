const express = require('express');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const qrcode = require('qrcode');
const path = require('path');
const fs = require('fs');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

// Логирование всех запросов
app.use((req, res, next) => {
    console.log(`${req.method} ${req.url}`);
    next();
});

const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
    console.log(`Created uploads directory: ${uploadsDir}`);
} else {
    console.log(`Uploads directory exists: ${uploadsDir}`);
}

const modelsFilePath = path.join(__dirname, 'models.json');
console.log(`Models file path: ${modelsFilePath}`);

// Функция загрузки моделей с проверкой существования файла
function loadModels() {
    if (!fs.existsSync(modelsFilePath)) {
        console.log('models.json not found, creating empty');
        saveModels([]);
        return [];
    }
    try {
        const data = fs.readFileSync(modelsFilePath, 'utf8');
        const parsed = JSON.parse(data);
        const models = parsed.models || [];
        console.log(`Loaded ${models.length} models`);
        return models;
    } catch (e) {
        console.error('Error reading models.json:', e);
        return [];
    }
}

function saveModels(models) {
    try {
        fs.writeFileSync(modelsFilePath, JSON.stringify({ models }, null, 2));
        console.log(`Saved ${models.length} models to ${modelsFilePath}`);
    } catch (e) {
        console.error('Error writing models.json:', e);
    }
}

// Маршрут для получения списка моделей
app.get('/api/models', (req, res) => {
    try {
        const models = loadModels();
        res.json(models);
    } catch (err) {
        console.error('Error in /api/models:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Загрузка модели
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadsDir),
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase();
        cb(null, `${uuidv4()}${ext}`);
    }
});
const upload = multer({ storage, limits: { fileSize: 200 * 1024 * 1024 } });

app.post('/api/models', upload.fields([{ name: 'model', maxCount: 1 }, { name: 'audio', maxCount: 1 }]), async (req, res) => {
    try {
        console.log('Upload request received');
        const { description } = req.body;
        const modelFile = req.files['model'] ? req.files['model'][0] : null;
        const audioFile = req.files['audio'] ? req.files['audio'][0] : null;

        if (!modelFile) throw new Error('No model file uploaded');

        const ext = path.extname(modelFile.originalname).toLowerCase();
        if (ext !== '.glb') throw new Error('Only .glb files are allowed');

        const modelId = uuidv4();
        const modelFileName = `${modelId}.glb`;
        const modelPath = path.join(uploadsDir, modelFileName);
        fs.renameSync(modelFile.path, modelPath);
        console.log(`Model saved: ${modelPath}`);

        let audioFileName = null;
        if (audioFile) {
            const audioExt = path.extname(audioFile.originalname).toLowerCase();
            if (audioExt !== '.mp3') throw new Error('Only .mp3 files are allowed');
            audioFileName = `${modelId}.mp3`;
            const audioPath = path.join(uploadsDir, audioFileName);
            fs.renameSync(audioFile.path, audioPath);
            console.log(`Audio saved: ${audioPath}`);
        }

        const newModel = {
            id: modelId,
            filename: modelFileName,
            audioFilename: audioFileName,
            originalName: modelFile.originalname,
            description: description || '',
            createdAt: new Date().toISOString()
        };
        const models = loadModels();
        models.push(newModel);
        saveModels(models);

        res.status(201).json(newModel);
    } catch (err) {
        if (req.files) {
            Object.values(req.files).flat().forEach(f => {
                if (f.path && fs.existsSync(f.path)) fs.unlinkSync(f.path);
            });
        }
        console.error('Upload error:', err);
        res.status(500).json({ error: err.message });
    }
});

// Получение метаданных модели
app.get('/api/models/:id', (req, res) => {
    const models = loadModels();
    const model = models.find(m => m.id === req.params.id);
    if (!model) return res.status(404).json({ error: 'Model not found' });
    res.json(model);
});

// Отдача GLB файла
app.get('/api/models/:id/file', (req, res) => {
    const models = loadModels();
    const model = models.find(m => m.id === req.params.id);
    if (!model) return res.status(404).json({ error: 'Model not found' });
    const filePath = path.join(uploadsDir, model.filename);
    if (!fs.existsSync(filePath)) {
        console.error(`File not found: ${filePath}`);
        return res.status(404).json({ error: 'File not found' });
    }
    res.sendFile(filePath);
});

// Отдача аудио
app.get('/api/models/:id/audio', (req, res) => {
    const models = loadModels();
    const model = models.find(m => m.id === req.params.id);
    if (!model || !model.audioFilename) return res.status(404).json({ error: 'Audio not found' });
    const filePath = path.join(uploadsDir, model.audioFilename);
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Audio file missing' });
    res.sendFile(filePath);
});

// Генерация QR
app.get('/api/qr/:id', async (req, res) => {
    const models = loadModels();
    const model = models.find(m => m.id === req.params.id);
    if (!model) return res.status(404).json({ error: 'Model not found' });
    const baseUrl = `${req.protocol}://${req.get('host')}`;
    const scannerUrl = `${baseUrl}/scanner.html?id=${model.id}`;
    try {
        const qrImage = await qrcode.toBuffer(scannerUrl, { type: 'png', width: 300 });
        res.setHeader('Content-Type', 'image/png');
        res.send(qrImage);
    } catch (err) {
        console.error('QR generation error:', err);
        res.status(500).json({ error: 'QR generation failed' });
    }
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running at http://<your-ip>:${PORT}`);
});
