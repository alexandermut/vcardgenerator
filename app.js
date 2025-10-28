const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_REGEX = /^[0-9+()\-\s\/]+$/;
const SOCIAL_HANDLE_REGEX = /^[^\s]+$/;
const MAX_PHOTO_SIZE = 400 * 1024; // 400 KB

const state = {
    photo: null,
    photoError: '',
};

document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('vcard-form');
    const feedback = document.getElementById('form-feedback');
    const qrContainer = document.getElementById('qr-code');
    const qrDownloadButton = document.getElementById('qr-download');

    const fields = Array.from(form.querySelectorAll('input, textarea'));
    const textFields = fields.filter((field) => field.type !== 'file');
    const photoInput = form.querySelector('#photo');

    const previewEls = {
        name: document.getElementById('preview-name'),
        role: document.getElementById('preview-role'),
        company: document.getElementById('preview-company'),
        contactSection: document.getElementById('preview-contact-section'),
        contactList: document.getElementById('preview-contact'),
        addressSection: document.getElementById('preview-address-section'),
        addressList: document.getElementById('preview-address'),
        socialSection: document.getElementById('preview-social-section'),
        socialList: document.getElementById('preview-social'),
        notesSection: document.getElementById('preview-notes-section'),
        notes: document.getElementById('preview-notes'),
    };

    initFieldErrors(fields);

    const workDependentFields = new Set([
        'title',
        'website',
        'emailWork',
        'phoneWork',
        'faxWork',
        'calendar',
        'adrWorkStreet',
        'adrWorkCity',
        'adrWorkState',
        'adrWorkZip',
        'adrWorkCountry',
    ]);

    const touchedFields = new Set();

    function refreshUI({ validateTouched = false } = {}) {
        const data = collectFormData(textFields);
        updatePreview(previewEls, data);

        const allErrors = computeAllErrors(textFields, data);
        if (validateTouched) {
            applyErrors(fields, touchedFields, allErrors);
        }

        if (canGenerateQRCode(data, allErrors)) {
            const vcf = createVCFString({ ...data, photo: state.photo });
            updateQRCode(qrContainer, qrDownloadButton, vcf);
        } else {
            clearQRCode(qrContainer, qrDownloadButton);
        }

        if (feedback.textContent) {
            feedback.textContent = '';
            feedback.classList.remove('success');
        }
    }

    fields.forEach((field) => {
        if (field.type === 'file') {
            field.addEventListener('change', async () => {
                touchedFields.add(field.id);
                await handlePhotoChange(field);
                refreshUI({ validateTouched: true });
            });
            return;
        }

        field.addEventListener('input', () => {
            if (workDependentFields.has(field.id)) {
                touchedFields.add('company');
            }

            const data = collectFormData(textFields);
            const allErrors = computeAllErrors(textFields, data);

            if (touchedFields.has(field.id) || touchedFields.size > 0) {
                applyErrors(fields, touchedFields, allErrors);
            }

            if (canGenerateQRCode(data, allErrors)) {
                const vcf = createVCFString({ ...data, photo: state.photo });
                updateQRCode(qrContainer, qrDownloadButton, vcf);
            } else {
                clearQRCode(qrContainer, qrDownloadButton);
            }

            updatePreview(previewEls, data);
            if (feedback.textContent) {
                feedback.textContent = '';
                feedback.classList.remove('success');
            }
        });

        field.addEventListener('blur', () => {
            touchedFields.add(field.id);
            if (workDependentFields.has(field.id)) {
                touchedFields.add('company');
            }

            const data = collectFormData(textFields);
            const allErrors = computeAllErrors(textFields, data);
            applyErrors(fields, touchedFields, allErrors);

            if (canGenerateQRCode(data, allErrors)) {
                const vcf = createVCFString({ ...data, photo: state.photo });
                updateQRCode(qrContainer, qrDownloadButton, vcf);
            } else {
                clearQRCode(qrContainer, qrDownloadButton);
            }
        });
    });

    qrDownloadButton.addEventListener('click', () => {
        const dataUrl = getQRCodeDataUrl(qrContainer);
        if (!dataUrl) {
            return;
        }
        const data = collectFormData(textFields);
        const fileName = `${buildSafeFileName(data)}-qr.png`;
        downloadDataUrl(dataUrl, fileName);
    });

    form.addEventListener('submit', (event) => {
        event.preventDefault();

        textFields.forEach((field) => touchedFields.add(field.id));
        touchedFields.add(photoInput.id);

        const data = collectFormData(textFields);
        const allErrors = computeAllErrors(textFields, data);
        applyErrors(fields, touchedFields, allErrors);

        if (Object.keys(allErrors).length > 0) {
            feedback.textContent = 'Bitte korrigiere die markierten Felder.';
            feedback.classList.remove('success');
            clearQRCode(qrContainer, qrDownloadButton);
            return;
        }

        const vcf = createVCFString({ ...data, photo: state.photo });
        const fileName = buildSafeFileName(data);
        downloadVCF(vcf, `${fileName}.vcf`);
        feedback.textContent = 'vCard erfolgreich erstellt und heruntergeladen.';
        feedback.classList.add('success');
        updateQRCode(qrContainer, qrDownloadButton, vcf);
    });

    refreshUI();
});

