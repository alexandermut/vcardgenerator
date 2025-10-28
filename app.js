document.addEventListener('DOMContentLoaded', () => {
    
    const vcardForm = document.getElementById('vcard-form');
    
    // Wir machen die Event-Listener-Funktion "async", 
    // damit wir auf das Einlesen des Bildes warten können ("await").
    vcardForm.addEventListener('submit', async (event) => {
        // Verhindert das Neuladen der Seite
        event.preventDefault();

        // 1. Alle Daten aus dem Formular auslesen
        const data = {
            prefix: document.getElementById('prefix').value,
            firstName: document.getElementById('firstName').value,
            middleName: document.getElementById('middleName').value,
            lastName: document.getElementById('lastName').value,
            suffix: document.getElementById('suffix').value,
            nickname: document.getElementById('nickname').value,
            
            company: document.getElementById('company').value,
            title: document.getElementById('title').value,
            website: document.getElementById('website').value,
            calendar: document.getElementById('calendar').value,
            
            emailHome: document.getElementById('emailHome').value,
            emailWork: document.getElementById('emailWork').value,
            
            phoneMobile: document.getElementById('phoneMobile').value,
            phoneHome: document.getElementById('phoneHome').value,
            phoneWork: document.getElementById('phoneWork').value,
            faxHome: document.getElementById('faxHome').value,
            faxWork: document.getElementById('faxWork').value,
            
            adrHomeStreet: document.getElementById('adrHomeStreet').value,
            adrHomeCity: document.getElementById('adrHomeCity').value,
            adrHomeState: document.getElementById('adrHomeState').value,
            adrHomeZip: document.getElementById('adrHomeZip').value,
            adrHomeCountry: document.getElementById('adrHomeCountry').value,
            
            adrWorkStreet: document.getElementById('adrWorkStreet').value,
            adrWorkCity: document.getElementById('adrWorkCity').value,
            adrWorkState: document.getElementById('adrWorkState').value,
            adrWorkZip: document.getElementById('adrWorkZip').value,
            adrWorkCountry: document.getElementById('adrWorkCountry').value,
            
            photoFile: document.getElementById('photo').files[0], // Das Datei-Objekt
            
            socialFacebook: document.getElementById('socialFacebook').value,
            socialTwitter: document.getElementById('socialTwitter').value,
            socialLinkedIn: document.getElementById('socialLinkedIn').value,
            socialInstagram: document.getElementById('socialInstagram').value,
            socialYoutube: document.getElementById('socialYoutube').value,
            socialTikTok: document.getElementById('socialTikTok').value,
            
            notes: document.getElementById('notes').value,
        };

        try {
            // 2. Den VCF-String mit den Daten generieren (wartet auf Foto)
            const vcfContent = await createVCFString(data);
            
            // 3. Download-Funktion aufrufen
            const fileName = `${data.firstName}_${data.lastName}.vcf`.replace(/ /g, '_');
            downloadVCF(vcfContent, fileName);

        } catch (error) {
            console.error("Fehler beim Erstellen der vCard:", error);
            alert("Fehler beim Verarbeiten des Bildes. Bitte versuche es erneut oder lasse das Bild weg.");
        }
    });
});


/**
 * Hauptfunktion, die den VCF 3.0 String zusammenbaut.
 * @param {object} data - Das Objekt mit allen Formulardaten
 * @returns {Promise<string>} - Der fertige VCF-String
 */
async function createVCFString(data) {
    let vcfLines = [];

    vcfLines.push("BEGIN:VCARD");
    vcfLines.push("VERSION:3.0");

    // N (Name) - ; getrennt: Nachname;Vorname;Zweitname;Prefix;Suffix
    const n = `${data.lastName};${data.firstName};${data.middleName};${data.prefix};${data.suffix}`;
    vcfLines.push(`N:${n}`);
    
    // FN (Formatted Name)
    vcfLines.push(`FN:${data.firstName} ${data.lastName}`);
    
    // Optionale Felder hinzufügen
    addField(vcfLines, "NICKNAME", data.nickname);
    addField(vcfLines, "ORG", data.company);
    addField(vcfLines, "TITLE", data.title);
    addField(vcfLines, "URL", data.website);
    addField(vcfLines, "CALURI", data.calendar);
    addField(vcfLines, "NOTE", escapeVCF(data.notes));

    // Emails
    addField(vcfLines, "EMAIL;TYPE=HOME", data.emailHome);
    addField(vcfLines, "EMAIL;TYPE=WORK", data.emailWork);

    // Telefone
    addField(vcfLines, "TEL;TYPE=CELL", data.phoneMobile);
    addField(vcfLines, "TEL;TYPE=HOME", data.phoneHome);
    addField(vcfLines, "TEL;TYPE=WORK", data.phoneWork);
    addField(vcfLines, "TEL;TYPE=FAX,HOME", data.faxHome);
    addField(vcfLines, "TEL;TYPE=FAX,WORK", data.faxWork);

    // Adressen: ADR;TYPE=HOME:;;Straße;Stadt;Bundesland;PLZ;Land
    const adrHome = `;;${data.adrHomeStreet};${data.adrHomeCity};${data.adrHomeState};${data.adrHomeZip};${data.adrHomeCountry}`;
    if (adrHome.replace(/;/g, '').length > 0) {
        vcfLines.push(`ADR;TYPE=HOME:${adrHome}`);
    }
    
    const adrWork = `;;${data.adrWorkStreet};${data.adrWorkCity};${data.adrWorkState};${data.adrWorkZip};${data.adrWorkCountry}`;
    if (adrWork.replace(/;/g, '').length > 0) {
        vcfLines.push(`ADR;TYPE=WORK:${adrWork}`);
    }

    // Social Media (X-SOCIALPROFILE ist ein gängiger Standard)
    addSocial(vcfLines, "facebook", data.socialFacebook);
    addSocial(vcfLines, "twitter", data.socialTwitter);
    addSocial(vcfLines, "linkedin", data.socialLinkedIn);
    addSocial(vcfLines, "instagram", data.socialInstagram);
    addSocial(vcfLines, "youtube", data.socialYoutube);
    addSocial(vcfLines, "tiktok", data.socialTikTok);

    // --- FOTO VERARBEITUNG ---
    if (data.photoFile) {
        try {
            const photoData = await readPhoto(data.photoFile);
            if (photoData) {
                // Zeile muss gefaltet werden, da Base64 sehr lang ist
                const photoLine = `PHOTO;ENCODING=b64;TYPE=${photoData.type}:${photoData.base64}`;
                vcfLines.push(foldLine(photoLine));
            }
        } catch (error) {
            // Wirft den Fehler, der oben im "submit" handler gefangen wird
            throw new Error(`Bild konnte nicht gelesen werden: ${error.message}`);
        }
    }

    vcfLines.push("END:VCARD");
    
    // Alle Zeilen mit (Windows/Standard) Zeilenumbruch verbinden
    return vcfLines.join("\r\n");
}

