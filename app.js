const MAX_PHOTO_SIZE_BYTES = 224 * 1024;
let latestFormData = {};
let latestQrDataUrl = '';
let qrCodeInstance = null;

document.addEventListener('DOMContentLoaded', () => {
    const vcardForm = document.getElementById('vcard-form');
    const feedbackElement = document.getElementById('form-feedback');
    const qrDownloadButton = document.getElementById('qr-download');

    const updatePreview = () => handlePreviewUpdate(vcardForm);
    const debouncedPreviewUpdate = debounce(updatePreview, 150);

    vcardForm.addEventListener('input', () => {
        clearFieldErrors(vcardForm);
        debouncedPreviewUpdate();
    });

    vcardForm.addEventListener('change', () => {
        clearFieldErrors(vcardForm);
        debouncedPreviewUpdate();
    });

    if (qrDownloadButton) {
        qrDownloadButton.addEventListener('click', () => {
            if (!latestQrDataUrl) {
                return;
            }

            const link = document.createElement('a');
            const baseFileName = buildFileName(latestFormData).replace(/\.vcf$/i, '') || 'kontakt';
            link.href = latestQrDataUrl;
            link.download = `${baseFileName}-qr.png`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        });
    }

    updatePreview();

    vcardForm.addEventListener('submit', async (event) => {
        event.preventDefault();

        hideFeedback(feedbackElement);
        clearFieldErrors(vcardForm);

        const formData = collectFormData(vcardForm);
        latestFormData = formData;
        const validationErrors = validateFormData(formData, vcardForm);

        if (validationErrors.length > 0) {
            showFeedback(feedbackElement, validationErrors.join('\n'), 'error');
            return;
        }

        try {
            const vcfContent = await createVCFString(formData);
            const fileName = buildFileName(formData);
            downloadVCF(vcfContent, fileName);

            const qrContent = await createVCFString(formData, { includePhoto: false });
            updateQrCode(qrContent, formData);

            showFeedback(feedbackElement, 'vCard erfolgreich generiert. Der Download wurde gestartet.', 'success');
        } catch (error) {
            console.error('Fehler beim Erstellen der vCard:', error);
            showFeedback(
                feedbackElement,
                'Das Foto konnte nicht verarbeitet werden. Bitte wähle eine kleinere Datei oder lasse das Foto weg.',
                'error'
            );
        }
    });
});

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
        if (!element) {
            return;
        }
        data[id] = element.value.trim();
    });

    const photoInput = form.elements.photo;
    data.photoFile = photoInput && photoInput.files.length ? photoInput.files[0] : null;

    return data;
}

function validateFormData(data, form) {
    const errors = [];
    const fieldErrors = {};

    if (!data.firstName) {
        const message = 'Bitte gib einen Vornamen ein.';
        errors.push(message);
        fieldErrors.firstName = message;
    }

    if (!data.lastName) {
        const message = 'Bitte gib einen Nachnamen ein.';
        errors.push(message);
        fieldErrors.lastName = message;
    }

    if (data.photoFile && data.photoFile.size > MAX_PHOTO_SIZE_BYTES) {
        const sizeInKb = Math.round(data.photoFile.size / 1024);
        errors.push(`Das Foto ist zu groß (${sizeInKb} KB). Bitte verwende eine Datei mit höchstens 224 KB.`);
    }

    ['emailHome', 'emailWork'].forEach((fieldId) => {
        const value = data[fieldId];
        if (value && !isValidEmail(value)) {
            const message = 'Bitte gib eine gültige E-Mail-Adresse ein.';
            errors.push(message);
            fieldErrors[fieldId] = message;
        }
    });

    ['website', 'calendar', 'socialLinkedIn', 'socialYoutube'].forEach((fieldId) => {
        const value = data[fieldId];
        if (value && !isValidUrl(value)) {
            const message = 'Bitte gib eine gültige URL mit http(s) an.';
            errors.push(message);
            fieldErrors[fieldId] = message;
        }
    });

    ['phoneMobile', 'phoneHome', 'phoneWork', 'faxHome', 'faxWork'].forEach((fieldId) => {
        const value = data[fieldId];
        if (value && !isValidPhone(value)) {
            const message = 'Bitte verwende nur erlaubte Zeichen und mindestens fünf Ziffern.';
            errors.push(message);
            fieldErrors[fieldId] = message;
        }
    });

    const hasWorkDetails = [
        'emailWork', 'phoneWork', 'faxWork', 'adrWorkStreet', 'adrWorkCity', 'adrWorkState', 'adrWorkZip', 'adrWorkCountry'
    ].some((fieldId) => Boolean(data[fieldId]));

    if (hasWorkDetails && !data.company) {
        const message = 'Bitte gib einen Unternehmensnamen an, wenn du geschäftliche Kontaktdaten ergänzt.';
        errors.push(message);
        fieldErrors.company = message;
    }

    if (Object.keys(fieldErrors).length > 0) {
        applyFieldErrors(form, fieldErrors);
    }

    return [...new Set(errors)];
}

