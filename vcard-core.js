/**
 * Erstellt einen vCard 3.0 String aus einem Datenobjekt.
 * @param {object} data - Das Datenobjekt mit allen Kontaktinformationen.
 * @returns {string} Der fertige vCard-String.
 */
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
    addField(lines, 'BDAY', data.birthday, formatDateForVCF); // Nutzt jetzt formatDateForVCF
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

/**
 * Erstellt einen bereinigten Dateinamen.
 * @param {object} data - Das Datenobjekt (braucht firstName, lastName).
 * @returns {string} Ein bereinigter Dateiname.
 */
export function buildSafeFileName(data) {
    const base = `${data.firstName || ''}_${data.lastName || ''}`.trim() || 'kontakt';
    const normalized = base
        .normalize('NFKD') // Zerlegt Umlaute (z.B. "ü" -> "u" + "¨")
        .replace(/[\u0300-\u036f]/g, '') // Entfernt die diakritischen Zeichen
        .replace(/[^a-zA-Z0-9._-]+/g, '_') // Ersetzt ungültige Zeichen durch _
        .replace(/_{2,}/g, '_') // Mehrfache __ zu _
        .replace(/^_|_$/g, ''); // Entfernt _ am Anfang/Ende
    return normalized || 'kontakt';
}


// --- Interne Helper-Funktionen ---

/**
 * Fügt ein Feld nur hinzu, wenn es einen Wert hat.
 * @param {string[]} lines - Das Array der vCard-Zeilen.
 * @param {string} key - Der vCard-Schlüssel (z.B. "NICKNAME").
 * @param {string} value - Der Wert des Feldes.
 * @param {function} [transform] - Optionale Funktion zur Wert-Transformation.
 */
function addField(lines, key, value, transform) {
    if (!value) return;
    const processed = transform ? transform(value) : value;
    if (!processed) return;
    lines.push(foldLine(`${key}:${escapeVCF(processed)}`));
}

/**
 * Fügt eine Adresse (ADR und LABEL) hinzu.
 */
function addAddress(lines, type, address) {
    const parts = [address.street, address.city, address.region, address.zip, address.country];
    if (parts.every((part) => !part)) {
        return; // Nichts zu tun, wenn alle Felder leer sind
    }
    
    // ADR-Feld: ;;,Straße,Stadt,Region,PLZ,Land
    const adrValue = [
        '', // Post office box
        '', // Extended address
        escapeVCF(address.street || ''),
        escapeVCF(address.city || ''),
        escapeVCF(address.region || ''),
        escapeVCF(address.zip || ''),
        escapeVCF(address.country || ''),
    ].join(';');
    lines.push(foldLine(`ADR;TYPE=${type}:${adrValue}`));

    // LABEL-Feld (für menschenlesbare Anzeige)
    const labelLines = [
        address.street,
        [address.zip, address.city].filter(Boolean).join(' '),
        address.country,
    ].filter(Boolean); // Entfernt leere Zeilen

    if (labelLines.length) {
        lines.push(foldLine(`LABEL;TYPE=${type}:${escapeVCF(labelLines.join('\n'))}`));
    }
}

/**
 * Fügt ein Social-Media-Profil hinzu und wandelt Usernames in URLs um.
 */
function addSocial(lines, type, value) {
    if (!value) return;

    let url = value.trim();

    // Wandle Usernames/Handles in volle URLs um, falls nötig
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
            case 'linkedin':
                // Wir nehmen 'in/' als Standard.
                url = `https://linkedin.com/in/${url}`; 
                break;
            default:
                url = `https://${type}.com/${url}`;
        }
    }
    
    lines.push(foldLine(`X-SOCIALPROFILE;TYPE=${type}:${escapeVCF(url)}`));
}

/**
 * Maskiert Sonderzeichen für vCard.
 * @param {string} text
 * @returns {string}
 */
function escapeVCF(text) {
    if (!text) {
        return '';
    }
    return text
        .replace(/\\/g, '\\\\') // Backslash
        .replace(/,/g, '\\,')  // Komma
        .replace(/;/g, '\\;')  // Semikolon
        .replace(/\r?\n/g, '\\n'); // Zeilenumbrüche
}

/**
 * Faltet lange Zeilen nach vCard-Standard (max 75 Bytes).
 * @param {string} line
 * @returns {string}
 */
function foldLine(line) {
    const maxLength = 75;
    if (line.length <= maxLength) {
        return line;
    }
    
    let result = '';
    let index = 0;

    result += line.substring(index, index + maxLength);
    index += maxLength;

    while (index < line.length) {
        result += `\r\n ` + line.substring(index, index + (maxLength - 1));
        index += (maxLength - 1);
    }

    return result;
}

/**
 * Formatiert ein Datum (YYYY-MM-DD) für vCard (YYYYMMDD).
 * @param {string} dateString
 * @returns {string}
 */
function formatDateForVCF(dateString) {
    if (!dateString) return '';
    return dateString.replace(/-/g, '');
}