/**
 * Liest eine Bilddatei ein und gibt sie als Base64-String zurück.
 * @param {File} file - Die Bilddatei aus dem Input
 * @returns {Promise<object|null>} - Objekt mit { base64, type }
 */
function readPhoto(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        
        reader.onload = (event) => {
            const dataUrl = event.target.result; // z.B. "data:image/jpeg;base64,ABC..."
            
            // Prefix (z.B. "data:image/jpeg;base64,") entfernen
            const base64String = dataUrl.split(',')[1];
            
            // Bildtyp (z.B. "jpeg") extrahieren
            const type = dataUrl.substring(dataUrl.indexOf(':') + 1, dataUrl.indexOf(';')).split('/')[1].toUpperCase();
            
            resolve({ base64: base64String, type: type });
        };
        
        reader.onerror = (error) => {
            reject(error);
        };
        
        // Beginnt das asynchrone Einlesen der Datei
        reader.readAsDataURL(file);
    });
}


// --- HILFSFUNKTIONEN ---

/**
 * Fügt eine Zeile nur hinzu, wenn der Wert existiert.
 * @param {string[]} lines - Das Array der VCF-Zeilen
 * @param {string} key - Der VCF-Schlüssel (z.B. "ORG")
 * @param {string} value - Der Wert aus dem Formular
 */
function addField(lines, key, value) {
    if (value) {
        lines.push(`${key}:${value}`);
    }
}

/**
 * Fügt Social-Media-Profile hinzu.
 * @param {string[]} lines - Das Array der VCF-Zeilen
 * @param {string} type - Der Typ (z.B. "facebook")
 * @param {string} value - Der Wert (Username oder URL)
 */
function addSocial(lines, type, value) {
    if (value) {
        // vCard 4.0 Standard (von iOS/Google unterstützt)
        if (value.startsWith('http')) {
             lines.push(`X-SOCIALPROFILE;TYPE=${type}:${value}`);
        } else {
            // Bessere Kompatibilität, wenn es keine volle URL ist
            let url;
            switch(type) {
                case 'twitter': url = `https://x.com/${value.replace('@', '')}`; break;
                case 'instagram': url = `https://instagram.com/${value}`; break;
                case 'tiktok': url = `https://tiktok.com/@${value.replace('@', '')}`; break;
                case 'facebook': url = `https://facebook.com/${value}`; break;
                default: url = `https://${type}.com/${value}`;
            }
             lines.push(`X-SOCIALPROFILE;TYPE=${type}:${url}`);
        }
    }
}

/**
 * Escaped Sonderzeichen für VCF.
 * \ -> \\
 * , -> \,
 * ; -> \;
 * \n -> \N (als Text-Newline)
 * @param {string} text
 */
function escapeVCF(text) {
    if (!text) return "";
    return text.replace(/\\/g, '\\\\')
               .replace(/,/g, '\\,')
               .replace(/;/g, '\\;')
               .replace(/\n/g, '\\n');
}

/**
 * Faltet VCF-Zeilen nach 75 Zeichen (wichtig für Base64-Fotos).
 * @param {string} line - Die lange Zeile
 * @returns {string} - Die gefaltete Zeile (mit \r\n )
 */
function foldLine(line) {
    const maxLineLength = 75;
    let result = '';
    let i = 0;
    while (i < line.length) {
        if (i === 0) {
            result += line.substring(i, i + maxLineLength);
            i += maxLineLength;
        } else {
            // Jede folgende Zeile wird mit einem Leerzeichen eingerückt
            result += "\r\n " + line.substring(i, i + maxLineLength - 1);
            i += maxLineLength - 1;
        }
    }
    return result;
}

/**
 * Löst den Download einer Textdatei im Browser aus.
 * (Unverändert von der V1)
 * @param {string} content - Der Inhalt der Datei (unser VCF-String)
 * @param {string} fileName - Der gewünschte Dateiname (z.B. "kontakt.vcf")
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