function showFeedback(element, message, type) {
    element.textContent = message;
    element.classList.remove('form-feedback--error', 'form-feedback--success');
    element.classList.add('form-feedback', 'is-visible');

    if (type === 'error') {
        element.classList.add('form-feedback--error');
    } else {
        element.classList.add('form-feedback--success');
    }
}

function hideFeedback(element) {
    element.textContent = '';
    element.classList.remove('is-visible', 'form-feedback--error', 'form-feedback--success');
}

async function createVCFString(data, options = {}) {
    const { includePhoto = true } = { includePhoto: true, ...options };
    const lines = [];
    lines.push('BEGIN:VCARD');
    lines.push('VERSION:3.0');

    buildNameSection(lines, data);
    buildProfessionalSection(lines, data);
    buildCommunicationSection(lines, data);
    buildAddressSection(lines, data);
    buildSocialSection(lines, data);

    if (includePhoto && data.photoFile) {
        const photoLine = await buildPhotoLine(data.photoFile);
        if (photoLine) {
            lines.push(photoLine);
        }
    }

    lines.push('END:VCARD');
    return lines.join('\r\n');
}

function buildNameSection(lines, data) {
    const nParts = [
        escapeVCF(data.lastName),
        escapeVCF(data.firstName),
        escapeVCF(data.middleName),
        escapeVCF(data.prefix),
        escapeVCF(data.suffix)
    ];

    lines.push(`N:${nParts.join(';')}`);

    const formattedName = getFormattedName(data);

    if (formattedName) {
        lines.push(`FN:${escapeVCF(formattedName)}`);
    }

    addField(lines, 'NICKNAME', data.nickname);

    if (data.birthday) {
        lines.push(`BDAY:${data.birthday}`);
    }
}

function buildProfessionalSection(lines, data) {
    addField(lines, 'ORG', data.company);
    addField(lines, 'TITLE', data.title);
    addField(lines, 'URL', data.website);
    addField(lines, 'CALURI', data.calendar);
    addField(lines, 'NOTE', data.notes);
}

function buildCommunicationSection(lines, data) {
    addField(lines, 'EMAIL;TYPE=HOME', data.emailHome);
    addField(lines, 'EMAIL;TYPE=WORK', data.emailWork);

    addField(lines, 'TEL;TYPE=CELL', data.phoneMobile);
    addField(lines, 'TEL;TYPE=HOME', data.phoneHome);
    addField(lines, 'TEL;TYPE=WORK', data.phoneWork);
    addField(lines, 'TEL;TYPE=FAX,HOME', data.faxHome);
    addField(lines, 'TEL;TYPE=FAX,WORK', data.faxWork);
}

function buildAddressSection(lines, data) {
    const homeAddress = buildAddressValues({
        street: data.adrHomeStreet,
        city: data.adrHomeCity,
        state: data.adrHomeState,
        zip: data.adrHomeZip,
        country: data.adrHomeCountry
    });

    if (homeAddress.addressLine) {
        lines.push(`ADR;TYPE=HOME:${homeAddress.addressLine}`);
    }

    if (homeAddress.label) {
        lines.push(`LABEL;TYPE=HOME:${escapeVCF(homeAddress.label)}`);
    }

    const workAddress = buildAddressValues({
        street: data.adrWorkStreet,
        city: data.adrWorkCity,
        state: data.adrWorkState,
        zip: data.adrWorkZip,
        country: data.adrWorkCountry
    });

    if (workAddress.addressLine) {
        lines.push(`ADR;TYPE=WORK:${workAddress.addressLine}`);
    }

    if (workAddress.label) {
        lines.push(`LABEL;TYPE=WORK:${escapeVCF(workAddress.label)}`);
    }
}

