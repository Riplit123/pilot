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

// Папки для загрузок
const uploadsDir = path.join(__dirname, 'uploads');
const audioDir = path.join(__dirname, 'audio');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
if (!fs.existsSync(audioDir)) fs.mkdirSync(audioDir, { recursive: true });

// Multer storage для 3D моделей (.glb)
const modelStorage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadsDir),
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase();
        if (ext !== '.glb') return cb(new Error('Only .glb files allowed'));
        cb(null, `${uuidv4()}${ext}`);
    }
});
const uploadModel = multer({ storage: modelStorage, limits: { fileSize: 200 * 1024 * 1024 } });

// Multer storage для аудио (.mp3)
const audioStorage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, audioDir),
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase();
        if (ext !== '.mp3') return cb(new Error('Only .mp3 files allowed'));
        cb(null, `${uuidv4()}${ext}`);
    }
});
const uploadAudio = multer({ storage: audioStorage, limits: { fileSize: 20 * 1024 * 1024 } });

// Загрузка метаданных
const modelsFilePath = path.join(__dirname, 'models.json');
function loadModels() {
    if (!fs.existsSync(modelsFilePath)) return [];
    try {
        const data = fs.readFileSync(modelsFilePath, 'utf8');
        return JSON.parse(data).models || [];
    } catch (e) { return []; }
}
function saveModels(models) {
    fs.writeFileSync(modelsFilePath, JSON.stringify({ models }, null, 2));
}

// Список моделей
app.get('/api/models', (req, res) => {
    res.json(loadModels());
});

// Загрузка модели + опциональное аудио
app.post('/api/models', (req, res) => {
    uploadModel.single('model')(req, res, (err) => {
        if (err) {
            if (err.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: 'Модель слишком большая (макс. 200 МБ)' });
            return res.status(500).json({ error: err.message });
        }
        // После модели загружаем аудио (если есть)
        uploadAudio.single('audio')(req, res, async (err2) => {
            if (err2) {
                // Если ошибка с аудио, но модель уже загружена — всё равно сохраняем модель
                console.error('Audio upload error:', err2);
            }
            try {
                const { description } = req.body;
                if (!req.file) throw new Error('Модель не загружена');

                const originalFilename = req.file.originalname;
                const tempPath = req.file.path;
                const ext = path.extname(originalFilename).toLowerCase();
                if (ext !== '.glb') {
                    fs.unlinkSync(tempPath);
                    throw new Error('Только .glb файлы');
                }

                const modelId = uuidv4();
                const newFileName = `${modelId}.glb`;
                const newPath = path.join(uploadsDir, newFileName);
                fs.renameSync(tempPath, newPath);

                let audioFilename = null;
                if (req.files?.audio) {
                    // multer array? нет, мы использовали uploadAudio.single, файл будет в req.file? 
                    // но мы уже использовали uploadModel.single, поэтому req.file теперь модель.
                    // Нужно обработать иначе. Переделаем: используем multer поля.
                }
                // Лучше использовать multer fields
                // Для простоты оставим отдельную обработку аудио, но текущая структура не позволяет.
                // Перепишем: используем multer().fields([{ name: 'model', maxCount:1 }, { name: 'audio', maxCount:1 }])
            } catch (err) {
                // очистка
                if (req.file && req.file.path && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
                res.status(500).json({ error: err.message });
            }
        });
    });
});

// Правильный вариант с двумя полями:
app.post('/api/models', (req, res) => {
    const upload = multer().fields([
        { name: 'model', maxCount: 1 },
        { name: 'audio', maxCount: 1 }
    ]);
    upload(req, res, async (err) => {
        if (err) return res.status(500).json({ error: err.message });

        const modelFile = req.files?.model?.[0];
        const audioFile = req.files?.audio?.[0];
        if (!modelFile) return res.status(400).json({ error: 'Модель не загружена' });

        const ext = path.extname(modelFile.originalname).toLowerCase();
        if (ext !== '.glb') {
            return res.status(400).json({ error: 'Только .glb файлы' });
        }

        const modelId = uuidv4();
        const modelFileName = `${modelId}.glb`;
        const modelPath = path.join(uploadsDir, modelFileName);
        fs.renameSync(modelFile.path, modelPath);

        let audioFileName = null;
        if (audioFile) {
            const audioExt = path.extname(audioFile.originalname).toLowerCase();
            if (audioExt !== '.mp3') {
                // удаляем временный файл
                fs.unlinkSync(audioFile.path);
                // но модель уже сохранена — продолжаем без аудио
            } else {
                audioFileName = `${uuidv4()}.mp3`;
                const audioPath = path.join(audioDir, audioFileName);
                fs.renameSync(audioFile.path, audioPath);
            }
        }

        const newModel = {
            id: modelId,
            filename: modelFileName,
            audioFilename: audioFileName,
            originalName: modelFile.originalname,
            description: req.body.description || '',
            createdAt: new Date().toISOString()
        };
        const models = loadModels();
        models.push(newModel);
        saveModels(models);

        res.status(201).json(newModel);
    });
});

// Получение метаданных
app.get('/api/models/:id', (req, res) => {
    const models = loadModels();
    const model = models.find(m => m.id === req.params.id);
    if (!model) return res.status(404).json({ error: 'Модель не найдена' });
    res.json(model);
});

// Отдача файла модели
app.get('/api/models/:id/file', (req, res) => {
    const models = loadModels();
    const model = models.find(m => m.id === req.params.id);
    if (!model) return res.status(404).json({ error: 'Модель не найдена' });
    const filePath = path.join(uploadsDir, model.filename);
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Файл модели отсутствует' });
    res.sendFile(filePath);
});

// Отдача аудиофайла
app.get('/api/models/:id/audio', (req, res) => {
    const models = loadModels();
    const model = models.find(m => m.id === req.params.id);
    if (!model || !model.audioFilename) return res.status(404).json({ error: 'Аудио не найдено' });
    const audioPath = path.join(audioDir, model.audioFilename);
    if (!fs.existsSync(audioPath)) return res.status(404).json({ error: 'Аудиофайл отсутствует' });
    res.sendFile(audioPath);
});

// Генерация QR‑кода с URL сканера + параметр model
app.get('/api/qr/:id', async (req, res) => {
    const models = loadModels();
    const model = models.find(m => m.id === req.params.id);
    if (!model) return res.status(404).json({ error: 'Модель не найдена' });
    // Базовый URL приложения (можно настроить через переменные окружения)
    const baseUrl = process.env.BASE_URL || 'https://pilot-e6fs.onrender.com';
    const qrData = `${baseUrl}/scanner.html?model=${model.id}`;
    try {
        const qrImage = await qrcode.toBuffer(qrData, { type: 'png', width: 300 });
        res.setHeader('Content-Type', 'image/png');
        res.send(qrImage);
    } catch (err) {
        res.status(500).json({ error: 'Ошибка генерации QR' });
    }
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
});
