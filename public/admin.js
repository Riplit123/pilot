async function loadModels() {
    const container = document.getElementById('models-list');
    if (!container) {
        console.error('Container #models-list not found');
        return;
    }
    container.innerHTML = 'Загрузка...';
    try {
        const res = await fetch('/api/models');
        console.log('Response status:', res.status);
        if (!res.ok) {
            const text = await res.text();
            console.error('Error response:', text);
            throw new Error(`HTTP ${res.status}: ${text.substring(0, 100)}`);
        }
        const models = await res.json();
        console.log('Loaded models:', models);
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
                <div class="qr-code" id="qr-${model.id}">
                    <img src="/api/qr/${model.id}" alt="QR код" 
                         onerror="this.src='data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22150%22%20height%3D%22150%22%20viewBox%3D%220%200%20150%20150%22%3E%3Crect%20width%3D%22150%22%20height%3D%22150%22%20fill%3D%22%23eee%22%2F%3E%3Ctext%20x%3D%2250%25%22%20y%3D%2250%25%22%20dominant-baseline%3D%22middle%22%20text-anchor%3D%22middle%22%20fill%3D%22%23999%22%3EQR%20error%3C%2Ftext%3E%3C%2Fsvg%3E'">
                </div>
                <div class="model-actions">
                    <button class="btn-sm" onclick="regenerateQR('${model.id}')">Обновить QR</button>
                    <button class="btn-sm btn-delete" onclick="deleteModel('${model.id}')">Удалить</button>
                </div>
                <hr>
                <small>Создано: ${new Date(model.createdAt).toLocaleString()}</small>
            `;
            container.appendChild(div);
        }
    } catch (err) {
        console.error('Load error:', err);
        container.innerHTML = `<p>Ошибка загрузки списка: ${err.message}</p>`;
    }
}

function regenerateQR(modelId) {
    const img = document.querySelector(`#qr-${modelId} img`);
    if (img) {
        img.src = `/api/qr/${modelId}?t=${Date.now()}`;
        img.onerror = function() {
            this.src = 'data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22150%22%20height%3D%22150%22%20viewBox%3D%220%200%20150%20150%22%3E%3Crect%20width%3D%22150%22%20height%3D%22150%22%20fill%3D%22%23eee%22%2F%3E%3Ctext%20x%3D%2250%25%22%20y%3D%2250%25%22%20dominant-baseline%3D%22middle%22%20text-anchor%3D%22middle%22%20fill%3D%22%23999%22%3EQR%20error%3C%2Ftext%3E%3C%2Fsvg%3E';
        };
    }
}

async function deleteModel(modelId) {
    if (!confirm('Вы уверены, что хотите удалить эту модель? Это действие необратимо.')) return;
    try {
        const res = await fetch(`/api/models/${modelId}`, { method: 'DELETE' });
        if (!res.ok) {
            const err = await res.json();
            throw new Error(err.error || 'Ошибка удаления');
        }
        alert('Модель удалена');
        loadModels(); // обновляем список
    } catch (err) {
        console.error('Delete error:', err);
        alert(`Ошибка: ${err.message}`);
    }
}

const form = document.getElementById('upload-form');
const statusDiv = document.getElementById('upload-status');

if (form) {
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const formData = new FormData(form);
        statusDiv.textContent = 'Загрузка...';
        statusDiv.style.color = '#4c9aff';
        try {
            const res = await fetch('/api/models', { method: 'POST', body: formData });
            if (!res.ok) {
                let errorMsg = `Ошибка ${res.status}`;
                try {
                    const errData = await res.json();
                    errorMsg = errData.error || errorMsg;
                } catch (e) {
                    errorMsg = await res.text();
                }
                throw new Error(errorMsg);
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
} else {
    console.warn('Form #upload-form not found');
}

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