function buildSocialSection(lines, data) {
    addSocial(lines, 'facebook', data.socialFacebook);
    addSocial(lines, 'twitter', data.socialTwitter);
    addSocial(lines, 'linkedin', data.socialLinkedIn);
    addSocial(lines, 'instagram', data.socialInstagram);
    addSocial(lines, 'youtube', data.socialYoutube);
    addSocial(lines, 'tiktok', data.socialTikTok);
}

async function buildPhotoLine(photoFile) {
    try {
        const photoData = await readPhoto(photoFile);
        if (!photoData) {
            return '';
        }

        const line = `PHOTO;ENCODING=b64;TYPE=${photoData.type}:${photoData.base64}`;
        return foldLine(line);
    } catch (error) {
        throw new Error(`Bild konnte nicht gelesen werden: ${error.message}`);
    }
}

function buildAddressValues({ street, city, state, zip, country }) {
    const addressParts = [
        '',
        '',
        escapeVCF(street),
        escapeVCF(city),
        escapeVCF(state),
        escapeVCF(zip),
        escapeVCF(country)
    ];

    const value = addressParts.join(';');
    const hasContent = addressParts.some((part) => part && part.trim().length > 0);

    const labelParts = [street, [zip, city].filter(Boolean).join(' '), country].filter(Boolean);
    const label = labelParts.join('\n');

    return {
        addressLine: hasContent ? value : '',
        label
    };
}

function addField(lines, key, value) {
    if (!value) {
        return;
    }
    lines.push(`${key}:${escapeVCF(value)}`);
}

function addSocial(lines, type, value) {
    if (!value) {
        return;
    }

    let url = value.trim();

    if (!url.startsWith('http')) {
        switch (type) {
            case 'twitter':
                url = `https://x.com/${url.replace(/^@/, '')}`;
                break;
            case 'instagram':
                url = `https://instagram.com/${url.replace(/^@/, '')}`;
                break;
            case 'tiktok':
                url = `https://tiktok.com/@${url.replace(/^@/, '')}`;
                break;
            case 'facebook':
                url = `https://facebook.com/${url}`;
                break;
            case 'youtube':
                url = `https://youtube.com/@${url.replace(/^@/, '')}`;
                break;
            default:
                url = `https://${type}.com/${url}`;
        }
    }

    lines.push(`X-SOCIALPROFILE;TYPE=${type}:${escapeVCF(url)}`);
}

function escapeVCF(text) {
    if (!text) {
        return '';
    }

    return text
        .replace(/\\/g, '\\\\')
        .replace(/,/g, '\\,')
        .replace(/;/g, '\\;')
        .replace(/\r?\n/g, '\\n');
}

function foldLine(line) {
    const maxLineLength = 75;
    let result = '';
    let index = 0;

    while (index < line.length) {
        if (index === 0) {
            result += line.substring(index, index + maxLineLength);
            index += maxLineLength;
        } else {
            result += `\r\n ` + line.substring(index, index + maxLineLength - 1);
            index += maxLineLength - 1;
        }
    }

    return result;
}

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

function buildFileName(data) {
    const rawName = [data.firstName, data.lastName].filter(Boolean).join('_') || 'kontakt';
    const normalized = rawName
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-zA-Z0-9._-]+/g, '_')
        .replace(/_+/g, '_')
        .replace(/^_+|_+$/g, '');

    const safeName = normalized || 'kontakt';
    return `${safeName}.vcf`;
}

function readPhoto(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();

        reader.onload = (event) => {
            const dataUrl = event.target.result;
            const base64String = dataUrl.split(',')[1];
            const type = dataUrl.substring(dataUrl.indexOf(':') + 1, dataUrl.indexOf(';')).split('/')[1].toUpperCase();

            resolve({ base64: base64String, type });
        };

        reader.onerror = (error) => {
            reject(error);
        };

        reader.readAsDataURL(file);
    });
}