function collectFormData(fields) {
    const data = {};
    fields.forEach((field) => {
        data[field.id] = field.value.trim();
    });
    return data;
}

async function handlePhotoChange(input) {
    const file = input.files && input.files[0];
    if (!file) {
        state.photo = null;
        state.photoError = '';
        setFieldError(input, '');
        return;
    }

    if (!['image/jpeg', 'image/png'].includes(file.type)) {
        const message = 'Nur JPG- oder PNG-Bilder werden unterstützt.';
        state.photoError = message;
        state.photo = null;
        setFieldError(input, message);
        return;
    }

    if (file.size > MAX_PHOTO_SIZE) {
        const message = 'Das Bild ist zu groß (maximal 400 KB).';
        state.photoError = message;
        state.photo = null;
        setFieldError(input, message);
        return;
    }

    try {
        const photoData = await readPhoto(file);
        state.photo = photoData;
        state.photoError = '';
        setFieldError(input, '');
    } catch (error) {
        const message = 'Bild konnte nicht gelesen werden. Bitte erneut versuchen.';
        console.error('Fehler beim Einlesen des Bildes', error);
        state.photo = null;
        state.photoError = message;
        setFieldError(input, message);
    }
}

function computeAllErrors(fields, data) {
    const errors = {};

    fields.forEach((field) => {
        const message = computeFieldError(field, data);
        if (message) {
            errors[field.id] = message;
        }
    });

    const crossErrors = computeCrossFieldErrors(data);
    Object.assign(errors, crossErrors);

    if (state.photoError) {
        errors.photo = state.photoError;
    }

    return errors;
}

function computeFieldError(field, data) {
    const value = data[field.id];

    if (field.required && !value) {
        return 'Dieses Feld ist erforderlich.';
    }

    if (!value) {
        return '';
    }

    switch (field.type) {
        case 'email':
            if (!EMAIL_REGEX.test(value)) {
                return 'Bitte gib eine gültige E-Mail-Adresse ein.';
            }
            break;
        case 'url':
            try {
                const url = new URL(value);
                if (!['http:', 'https:'].includes(url.protocol)) {
                    return 'Nur http- oder https-Links sind erlaubt.';
                }
                if (field.id === 'calendar' && url.protocol !== 'https:') {
                    return 'Der Kalender-Link sollte per https erreichbar sein.';
                }
            } catch (error) {
                return 'Bitte gib eine vollständige URL an.';
            }
            break;
        case 'tel':
            if (!PHONE_REGEX.test(value)) {
                return 'Nur Ziffern, Leerzeichen, Klammern, +, - und / sind erlaubt.';
            }
            break;
        default:
            break;
    }

    if (field.id.startsWith('social') && field.type !== 'url') {
        if (!SOCIAL_HANDLE_REGEX.test(value)) {
            return 'Bitte gib den Benutzernamen ohne Leerzeichen ein.';
        }
    }

    return '';
}

function computeCrossFieldErrors(data) {
    const errors = {};
    const workFields = [
        'title',
        'website',
        'emailWork',
        'phoneWork',
        'faxWork',
        'calendar',
        'adrWorkStreet',
        'adrWorkCity',
        'adrWorkState',
        'adrWorkZip',
        'adrWorkCountry',
    ];

    const hasWorkInformation = workFields.some((key) => Boolean(data[key]));

    if (hasWorkInformation && !data.company) {
        errors.company = 'Bitte gib dein Unternehmen an, wenn du berufliche Angaben machst.';
    }

    return errors;
}

