// Importiere die "Engine"
import { createVCFString, buildSafeFileName } from './vcard-core.js';

// Maximale Fotogröße (224 KB, wie im HTML-Hinweis)
const MAX_PHOTO_SIZE_BYTES = 224 * 1024;

// Ein einfacher State, um die gelesenen Fotodaten zu halten
let appState = {
    photoData: null
};

document.addEventListener('DOMContentLoaded', () => {
    // --- DOM-Elemente holen ---
    const vcardForm = document.getElementById('vcard-form');
    const feedbackElement = document.getElementById('form-feedback');
    const photoInput = document.getElementById('photo');
    const resetButton = document.getElementById('reset-button');
    const previewElement = document.getElementById('vcard-preview');
    
    // QR-Code Elemente (optional)
    const qrContainer = document.getElementById('qr-code-container'); 
    const qrDownloadButton = document.getElementById('qr-download-button');
    const hasQRCodeUI = qrContainer && qrDownloadButton;

    if (!vcardForm || !feedbackElement || !photoInput || !resetButton || !previewElement) {
        console.error('Kritische UI-Elemente fehlen. App kann nicht initialisiert werden.');
        return;
    }
    
    if (hasQRCodeUI) {
         clearQRCode(qrContainer, qrDownloadButton);
    }

    // --- Echtzeit-Vorschau Funktion ---
    const updatePreview = () => {
        // 1. Daten sammeln
        const formData = collectFormData(vcardForm);
        // 2. vCard-Daten mit dem Foto aus dem State kombinieren
        const vCardData = { ...formData, photo: appState.photoData };
        // 3. vCard-String erstellen
        const vcfContent = createVCFString(vCardData);
        // 4. Vorschau-Textfeld aktualisieren
        previewElement.value = vcfContent;
        
        return vcfContent; // Geben den Inhalt für den Submit-Handler zurück
    };

    // --- Event Listener ---

    // 1. SUBMIT: vCard generieren und Download
    vcardForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        hideFeedback(feedbackElement);

        const formData = collectFormData(vcardForm);
        const validationErrors = validateFormData(formData);

        if (validationErrors.length > 0) {
            showFeedback(feedbackElement, validationErrors.join('\n'), 'error');
            previewElement.value = 'Bitte Fehler im Formular beheben.'; // Vorschau bei Validierungsfehler
            if (hasQRCodeUI) clearQRCode(qrContainer, qrDownloadButton);
            return;
        }

        try {
            // Foto nur beim Absenden neu einlesen, falls es noch nicht im State ist
            // (z.B. wenn JS langsam geladen hat)
            if (formData.photoFile && !appState.photoData) {
                 appState.photoData = await readPhoto(formData.photoFile);
            }
            
            // Finale vCard-Daten (inkl. Foto) holen und Vorschau aktualisieren
            const vcfContent = updatePreview();
            
            const fileName = buildSafeFileName(formData) + '.vcf';
            downloadVCF(vcfContent, fileName);

            showFeedback(feedbackElement, 'vCard erfolgreich generiert. Der Download wurde gestartet.', 'success');

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
            previewElement.value = 'Fehler bei der vCard-Erstellung.'; // Vorschau bei Fehler
            if (hasQRCodeUI) clearQRCode(qrContainer, qrDownloadButton);
        }
    });

    // 2. RESET: Formular leeren
    resetButton.addEventListener('click', () => {
        vcardForm.reset();
        appState.photoData = null; // Wichtig: Foto-State auch leeren
        hideFeedback(feedbackElement);
        
        if (hasQRCodeUI) {
            clearQRCode(qrContainer, qrDownloadButton);
        }
        
        updatePreview(); // Leere Vorschau generieren
    });

    // 3. ECHTZEIT: Auf Text-Eingaben lauschen
    vcardForm.addEventListener('input', (event) => {
        // Ignoriere Foto-Input, das wird separat behandelt
        if (event.target.id === 'photo') return;
        updatePreview();
    });

    // 4. FOTO-ÄNDERUNG: Foto asynchron lesen und im State speichern
    photoInput.addEventListener('change', async (event) => {
        const file = event.target.files ? event.target.files[0] : null;
        
        // Foto-Validierung
        const sizeError = validatePhotoSize(file);
        if (sizeError) {
            showFeedback(feedbackElement, sizeError, 'error');
            appState.photoData = null;
            event.target.value = null; // Fehleingabe aus Feld entfernen
            updatePreview();
            return;
        }

        if (!file) {
            appState.photoData = null; // Foto entfernt
            updatePreview();
            return;
        }

        // Foto einlesen
        try {
            hideFeedback(feedbackElement);
            appState.photoData = await readPhoto(file);
        } catch (error) {
            showFeedback(feedbackElement, 'Foto konnte nicht gelesen werden.', 'error');
            appState.photoData = null;
        }
        
        // Nach Foto-Änderung immer die Vorschau aktualisieren
        updatePreview();
    });

    // Initial eine leere Vorschau generieren
    updatePreview();
});


