const express = require('express');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const qrcode = require('qrcode');
const path = require('path');
const fs = require('fs');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

// Ensure uploads folder exists
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir);

// Multer storage – file saved as <modelId>.glb
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadsDir),
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase();
        if (ext !== '.glb') {
            return cb(new Error('Only .glb files are allowed'), null);
        }
        // The ID will be set after we generate it, but we need to rename after upload.
        // We'll handle renaming after we have the ID.
        cb(null, `${uuidv4()}${ext}`);
    }
});
const upload = multer({ storage, limits: { fileSize: 50 * 1024 * 1024 } }); // 50 MB limit

// Helper: load models.json
const modelsFilePath = path.join(__dirname, 'models.json');
function loadModels() {
    if (!fs.existsSync(modelsFilePath)) return [];
    const data = fs.readFileSync(modelsFilePath, 'utf8');
    return JSON.parse(data).models || [];
}
function saveModels(models) {
    fs.writeFileSync(modelsFilePath, JSON.stringify({ models }, null, 2));
}

// Routes

// List all models
app.get('/api/models', (req, res) => {
    const models = loadModels();
    res.json(models);
});

// Upload a new model
app.post('/api/models', upload.single('model'), async (req, res) => {
    try {
        const { description } = req.body;
        if (!req.file) throw new Error('No file uploaded');
        const originalFilename = req.file.originalname;
        const tempPath = req.file.path;
        const ext = path.extname(originalFilename).toLowerCase();
        if (ext !== '.glb') {
            fs.unlinkSync(tempPath);
            throw new Error('Only .glb files are allowed');
        }

        // Generate a new ID and rename the file
        const modelId = uuidv4();
        const newFileName = `${modelId}.glb`;
        const newPath = path.join(uploadsDir, newFileName);
        fs.renameSync(tempPath, newPath);

        const newModel = {
            id: modelId,
            filename: newFileName,
            originalName: originalFilename,
            description: description || '',
            createdAt: new Date().toISOString()
        };
        const models = loadModels();
        models.push(newModel);
        saveModels(models);

        res.status(201).json(newModel);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

// Get model metadata by ID
app.get('/api/models/:id', (req, res) => {
    const models = loadModels();
    const model = models.find(m => m.id === req.params.id);
    if (!model) return res.status(404).json({ error: 'Model not found' });
    res.json(model);
});

// Serve the actual .glb file
app.get('/api/models/:id/file', (req, res) => {
    const models = loadModels();
    const model = models.find(m => m.id === req.params.id);
    if (!model) return res.status(404).json({ error: 'Model not found' });
    const filePath = path.join(uploadsDir, model.filename);
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File not found' });
    res.sendFile(filePath);
});

// Generate QR code for a model (returns PNG image)
app.get('/api/qr/:id', async (req, res) => {
    const models = loadModels();
    const model = models.find(m => m.id === req.params.id);
    if (!model) return res.status(404).json({ error: 'Model not found' });
    // QR code content = model ID (could also be full URL, but ID is simpler)
    const qrData = model.id;
    try {
        const qrImage = await qrcode.toBuffer(qrData, { type: 'png', width: 300 });
        res.setHeader('Content-Type', 'image/png');
        res.send(qrImage);
    } catch (err) {
        res.status(500).json({ error: 'QR generation failed' });
    }
});

// Start server – listen on all interfaces
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running at http://<your-ip>:${PORT}`);
    console.log(`Admin panel: http://<your-ip>:${PORT}/admin.html`);
    console.log(`Scanner page: http://<your-ip>:${PORT}/scanner.html`);
});