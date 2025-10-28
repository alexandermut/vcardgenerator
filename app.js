// Importiere die "Engine"
import { createVCFString, buildSafeFileName } from './vcard-core.js';

// Maximale Fotogröße (224 KB, wie im HTML-Hinweis)
const MAX_PHOTO_SIZE_BYTES = 224 * 1024;

document.addEventListener('DOMContentLoaded', () => {
    // --- DOM-Elemente holen ---
    const vcardForm = document.getElementById('vcard-form');
    const feedbackElement = document.getElementById('form-feedback');
    
    // HINWEIS: Diese IDs musst du noch in dein HTML einfügen!
    const qrContainer = document.getElementById('qr-code-container'); 
    const qrDownloadButton = document.getElementById('qr-download-button');

    if (!vcardForm || !feedbackElement) {
        console.error('Kritische UI-Elemente (Formular, Feedback) fehlen.');
        return;
    }
    
    // Zeige QR-Code nur an, wenn auch Container da sind
    const hasQRCodeUI = qrContainer && qrDownloadButton;
    if (hasQRCodeUI) {
         clearQRCode(qrContainer, qrDownloadButton);
    }

    // --- Event Listener ---
    vcardForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        hideFeedback(feedbackElement);

        // 1. Daten aus dem Formular sammeln
        const formData = collectFormData(vcardForm);

        // 2. Daten validieren
        const validationErrors = validateFormData(formData);
        if (validationErrors.length > 0) {
            showFeedback(feedbackElement, validationErrors.join('\n'), 'error');
            if (hasQRCodeUI) clearQRCode(qrContainer, qrDownloadButton);
            return;
        }

        // 3. vCard erstellen
        try {
            let photoData = null;
            if (formData.photoFile) {
                photoData = await readPhoto(formData.photoFile);
            }
            
            const vCardData = { ...formData, photo: photoData };
            const vcfContent = createVCFString(vCardData);
            const fileName = buildSafeFileName(vCardData) + '.vcf';

            // 4. Download starten
            downloadVCF(vcfContent, fileName);

            // 5. Erfolg melden
            showFeedback(feedbackElement, 'vCard erfolgreich generiert. Der Download wurde gestartet.', 'success');

            // 6. QR-Code aktualisieren
            if (hasQRCodeUI) {
                updateQRCode(qrContainer, qrDownloadButton, vcfContent);
            }

        } catch (error) {
            console.error('Fehler beim Erstellen der vCard:', error);
            let userMessage = 'Ein unbekannter Fehler ist aufgetreten.';
            if (error.message.includes('Bild')) {
                 userMessage = 'Das Foto konnte nicht verarbeitet werden. Bitte wähle eine kleinere Datei.';
            }
            showFeedback(feedbackElement, userMessage, 'error');
            if (hasQRCodeUI) clearQRCode(qrContainer, qrDownloadButton);
        }
    });
});


/**
 * Sammelt alle Daten aus den Formularfeldern.
 */
function collectFormData(form) {
    const fieldIds = [
        'prefix', 'firstName', 'middleName', 'lastName', 'suffix', 'nickname', 'birthday',
        'company', 'title', 'website', 'calendar',
        'emailHome', 'emailWork',
        'phoneMobile', 'phoneHome', 'phoneWork', 'faxHome', 'faxWork',
        'adrHomeStreet', 'adrHomeCity', 'adrHomeState', 'adrHomeZip', 'adrHomeCountry',
        'adrWorkStreet', 'adrWorkCity', 'adrWorkState', 'adrWorkZip', 'adrWorkCountry',
        'socialFacebook', 'socialTwitter', 'socialLinkedIn', 'socialInstagram', 'socialYoutube', 'socialTikTok',
        'notes'
    ];

    const data = {};
    fieldIds.forEach((id) => {
        const element = form.elements[id];
        if (element) {
            data[id] = element.value.trim();
        }
    });

    const photoInput = form.elements.photo;
    data.photoFile = photoInput && photoInput.files.length ? photoInput.files[0] : null;

    return data;
}

