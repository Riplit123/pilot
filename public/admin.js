// Load models on page load
async function loadModels() {
    const container = document.getElementById('models-list');
    container.innerHTML = 'Загрузка...';
    try {
        const res = await fetch('/api/models');
        const models = await res.json();
        if (!models.length) {
            container.innerHTML = '<p>Нет загруженных моделей.</p>';
            return;
        }
        container.innerHTML = '';
        for (const model of models) {
            const div = document.createElement('div');
            div.className = 'model-item';
            div.innerHTML = `
                <h3>${escapeHtml(model.originalName)}</h3>
                <p><strong>Описание:</strong> ${escapeHtml(model.description) || '—'}</p>
                <p><strong>ID:</strong> ${model.id}</p>
                <div class="qr-code" id="qr-${model.id}">
                    <img src="/api/qr/${model.id}" alt="QR код" style="max-width:150px;">
                </div>
                <button class="btn-sm" onclick="regenerateQR('${model.id}')">🔄 Обновить QR</button>
                <hr>
                <small>Создано: ${new Date(model.createdAt).toLocaleString()}</small>
            `;
            container.appendChild(div);
        }
    } catch (err) {
        console.error(err);
        container.innerHTML = '<p>Ошибка загрузки списка моделей.</p>';
    }
}

// Regenerate QR (just refresh image)
function regenerateQR(modelId) {
    const img = document.querySelector(`#qr-${modelId} img`);
    if (img) {
        img.src = `/api/qr/${modelId}?t=${Date.now()}`;
    }
}

// Handle upload form
const form = document.getElementById('upload-form');
const uploadStatus = document.getElementById('upload-status');

form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const formData = new FormData(form);
    uploadStatus.textContent = 'Загрузка...';
    uploadStatus.style.color = 'blue';
    try {
        const res = await fetch('/api/models', {
            method: 'POST',
            body: formData
        });
        if (!res.ok) throw new Error(await res.text());
        const newModel = await res.json();
        uploadStatus.textContent = `✅ Модель "${newModel.originalName}" загружена! QR сгенерирован.`;
        uploadStatus.style.color = 'green';
        form.reset();
        loadModels(); // refresh list
    } catch (err) {
        console.error(err);
        uploadStatus.textContent = `❌ Ошибка: ${err.message}`;
        uploadStatus.style.color = 'red';
    }
});

// Helper to escape HTML
function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>]/g, function(m) {
        if (m === '&') return '&amp;';
        if (m === '<') return '&lt;';
        if (m === '>') return '&gt;';
        return m;
    });
}

loadModels();