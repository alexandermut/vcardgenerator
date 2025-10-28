// Wir warten, bis die Webseite komplett geladen ist
document.addEventListener('DOMContentLoaded', () => {
    
    // Wir holen uns das Formular-Element
    const vcardForm = document.getElementById('vcard-form');
    
    // Wir hängen einen "submit"-Listener an das Formular
    vcardForm.addEventListener('submit', (event) => {
        // Verhindert, dass das Formular die Seite neu lädt (Standardverhalten)
        event.preventDefault();

        // 1. Daten aus dem Formular auslesen
        const firstName = document.getElementById('firstName').value;
        const lastName = document.getElementById('lastName').value;
        const phone = document.getElementById('phone').value;
        const email = document.getElementById('email').value;
        const company = document.getElementById('company').value;
        const title = document.getElementById('title').value;

        // 2. Den VCF-String zusammenbauen
        // Das ist das Standardformat für vCards (Version 3.0)
        let vcfContent = `BEGIN:VCARD
VERSION:3.0
N:${lastName};${firstName};;;
FN:${firstName} ${lastName}
ORG:${company}
TITLE:${title}
TEL;TYPE=WORK,VOICE:${phone}
EMAIL:${email}
END:VCARD`;

        // 3. Download-Funktion aufrufen
        downloadVCF(vcfContent, `${firstName}_${lastName}.vcf`);
    });

});

/**
 * Löst den Download einer Textdatei im Browser aus.
 * @param {string} content - Der Inhalt der Datei (unser VCF-String)
 * @param {string} fileName - Der gewünschte Dateiname (z.B. "kontakt.vcf")
 */
function downloadVCF(content, fileName) {
    // Ein "Blob" ist ein Datenobjekt (Binary Large Object).
    // Wir erstellen einen Blob aus unserem Textinhalt.
    const blob = new Blob([content], { type: 'text/vcard;charset=utf-8' });

    // Wir erstellen eine temporäre URL, die auf diesen Blob im Speicher des Browsers zeigt
    const url = URL.createObjectURL(blob);

    // Wir erstellen ein unsichtbares Link-Element (<a>)
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName; // Setzt den Dateinamen für den Download

    // Wir fügen den Link zur Seite hinzu, klicken ihn automatisch an und entfernen ihn sofort wieder
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    // Wir räumen die temporäre URL wieder auf
    URL.revokeObjectURL(url);
}