function clearFieldErrors(form) {
    if (!form) {
        return;
    }

    form.querySelectorAll('.field-error').forEach((errorElement) => {
        const fieldId = errorElement.dataset.for;
        if (fieldId) {
            const field = form.elements[fieldId];
            if (field && field.dataset.originalDescribedby) {
                if (field.dataset.originalDescribedby === 'none') {
                    field.removeAttribute('aria-describedby');
                } else {
                    field.setAttribute('aria-describedby', field.dataset.originalDescribedby);
                }
                delete field.dataset.originalDescribedby;
            }
        }

        errorElement.remove();
    });

    Array.from(form.elements).forEach((element) => {
        if (element.classList) {
            element.classList.remove('input--error');
        }
        if (element.hasAttribute('aria-invalid')) {
            element.removeAttribute('aria-invalid');
        }
    });
}

function applyFieldErrors(form, fieldErrors) {
    Object.entries(fieldErrors).forEach(([fieldId, message]) => {
        const field = form.elements[fieldId];
        if (!field) {
            return;
        }

        field.setAttribute('aria-invalid', 'true');
        field.classList.add('input--error');

        if (!field.dataset.originalDescribedby) {
            field.dataset.originalDescribedby = field.getAttribute('aria-describedby') || 'none';
        }

        const errorId = `${fieldId}-error`;
        const describedby = field.getAttribute('aria-describedby');
        field.setAttribute('aria-describedby', describedby ? `${describedby} ${errorId}`.trim() : errorId);

        const errorElement = document.createElement('p');
        errorElement.className = 'field-error';
        errorElement.id = errorId;
        errorElement.dataset.for = fieldId;
        errorElement.textContent = message;
        field.insertAdjacentElement('afterend', errorElement);
    });
}

function isValidEmail(value) {
    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailPattern.test(value);
}

function isValidUrl(value) {
    try {
        const url = new URL(value);
        return url.protocol === 'http:' || url.protocol === 'https:';
    } catch (error) {
        return false;
    }
}

function isValidPhone(value) {
    const allowedChars = /^[0-9+()\s\-\/]+$/;
    if (!allowedChars.test(value)) {
        return false;
    }

    const digitCount = value.replace(/[^0-9]/g, '').length;
    return digitCount >= 5;
}

function handlePreviewUpdate(form) {
    if (!form) {
        return;
    }

    latestFormData = collectFormData(form);
    renderPreview(latestFormData);

    createVCFString(latestFormData, { includePhoto: false })
        .then((vcfContent) => {
            updateQrCode(vcfContent, latestFormData);
        })
        .catch((error) => {
            console.error('Fehler beim Aktualisieren der Vorschau:', error);
            updateQrCode('', latestFormData);
        });
}

function renderPreview(data) {
    const placeholder = document.getElementById('preview-placeholder');
    const content = document.getElementById('preview-content');
    if (!placeholder || !content) {
        return;
    }

    const hasName = Boolean(data.firstName || data.lastName);
    placeholder.hidden = hasName;
    content.hidden = !hasName;

    if (!hasName) {
        return;
    }

    const nameElement = document.getElementById('preview-name');
    const roleElement = document.getElementById('preview-role');
    const companyElement = document.getElementById('preview-company');
    const contactList = document.getElementById('preview-contact-list');
    const addressList = document.getElementById('preview-address-list');
    const notesWrapper = document.getElementById('preview-notes-wrapper');
    const notesElement = document.getElementById('preview-notes');

    const displayName = getFormattedName(data) || [data.firstName, data.lastName].filter(Boolean).join(' ');
    nameElement.textContent = displayName;

    if (data.title) {
        roleElement.hidden = false;
        roleElement.textContent = data.title;
    } else {
        roleElement.hidden = true;
        roleElement.textContent = '';
    }

    if (data.company) {
        companyElement.hidden = false;
        companyElement.textContent = data.company;
    } else {
        companyElement.hidden = true;
        companyElement.textContent = '';
    }

    const contactItems = [];
    if (data.emailHome) {
        contactItems.push({ label: 'E-Mail privat', value: data.emailHome });
    }
    if (data.emailWork) {
        contactItems.push({ label: 'E-Mail geschäftlich', value: data.emailWork });
    }
    if (data.phoneMobile) {
        contactItems.push({ label: 'Mobil', value: data.phoneMobile });
    }
    if (data.phoneWork) {
        contactItems.push({ label: 'Telefon geschäftlich', value: data.phoneWork });
    }
    if (data.phoneHome) {
        contactItems.push({ label: 'Telefon privat', value: data.phoneHome });
    }
    if (data.website) {
        contactItems.push({ label: 'Website', value: data.website });
    }
    if (data.calendar) {
        contactItems.push({ label: 'Kalender', value: data.calendar });
    }

    populatePreviewList(contactList, contactItems, 'Noch keine Kontaktdaten ergänzt.');

    const addressItems = [];
    const homeAddress = formatAddressPreview({
        label: 'Privat',
        street: data.adrHomeStreet,
        zip: data.adrHomeZip,
        city: data.adrHomeCity,
        country: data.adrHomeCountry
    });

    if (homeAddress) {
        addressItems.push(homeAddress);
    }

    const workAddress = formatAddressPreview({
        label: 'Geschäftlich',
        street: data.adrWorkStreet,
        zip: data.adrWorkZip,
        city: data.adrWorkCity,
        country: data.adrWorkCountry
    });

    if (workAddress) {
        addressItems.push(workAddress);
    }

    populatePreviewList(addressList, addressItems, 'Noch keine Adressen ergänzt.');

    if (data.notes) {
        notesWrapper.hidden = false;
        notesElement.textContent = data.notes;
    } else {
        notesWrapper.hidden = true;
        notesElement.textContent = '';
    }
}