/**
 * Validiert die Formulardaten (simpel).
 */
function validateFormData(data) {
    const errors = [];

    if (!data.firstName) {
        errors.push('Bitte gib einen Vornamen ein.');
    }
    if (!data.lastName) {
        errors.push('Bitte gib einen Nachnamen ein.');
    }

    if (data.photoFile && data.photoFile.size > MAX_PHOTO_SIZE_BYTES) {
        const sizeInKb = Math.round(data.photoFile.size / 1024);
        const maxInKb = Math.round(MAX_PHOTO_SIZE_BYTES / 1024);
        errors.push(`Das Foto ist zu groß (${sizeInKb} KB). Bitte verwende eine Datei mit höchstens ${maxInKb} KB.`);
    }

    return errors;
}

/**
 * Zeigt eine Feedback-Nachricht (Erfolg oder Fehler) an.
 */
function showFeedback(element, message, type) {
    element.textContent = message;
    element.classList.remove('form-feedback--error', 'form-feedback--success', 'is-visible');
    element.classList.add('form-feedback'); 
    
    if (type === 'error') {
        element.classList.add('form-feedback--error');
    } else {
        element.classList.add('form-feedback--success');
    }
    element.classList.add('is-visible');
}

/**
 * Versteckt die Feedback-Nachricht.
 */
function hideFeedback(element) {
    element.textContent = '';
    element.classList.remove('is-visible', 'form-feedback--error', 'form-feedback--success');
}

/**
 * Löst den Download der vCard-Datei aus.
 */
function downloadVCF(content, fileName) {
    const blob = new Blob([content], { type: 'text/vcard;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}

/**
 * Liest eine Bilddatei als Base64-String ein.
 */
function readPhoto(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();

        reader.onload = (event) => {
            const dataUrl = event.target.result;
            const base64String = dataUrl.split(',')[1];
            
            const typeMatch = dataUrl.match(/^data:image\/([a-zA-Z+]+);base64,/);
            if (!typeMatch || !typeMatch[1]) {
                reject(new Error('Bild konnte nicht gelesen werden: Unbekannter Bildtyp.'));
                return;
            }
            const type = typeMatch[1].toUpperCase();

            resolve({ base64: base64String, type });
        };

        reader.onerror = (error) => {
            reject(new Error(`Bild konnte nicht gelesen werden: ${error.message}`));
        };

        reader.readAsDataURL(file);
    });
}


// --- QR-Code Funktionen (benötigt qrcode.js) ---

/**
 * Aktualisiert den QR-Code mit dem vCard-Inhalt.
 */
function updateQRCode(container, downloadButton, value) {
    if (typeof QRCode === 'undefined') {
        container.textContent = 'QR-Code Bibliothek (qrcode.js) konnte nicht geladen werden.';
        downloadButton.disabled = true;
        return;
    }

    if (!container._qrCodeInstance) {
        container.innerHTML = ''; 
        container._qrCodeInstance = new QRCode(container, {
            width: 220,
            height: 220,
            correctLevel: QRCode.CorrectLevel.M,
        });
    }

    container._qrCodeInstance.clear();
    container._qrCodeInstance.makeCode(value);

    setTimeout(() => {
        // const exportable = getQRCodeDataUrl(container); // Du hattest keinen Download-Button dafür
        downloadButton.disabled = false; // Einfach aktivieren
    }, 100); 
}

/**
 * Setzt den QR-Code-Bereich zurück.
 */
function clearQRCode(container, downloadButton) {
    if (container._qrCodeInstance) {
        container._qrCodeInstance.clear();
    }
    container.innerHTML = '<p>QR-Code erscheint hier nach Erstellung.</p>'; 
    downloadButton.disabled = true;
}
