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

const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
console.log('Uploads directory:', uploadsDir);

// Хранилище для multer
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadsDir),
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase();
        cb(null, `${uuidv4()}${ext}`);
    }
});
const upload = multer({
    storage,
    limits: { fileSize: 200 * 1024 * 1024 }
});

// Файл models.json
const modelsFilePath = path.join(__dirname, 'models.json');
console.log('Models file path:', modelsFilePath);

function loadModels() {
    if (!fs.existsSync(modelsFilePath)) {
        console.log('models.json not found, creating empty array');
        saveModels([]);
        return [];
    }
    try {
        const data = fs.readFileSync(modelsFilePath, 'utf8');
        const parsed = JSON.parse(data);
        return parsed.models || [];
    } catch (e) {
        console.error('Error reading models.json:', e);
        return [];
    }
}

function saveModels(models) {
    try {
        fs.writeFileSync(modelsFilePath, JSON.stringify({ models }, null, 2));
        console.log('Models saved successfully');
    } catch (e) {
        console.error('Error saving models.json:', e);
    }
}

// GET /api/models
app.get('/api/models', (req, res) => {
    try {
        const models = loadModels();
        res.json(models);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to load models' });
    }
});

// POST /api/models – загрузка модели и аудио
app.post('/api/models', upload.fields([{ name: 'model', maxCount: 1 }, { name: 'audio', maxCount: 1 }]), async (req, res) => {
    try {
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
            if (audioExt !== '.mp3') throw new Error('Only .mp3 files are allowed for audio');
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
        // Cleanup any uploaded files
        if (req.files) {
            Object.values(req.files).flat().forEach(f => {
                if (f.path && fs.existsSync(f.path)) fs.unlinkSync(f.path);
            });
        }
        console.error('Upload error:', err);
        res.status(500).json({ error: err.message });
    }
});

// GET /api/models/:id
app.get('/api/models/:id', (req, res) => {
    const models = loadModels();
    const model = models.find(m => m.id === req.params.id);
    if (!model) return res.status(404).json({ error: 'Model not found' });
    res.json(model);
});

// GET /api/models/:id/file – GLB
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

// GET /api/models/:id/audio – MP3
app.get('/api/models/:id/audio', (req, res) => {
    const models = loadModels();
    const model = models.find(m => m.id === req.params.id);
    if (!model || !model.audioFilename) return res.status(404).json({ error: 'Audio not found' });
    const filePath = path.join(uploadsDir, model.audioFilename);
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Audio file missing' });
    res.sendFile(filePath);
});

// GET /api/qr/:id – QR code with full URL
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
    console.log(`Admin panel: http://<your-ip>:${PORT}/admin.html`);
    console.log(`Scanner page: http://<your-ip>:${PORT}/scanner.html`);
});
