const MAX_PHOTO_SIZE_BYTES = 224 * 1024;

document.addEventListener('DOMContentLoaded', () => {
    const vcardForm = document.getElementById('vcard-form');
    const feedbackElement = document.getElementById('form-feedback');

    vcardForm.addEventListener('submit', async (event) => {
        event.preventDefault();

        hideFeedback(feedbackElement);

        const formData = collectFormData(vcardForm);
        const validationErrors = validateFormData(formData);

        if (validationErrors.length > 0) {
            showFeedback(feedbackElement, validationErrors.join('\n'), 'error');
            return;
        }

        try {
            const vcfContent = await createVCFString(formData);
            const fileName = buildFileName(formData);
            downloadVCF(vcfContent, fileName);
            showFeedback(feedbackElement, 'vCard erfolgreich generiert. Der Download wurde gestartet.', 'success');
        } catch (error) {
            console.error('Fehler beim Erstellen der vCard:', error);
            showFeedback(feedbackElement, 'Das Foto konnte nicht verarbeitet werden. Bitte wähle eine kleinere Datei oder lasse das Foto weg.', 'error');
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
        errors.push(`Das Foto ist zu groß (${sizeInKb} KB). Bitte verwende eine Datei mit höchstens 224 KB.`);
    }

    return errors;
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

async function createVCFString(data) {
    const lines = [];
    lines.push('BEGIN:VCARD');
    lines.push('VERSION:3.0');

    buildNameSection(lines, data);
    buildProfessionalSection(lines, data);
    buildCommunicationSection(lines, data);
    buildAddressSection(lines, data);
    buildSocialSection(lines, data);

    if (data.photoFile) {
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

    const formattedName = [data.prefix, data.firstName, data.middleName, data.lastName, data.suffix]
        .filter(Boolean)
        .join(' ');

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
    const maxLength = 75;
    if (line.length <= maxLength) {
        return line;
    }
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
