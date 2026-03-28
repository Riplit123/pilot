// ─── Helpers ───────────────────────────────────────────
function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>"']/g, function(m) {
        switch (m) {
            case '&': return '&amp;';
            case '<': return '&lt;';
            case '>': return '&gt;';
            case '"': return '&quot;';
            case "'": return '&#39;';
        }
        return m;
    });
}

// ─── Load & render models ──────────────────────────────
async function loadModels() {
    const container = document.getElementById('models-list');
    if (!container) {
        console.error('Container #models-list not found');
        return;
    }

    container.innerHTML = '<p style="color:#888;">Загрузка...</p>';

    let models;
    try {
        const res = await fetch('/api/models', { cache: 'no-store' });
        console.log('GET /api/models — status:', res.status);
        if (!res.ok) {
            const text = await res.text();
            throw new Error(`HTTP ${res.status}: ${text.substring(0, 200)}`);
        }
        models = await res.json();
        console.log('Loaded models:', models);
    } catch (err) {
        console.error('Load error:', err);
        container.innerHTML = `<p style="color:#dc2626;">Ошибка загрузки списка: ${escapeHtml(err.message)}</p>`;
        return;
    }

    if (!Array.isArray(models) || models.length === 0) {
        container.innerHTML = '<p style="color:#888;">Нет загруженных моделей.</p>';
        return;
    }

    // Clear and rebuild the list completely each time
    container.innerHTML = '';

    models.forEach(model => {
        const div = document.createElement('div');
        div.className = 'model-item';
        div.dataset.id = model.id;

        const createdAt = model.createdAt
            ? new Date(model.createdAt).toLocaleString('ru-RU')
            : '—';

        const audioLabel = model.audioFilename
            ? '<span style="color:#16a34a;font-size:12px;">🎵 Аудио прикреплено</span>'
            : '<span style="color:#888;font-size:12px;">🔤 Голосовое чтение текста</span>';

        // Cache-bust QR image so the browser always fetches it fresh
        const qrSrc = `/api/qr/${model.id}?t=${Date.now()}`;

        div.innerHTML = `
            <strong style="font-size:15px;">${escapeHtml(model.originalName)}</strong>
            <p style="margin:8px 0;color:#555;font-size:13px;line-height:1.5;">
                ${escapeHtml(model.description) || '<em style="color:#aaa;">Нет описания</em>'}
            </p>
            <div style="margin:6px 0;">${audioLabel}</div>
            <div class="qr-code" id="qr-${model.id}">
                <img
                    src="${qrSrc}"
                    alt="QR код для ${escapeHtml(model.originalName)}"
                    onerror="this.onerror=null;this.src='data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22150%22%20height%3D%22150%22%20viewBox%3D%220%200%20150%20150%22%3E%3Crect%20width%3D%22150%22%20height%3D%22150%22%20fill%3D%22%23eee%22%2F%3E%3Ctext%20x%3D%2250%25%22%20y%3D%2250%25%22%20dominant-baseline%3D%22middle%22%20text-anchor%3D%22middle%22%20fill%3D%22%23999%22%3EQR%20error%3C%2Ftext%3E%3C%2Fsvg%3E';"
                >
            </div>
            <div class="model-actions">
                <button class="btn-sm" onclick="regenerateQR('${model.id}')">Обновить QR</button>
                <button class="btn-sm" onclick="copyModelLink('${model.id}')">Копировать ссылку</button>
                <button class="btn-sm btn-delete" onclick="deleteModel('${model.id}')">Удалить</button>
            </div>
            <hr>
            <small>ID: ${escapeHtml(model.id)}</small><br>
            <small>Создано: ${createdAt}</small>
        `;

        container.appendChild(div);
    });
}