function applyErrors(fields, touchedFields, errors) {
    const ids = new Set();
    fields.forEach((field) => {
        if (touchedFields instanceof Set) {
            if (!touchedFields.has(field.id)) {
                return;
            }
        }
        ids.add(field.id);
    });

    if (touchedFields instanceof Set && touchedFields.has('photo')) {
        ids.add('photo');
    }

    ids.forEach((id) => {
        if (id === 'photo') {
            const field = document.getElementById('photo');
            const message = errors[id] || '';
            setFieldError(field, message);
            return;
        }

        const field = document.getElementById(id);
        if (!field) {
            return;
        }
        const message = errors[id] || '';
        setFieldError(field, message);
    });
}

function setFieldError(field, message) {
    if (!field) return;
    const errorElement = document.getElementById(`${field.id}-error`);
    if (!errorElement) return;

    if (message) {
        errorElement.textContent = message;
        errorElement.classList.add('active');
        field.classList.add('invalid');
    } else {
        errorElement.textContent = '';
        errorElement.classList.remove('active');
        field.classList.remove('invalid');
    }
}

function initFieldErrors(fields) {
    fields.forEach((field) => {
        if (document.getElementById(`${field.id}-error`)) {
            return;
        }
        const error = document.createElement('p');
        error.id = `${field.id}-error`;
        error.className = 'field-error';
        field.insertAdjacentElement('afterend', error);
    });
}

function canGenerateQRCode(data, errors) {
    const hasRequired = Boolean(data.firstName) && Boolean(data.lastName);
    if (!hasRequired) {
        return false;
    }
    return Object.keys(errors).length === 0;
}

function updatePreview(previewEls, data) {
    const fullName = [data.prefix, data.firstName, data.middleName, data.lastName, data.suffix]
        .filter(Boolean)
        .join(' ')
        .trim();
    previewEls.name.textContent = fullName || 'Name erscheint hier';

    previewEls.role.textContent = data.title || '';
    previewEls.role.hidden = !data.title;

    previewEls.company.textContent = data.company || '';
    previewEls.company.hidden = !data.company;

    const contactItems = [];
    if (data.emailWork) contactItems.push(`Geschäftlich: ${data.emailWork}`);
    if (data.emailHome) contactItems.push(`Privat: ${data.emailHome}`);
    if (data.phoneWork) contactItems.push(`Telefon (Arbeit): ${data.phoneWork}`);
    if (data.phoneHome) contactItems.push(`Telefon (Privat): ${data.phoneHome}`);
    if (data.phoneMobile) contactItems.push(`Mobil: ${data.phoneMobile}`);
    if (data.faxWork) contactItems.push(`Fax (Arbeit): ${data.faxWork}`);
    if (data.faxHome) contactItems.push(`Fax (Privat): ${data.faxHome}`);
    if (data.website) contactItems.push(`Website: ${data.website}`);
    if (data.calendar) contactItems.push(`Kalender: ${data.calendar}`);
    if (data.birthday) contactItems.push(`Geburtstag: ${formatDateDisplay(data.birthday)}`);

    renderList(previewEls.contactList, contactItems);
    previewEls.contactSection.hidden = contactItems.length === 0;

    const addressItems = [];
    const homeAddress = formatAddressLabel('Privat', data.adrHomeStreet, data.adrHomeZip, data.adrHomeCity, data.adrHomeState, data.adrHomeCountry);
    if (homeAddress) addressItems.push(homeAddress);
    const workAddress = formatAddressLabel('Arbeit', data.adrWorkStreet, data.adrWorkZip, data.adrWorkCity, data.adrWorkState, data.adrWorkCountry);
    if (workAddress) addressItems.push(workAddress);

    renderList(previewEls.addressList, addressItems);
    previewEls.addressSection.hidden = addressItems.length === 0;

    const socialItems = buildSocialPreviewItems(data);
    renderList(previewEls.socialList, socialItems);
    previewEls.socialSection.hidden = socialItems.length === 0;

    if (data.notes) {
        previewEls.notes.textContent = data.notes;
        previewEls.notesSection.hidden = false;
    } else {
        previewEls.notes.textContent = '';
        previewEls.notesSection.hidden = true;
    }
}

