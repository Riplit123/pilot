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
                <strong>${escapeHtml(model.originalName)}</strong>
                <p style="margin: 8px 0; color:#555;">${escapeHtml(model.description) || '—'}</p>
                <div class="qr-code">
                    <img src="/api/qr/${model.id}" alt="QR код">
                </div>
                <button class="btn-sm" onclick="regenerateQR('${model.id}')">Обновить QR</button>
                <hr>
                <small>Создано: ${new Date(model.createdAt).toLocaleString()}</small>
            `;
            container.appendChild(div);
        }
    } catch (err) {
        container.innerHTML = '<p>Ошибка загрузки списка.</p>';
    }
}

function regenerateQR(modelId) {
    const img = document.querySelector(`#qr-${modelId} img`);
    if (img) img.src = `/api/qr/${modelId}?t=${Date.now()}`;
}

const form = document.getElementById('upload-form');
const statusDiv = document.getElementById('upload-status');

form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const formData = new FormData(form);
    statusDiv.textContent = 'Загрузка...';
    statusDiv.style.color = '#4c9aff';
    try {
        const res = await fetch('/api/models', { method: 'POST', body: formData });
        if (!res.ok) {
            const err = await res.json();
            throw new Error(err.error || 'Ошибка');
        }
        const newModel = await res.json();
        statusDiv.textContent = `✅ Модель "${newModel.originalName}" загружена!`;
        statusDiv.style.color = 'green';
        form.reset();
        loadModels();
    } catch (err) {
        statusDiv.textContent = `❌ Ошибка: ${err.message}`;
        statusDiv.style.color = 'red';
    }
});

loadModels();