function populatePreviewList(listElement, items, emptyText) {
    if (!listElement) {
        return;
    }

    listElement.innerHTML = '';

    if (!items.length) {
        const emptyItem = document.createElement('li');
        emptyItem.className = 'preview-card__list-item preview-card__list-item--empty';
        const value = document.createElement('span');
        value.className = 'preview-card__item-value';
        value.textContent = emptyText;
        emptyItem.appendChild(value);
        listElement.appendChild(emptyItem);
        return;
    }

    items.forEach((item) => {
        const listItem = document.createElement('li');
        listItem.className = 'preview-card__list-item';

        if (item.label) {
            const label = document.createElement('span');
            label.className = 'preview-card__item-label';
            label.textContent = item.label;
            listItem.appendChild(label);
        }

        const value = document.createElement('span');
        value.className = 'preview-card__item-value';
        value.textContent = item.value;
        listItem.appendChild(value);

        listElement.appendChild(listItem);
    });
}

function formatAddressPreview({ label, street, zip, city, country }) {
    const parts = [street, [zip, city].filter(Boolean).join(' '), country].filter(Boolean);
    if (!parts.length) {
        return null;
    }

    return {
        label,
        value: parts.join('\n')
    };
}

function ensureQrCodeInstance(container) {
    if (typeof QRCode === 'undefined') {
        console.warn('QR-Code Bibliothek nicht geladen.');
        return null;
    }

    if (!qrCodeInstance) {
        qrCodeInstance = new QRCode(container, {
            width: 220,
            height: 220,
            colorDark: '#111827',
            colorLight: '#ffffff',
            correctLevel: QRCode.CorrectLevel.M
        });
    }

    return qrCodeInstance;
}

function updateQrCode(vcfContent, data) {
    const container = document.getElementById('qrPreview');
    const downloadButton = document.getElementById('qr-download');

    if (!container || !downloadButton) {
        return;
    }

    if (!vcfContent || !data.firstName || !data.lastName) {
        if (qrCodeInstance) {
            qrCodeInstance.clear();
        }
        container.innerHTML = '';
        latestQrDataUrl = '';
        downloadButton.disabled = true;
        return;
    }

    const instance = ensureQrCodeInstance(container);
    if (!instance) {
        return;
    }

    instance.clear();
    instance.makeCode(vcfContent);

    const canvas = container.querySelector('canvas');
    const image = container.querySelector('img');

    if (canvas) {
        try {
            latestQrDataUrl = canvas.toDataURL('image/png');
        } catch (error) {
            latestQrDataUrl = '';
            console.error('QR-Code konnte nicht exportiert werden:', error);
        }
    } else if (image) {
        latestQrDataUrl = image.src;
    } else {
        latestQrDataUrl = '';
    }

    downloadButton.disabled = !latestQrDataUrl;
}

function debounce(fn, delay) {
    let timeoutId;
    return (...args) => {
        clearTimeout(timeoutId);
        timeoutId = setTimeout(() => {
            fn(...args);
        }, delay);
    };
}

function getFormattedName(data) {
    return [data.prefix, data.firstName, data.middleName, data.lastName, data.suffix]
        .filter(Boolean)
        .join(' ');
}
