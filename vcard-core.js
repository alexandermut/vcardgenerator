const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_REGEX = /^[0-9+()\-\s\/]+$/;
const SOCIAL_HANDLE_REGEX = /^[^\s]+$/;

export const MAX_PHOTO_SIZE = 400 * 1024; // 400 KB

export const WORK_FIELDS = [
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

export function computeFieldError(descriptor, value) {
    const { required, type, id, socialHandle } = descriptor;
    if (required && !value) {
        return 'Dieses Feld ist erforderlich.';
    }

    if (!value) {
        return '';
    }

    switch (type) {
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
                if (id === 'calendar' && url.protocol !== 'https:') {
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

    if (socialHandle && type !== 'url') {
        if (!SOCIAL_HANDLE_REGEX.test(value)) {
            return 'Bitte gib den Benutzernamen ohne Leerzeichen ein.';
        }
    }

    return '';
}

export function computeCrossFieldErrors(data) {
    const errors = {};
    const hasWorkInformation = WORK_FIELDS.some((key) => Boolean(data[key]));

    if (hasWorkInformation && !data.company) {
        errors.company = 'Bitte gib dein Unternehmen an, wenn du berufliche Angaben machst.';
    }

    return errors;
}

export function computeErrors(descriptors, data, { photoError } = {}) {
    const errors = {};

    descriptors.forEach((descriptor) => {
        const message = computeFieldError(descriptor, data[descriptor.id]);
        if (message) {
            errors[descriptor.id] = message;
        }
    });

    Object.assign(errors, computeCrossFieldErrors(data));

    if (photoError) {
        errors.photo = photoError;
    }

    return errors;
}

export function shouldEnableQRCode(data, errors) {
    const hasRequired = Boolean(data.firstName) && Boolean(data.lastName);
    if (!hasRequired) {
        return false;
    }
    return Object.keys(errors).length === 0;
}

export function buildPreviewModel(data) {
    const name = [data.prefix, data.firstName, data.middleName, data.lastName, data.suffix]
        .filter(Boolean)
        .join(' ')
        .trim();

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

    const homeAddress = formatAddressLabel(
        'Privat',
        data.adrHomeStreet,
        data.adrHomeZip,
        data.adrHomeCity,
        data.adrHomeState,
        data.adrHomeCountry
    );
    const workAddress = formatAddressLabel(
        'Arbeit',
        data.adrWorkStreet,
        data.adrWorkZip,
        data.adrWorkCity,
        data.adrWorkState,
        data.adrWorkCountry
    );

    const addressItems = [homeAddress, workAddress].filter(Boolean);
    const socialItems = buildSocialPreviewItems(data);

    return {
        name: name || 'Name erscheint hier',
        company: data.company || '',
        showCompany: Boolean(data.company),
        role: data.title || '',
        showRole: Boolean(data.title),
        contactItems,
        addressItems,
        socialItems,
        notes: data.notes || '',
        showNotes: Boolean(data.notes),
    };
}

export function buildVcfPreviewState(data, errors, vcfString) {
    const hasNames = Boolean(data.firstName) && Boolean(data.lastName);
    if (!hasNames) {
        return {
            text: 'Fülle mindestens Vor- und Nachname aus, um die Vorschau zu sehen.',
            placeholder: true,
        };
    }

    if (Object.keys(errors).length > 0 || !vcfString) {
        return {
            text: 'Bitte korrigiere die markierten Felder, um die vCard-Vorschau zu sehen.',
            placeholder: true,
        };
    }

    return {
        text: vcfString,
        placeholder: false,
    };
}

export function formatAddressLabel(label, street, zip, city, state, country) {
    const lines = [street, [zip, city].filter(Boolean).join(' '), [state, country].filter(Boolean).join(', ')]
        .filter(Boolean);
    if (!lines.length) {
        return '';
    }
    return `${label}: ${lines.join(' | ')}`;
}

export function formatDateDisplay(value) {
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

export function buildSocialPreviewItems(data) {
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

export function buildSafeFileName(data) {
    const base = `${data.firstName || ''}_${data.lastName || ''}`.trim() || 'kontakt';
    const normalized = base
        .normalize('NFKD')
        .replace(/[^a-zA-Z0-9._-]+/g, '_')
        .replace(/_{2,}/g, '_')
        .replace(/^_|_$/g, '');
    return normalized || 'kontakt';
}

export function createVCFString(data) {
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

export function formatDateForVCF(value) {
    if (!value) {
        return '';
    }
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        return value.replace(/-/g, '');
    }
    return value;
}

export function validatePhotoFile(file) {
    if (!file) {
        return '';
    }

    if (!['image/jpeg', 'image/png'].includes(file.type)) {
        return 'Nur JPG- oder PNG-Bilder werden unterstützt.';
    }

    if (file.size > MAX_PHOTO_SIZE) {
        return 'Das Bild ist zu groß (maximal 400 KB).';
    }

    return '';
}

function addField(lines, key, value, transform) {
    if (!value) return;
    const processed = transform ? transform(value) : value;
    if (!processed) return;
    lines.push(foldLine(`${key}:${escapeVCF(processed)}`));
}

function addAddress(lines, type, address) {
    const hasValues = Object.values(address).some(Boolean);
    if (!hasValues) {
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

    const clean = value.replace(/^@/, '');
    let url;
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

export function escapeVCF(text) {
    if (!text) return '';
    return text
        .replace(/\\/g, '\\\\')
        .replace(/\n/g, '\\n')
        .replace(/;/g, '\\;')
        .replace(/,/g, '\\,');
}

export function foldLine(line) {
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