function renderList(element, items) {
    element.innerHTML = '';
    if (!items.length) {
        return;
    }
    const fragment = document.createDocumentFragment();
    items.forEach((item) => {
        const li = document.createElement('li');
        li.textContent = item;
        fragment.appendChild(li);
    });
    element.appendChild(fragment);
}

function formatAddressLabel(label, street, zip, city, state, country) {
    const lines = [street, [zip, city].filter(Boolean).join(' '), [state, country].filter(Boolean).join(', ')].filter(Boolean);
    if (!lines.length) {
        return '';
    }
    return `${label}: ${lines.join(' | ')}`;
}

function formatDateDisplay(value) {
    try {
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) {
            return value;
        }
        return date.toLocaleDateString('de-DE', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
        });
    } catch (error) {
        return value;
    }
}

function buildSocialPreviewItems(data) {
    const items = [];
    const mapping = [
        ['socialLinkedIn', 'LinkedIn'],
        ['socialFacebook', 'Facebook'],
        ['socialTwitter', 'X'],
        ['socialInstagram', 'Instagram'],
        ['socialYoutube', 'YouTube'],
        ['socialTikTok', 'TikTok'],
    ];
    mapping.forEach(([key, label]) => {
        if (data[key]) {
            items.push(`${label}: ${data[key]}`);
        }
    });
    return items;
}

function updateQRCode(container, downloadButton, value) {
    if (!value) {
        clearQRCode(container, downloadButton);
        return;
    }

    if (typeof QRCode === 'undefined') {
        container.textContent = 'QR-Code Bibliothek konnte nicht geladen werden.';
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
        const exportable = getQRCodeDataUrl(container);
        downloadButton.disabled = !exportable;
    }, 50);
}

function clearQRCode(container, downloadButton) {
    if (container._qrCodeInstance) {
        container._qrCodeInstance.clear();
    }
    container.innerHTML = '<p>Der QR-Code erscheint, sobald alle Pflichtfelder gültig sind.</p>';
    downloadButton.disabled = true;
}

function getQRCodeDataUrl(container) {
    const canvas = container.querySelector('canvas');
    if (canvas && canvas.toDataURL) {
        return canvas.toDataURL('image/png');
    }
    const img = container.querySelector('img');
    return img ? img.src : '';
}

function buildSafeFileName(data) {
    const base = `${data.firstName || ''}_${data.lastName || ''}`.trim() || 'kontakt';
    const normalized = base
        .normalize('NFKD')
        .replace(/[^a-zA-Z0-9._-]+/g, '_')
        .replace(/_{2,}/g, '_')
        .replace(/^_|_$/g, '');
    return normalized || 'kontakt';
}

function createVCFString(data) {
    const lines = [];
    lines.push('BEGIN:VCARD');
    lines.push('VERSION:3.0');
    lines.push('PRODID:-//vCard Generator//DE');
    lines.push(foldLine(`REV:${new Date().toISOString()}`));

    const n = [data.lastName, data.firstName, data.middleName, data.prefix, data.suffix]
        .map(escapeVCF)
        .join(';');
    lines.push(foldLine(`N:${n}`));

    const formattedName = [data.prefix, data.firstName, data.middleName, data.lastName, data.suffix]
        .filter(Boolean)
        .join(' ')
        .trim() || `${data.firstName} ${data.lastName}`.trim();
    lines.push(foldLine(`FN:${escapeVCF(formattedName)}`));

    addField(lines, 'NICKNAME', data.nickname);
    addField(lines, 'BDAY', data.birthday, formatDateForVCF);
    addField(lines, 'ORG', data.company);
    addField(lines, 'TITLE', data.title);
    addField(lines, 'URL', data.website);
    addField(lines, 'CALURI', data.calendar);
    addField(lines, 'NOTE', data.notes);

    addField(lines, 'EMAIL;TYPE=HOME', data.emailHome);
    addField(lines, 'EMAIL;TYPE=WORK', data.emailWork);

    addField(lines, 'TEL;TYPE=CELL', data.phoneMobile);
    addField(lines, 'TEL;TYPE=HOME', data.phoneHome);
    addField(lines, 'TEL;TYPE=WORK', data.phoneWork);
    addField(lines, 'TEL;TYPE=FAX,HOME', data.faxHome);
    addField(lines, 'TEL;TYPE=FAX,WORK', data.faxWork);

    addAddress(lines, 'HOME', {
        street: data.adrHomeStreet,
        city: data.adrHomeCity,
        region: data.adrHomeState,
        zip: data.adrHomeZip,
        country: data.adrHomeCountry,
    });

    addAddress(lines, 'WORK', {
        street: data.adrWorkStreet,
        city: data.adrWorkCity,
        region: data.adrWorkState,
        zip: data.adrWorkZip,
        country: data.adrWorkCountry,
    });

    addSocial(lines, 'facebook', data.socialFacebook);
    addSocial(lines, 'twitter', data.socialTwitter);
    addSocial(lines, 'linkedin', data.socialLinkedIn);
    addSocial(lines, 'instagram', data.socialInstagram);
    addSocial(lines, 'youtube', data.socialYoutube);
    addSocial(lines, 'tiktok', data.socialTikTok);

    if (data.photo && data.photo.base64 && data.photo.type) {
        const line = `PHOTO;ENCODING=b64;TYPE=${data.photo.type}:${data.photo.base64}`;
        lines.push(foldLine(line));
    }

    lines.push('END:VCARD');
    return lines.join('\r\n');
}