/**
 * Sammelt alle Daten aus den Formularfeldern.
 * @param {HTMLFormElement} form - Das Formular-Element.
 * @returns {object} Ein Objekt mit allen Formulardaten.
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

    // Fotodatei separat holen (nur die Datei, nicht der Inhalt)
    const photoInput = form.elements.photo;
    data.photoFile = photoInput && photoInput.files.length ? photoInput.files[0] : null;

    return data;
}

/**
 * Validiert die Fotodatei-Größe.
 * @param {File} file - Die Fotodatei.
 * @returns {string} Fehlermeldung oder leerer String.
 */
function validatePhotoSize(file) {
    if (!file) return ''; // Kein File, kein Fehler
    
    if (file.size > MAX_PHOTO_SIZE_BYTES) {
        const sizeInKb = Math.round(file.size / 1024);
        const maxInKb = Math.round(MAX_PHOTO_SIZE_BYTES / 1024);
        return `Das Foto ist zu groß (${sizeInKb} KB). Bitte verwende eine Datei mit höchstens ${maxInKb} KB.`;
    }
    return ''; // Alles gut
}

/**
 * Validiert die Formulardaten (simpel).
 * (Prüft nicht mehr die Fotogröße, da dies 'onChange' passiert)
 * @param {object} data - Das Datenobjekt von collectFormData.
 * @returns {string[]} Ein Array mit Fehlermeldungen.
 */
function validateFormData(data) {
    const errors = [];

    if (!data.firstName) {
        errors.push('Bitte gib einen Vornamen ein.');
    }
    if (!data.lastName) {
        errors.push('Bitte gib einen Nachnamen ein.');
    }

    // Die Fotogrößen-Validierung passiert jetzt in 'validatePhotoSize'
    // und im 'change'-Event des Foto-Inputs, nicht mehr beim Submit.

    return errors;
}

/**
 * Zeigt eine Feedback-Nachricht (Erfolg oder Fehler) an.
 * @param {HTMLElement} element - Das Feedback-Element.
 * @param {string} message - Die anzuzeigende Nachricht.
 * @param {'success' | 'error'} type - Der Typ der Nachricht.
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
 * @param {HTMLElement} element - Das Feedback-Element.
 */
function hideFeedback(element) {
    element.textContent = '';
    element.classList.remove('is-visible', 'form-feedback--error', 'form-feedback--success');
}

/**
 * Löst den Download der vCard-Datei aus.
 * @param {string} content - Der vCard-String-Inhalt.
 * @param {string} fileName - Der gewünschte Dateiname.
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
 * @param {File} file - Die Bilddatei.
 * @returns {Promise<{base64: string, type: string}>}
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
// (Diese werden nur ausgeführt, wenn 'qrContainer' und 'qrDownloadButton' im HTML existieren)

/**
 * Aktualisiert den QR-Code mit dem vCard-Inhalt.
 * @param {HTMLElement} container - Der QR-Code-Container.
 * @param {HTMLButtonElement} downloadButton - Der Download-Button für den QR-Code.
 * @param {string} value - Der vCard-String.
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
        downloadButton.disabled = false;
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