// ─── Regenerate QR ─────────────────────────────────────
function regenerateQR(modelId) {
    const img = document.querySelector(`#qr-${modelId} img`);
    if (img) {
        img.src = `/api/qr/${modelId}?t=${Date.now()}`;
        img.onerror = function() {
            this.onerror = null;
            this.src = 'data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22150%22%20height%3D%22150%22%20viewBox%3D%220%200%20150%20150%22%3E%3Crect%20width%3D%22150%22%20height%3D%22150%22%20fill%3D%22%23eee%22%2F%3E%3Ctext%20x%3D%2250%25%22%20y%3D%2250%25%22%20dominant-baseline%3D%22middle%22%20text-anchor%3D%22middle%22%20fill%3D%22%23999%22%3EQR%20error%3C%2Ftext%3E%3C%2Fsvg%3E';
        };
    }
}

// ─── Copy scanner link ─────────────────────────────────
function copyModelLink(modelId) {
    const url = `${location.origin}/scanner.html?id=${modelId}`;
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(url)
            .then(() => alert('Ссылка скопирована:\n' + url))
            .catch(() => prompt('Скопируйте ссылку:', url));
    } else {
        prompt('Скопируйте ссылку:', url);
    }
}

// ─── Delete model ──────────────────────────────────────
async function deleteModel(modelId) {
    if (!confirm('Вы уверены, что хотите удалить эту модель? Это действие необратимо.')) return;
    try {
        const res = await fetch(`/api/models/${modelId}`, { method: 'DELETE' });
        if (!res.ok) {
            let errMsg = `HTTP ${res.status}`;
            try {
                const errData = await res.json();
                errMsg = errData.error || errMsg;
            } catch (_) {}
            throw new Error(errMsg);
        }
        // Animate removal
        const item = document.querySelector(`.model-item[data-id="${modelId}"]`);
        if (item) {
            item.style.transition = 'opacity 0.3s, transform 0.3s';
            item.style.opacity = '0';
            item.style.transform = 'scale(0.95)';
            setTimeout(() => item.remove(), 300);
        }
        // Check if list is now empty
        setTimeout(() => {
            const remaining = document.querySelectorAll('.model-item');
            if (remaining.length === 0) {
                const container = document.getElementById('models-list');
                if (container) container.innerHTML = '<p style="color:#888;">Нет загруженных моделей.</p>';
            }
        }, 350);
    } catch (err) {
        console.error('Delete error:', err);
        alert(`Ошибка удаления: ${err.message}`);
    }
}

// ─── Upload form ───────────────────────────────────────
const form      = document.getElementById('upload-form');
const statusDiv = document.getElementById('upload-status');

if (form) {
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const submitBtn = form.querySelector('button[type="submit"]');

        const formData = new FormData(form);

        // Validate that a .glb file is chosen
        const modelFile = formData.get('model');
        if (!modelFile || !modelFile.name) {
            statusDiv.textContent = '❌ Выберите .glb файл модели.';
            statusDiv.style.color = 'red';
            return;
        }

        statusDiv.textContent = '⏳ Загрузка...';
        statusDiv.style.color = '#4c9aff';
        if (submitBtn) submitBtn.disabled = true;

        try {
            const res = await fetch('/api/models', { method: 'POST', body: formData });
            if (!res.ok) {
                let errorMsg = `Ошибка ${res.status}`;
                try {
                    const errData = await res.json();
                    errorMsg = errData.error || errorMsg;
                } catch (_) {
                    errorMsg = await res.text();
                }
                throw new Error(errorMsg);
            }
            const newModel = await res.json();
            statusDiv.textContent = `✅ Модель "${newModel.originalName}" загружена!`;
            statusDiv.style.color = 'green';
            form.reset();
            // Reload the full list so the new model appears with its QR code
            await loadModels();
        } catch (err) {
            console.error('Upload error:', err);
            statusDiv.textContent = `❌ Ошибка: ${err.message}`;
            statusDiv.style.color = 'red';
        } finally {
            if (submitBtn) submitBtn.disabled = false;
        }
    });
} else {
    console.warn('Form #upload-form not found');
}

// ─── Init ─────────────────────────────────────────────
loadModels();