function addField(lines, key, value, transform) {
    if (!value) return;
    const processed = transform ? transform(value) : value;
    if (!processed) return;
    lines.push(foldLine(`${key}:${escapeVCF(processed)}`));
}

function addAddress(lines, type, address) {
    const parts = [address.street, address.city, address.region, address.zip, address.country];
    if (parts.every((part) => !part)) {
        return;
    }
    const adrValue = [
        '',
        '',
        escapeVCF(address.street || ''),
        escapeVCF(address.city || ''),
        escapeVCF(address.region || ''),
        escapeVCF(address.zip || ''),
        escapeVCF(address.country || ''),
    ].join(';');
    lines.push(foldLine(`ADR;TYPE=${type}:${adrValue}`));

    const labelLines = [
        address.street,
        [address.zip, address.city].filter(Boolean).join(' '),
        [address.region, address.country].filter(Boolean).join(', '),
    ].filter(Boolean);

    if (labelLines.length) {
        lines.push(foldLine(`LABEL;TYPE=${type}:${escapeVCF(labelLines.join('\n'))}`));
    }
}

function addSocial(lines, type, value) {
    if (!value) return;

    if (value.startsWith('http')) {
        lines.push(foldLine(`X-SOCIALPROFILE;TYPE=${type}:${escapeVCF(value)}`));
        return;
    }

    let url;
    const clean = value.replace(/^@/, '');
    switch (type) {
        case 'twitter':
            url = `https://x.com/${clean}`;
            break;
        case 'instagram':
            url = `https://instagram.com/${clean}`;
            break;
        case 'tiktok':
            url = `https://tiktok.com/@${clean}`;
            break;
        case 'facebook':
            url = `https://facebook.com/${clean}`;
            break;
        case 'youtube':
            url = `https://youtube.com/${clean}`;
            break;
        default:
            url = `https://${type}.com/${clean}`;
            break;
    }
    lines.push(foldLine(`X-SOCIALPROFILE;TYPE=${type}:${escapeVCF(url)}`));
}

function escapeVCF(text) {
    if (!text) return '';
    return text
        .replace(/\\/g, '\\\\')
        .replace(/\n/g, '\\n')
        .replace(/;/g, '\\;')
        .replace(/,/g, '\\,');
}

function foldLine(line) {
    const maxLength = 75;
    if (line.length <= maxLength) {
        return line;
    }
    let result = '';
    let index = 0;
    while (index < line.length) {
        if (index === 0) {
            result += line.substring(index, index + maxLength);
            index += maxLength;
        } else {
            result += `\r\n ${line.substring(index, index + maxLength - 1)}`;
            index += maxLength - 1;
        }
    }
    return result;
}

function formatDateForVCF(value) {
    if (!value) {
        return '';
    }
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        return value.replace(/-/g, '');
    }
    return value;
}

function readPhoto(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (event) => {
            const dataUrl = event.target.result;
            const base64 = dataUrl.split(',')[1];
            const type = file.type.split('/')[1].toUpperCase();
            resolve({ base64, type });
        };
        reader.onerror = (error) => reject(error);
        reader.readAsDataURL(file);
    });
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

function downloadDataUrl(dataUrl, fileName) {
    const link = document.createElement('a');
    link.href = dataUrl;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

