import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_PHOTO_SIZE,
  WORK_FIELDS,
  buildPreviewModel,
  buildSafeFileName,
  buildVcfPreviewState,
  computeErrors,
  computeFieldError,
  createVCFString,
  formatDateForVCF,
  shouldEnableQRCode,
  validatePhotoFile,
} from '../vcard-core.js';

test('computeFieldError validates required, email, url, phone and social handles', () => {
  const requiredField = { id: 'firstName', type: 'text', required: true, socialHandle: false };
  assert.equal(computeFieldError(requiredField, ''), 'Dieses Feld ist erforderlich.');

  const emailField = { id: 'emailWork', type: 'email', required: false, socialHandle: false };
  assert.equal(computeFieldError(emailField, 'invalid'), 'Bitte gib eine gültige E-Mail-Adresse ein.');
  assert.equal(computeFieldError(emailField, 'valid@example.com'), '');

  const urlField = { id: 'website', type: 'url', required: false, socialHandle: false };
  assert.equal(computeFieldError(urlField, 'ftp://example.com'), 'Nur http- oder https-Links sind erlaubt.');
  assert.equal(computeFieldError(urlField, 'https://example.com'), '');

  const calendarField = { id: 'calendar', type: 'url', required: false, socialHandle: false };
  assert.equal(
    computeFieldError(calendarField, 'http://calendar.example.com'),
    'Der Kalender-Link sollte per https erreichbar sein.'
  );
  assert.equal(computeFieldError(calendarField, 'https://calendar.example.com'), '');

  const phoneField = { id: 'phoneWork', type: 'tel', required: false, socialHandle: false };
  assert.equal(
    computeFieldError(phoneField, 'abc'),
    'Nur Ziffern, Leerzeichen, Klammern, +, - und / sind erlaubt.'
  );
  assert.equal(computeFieldError(phoneField, '+49 30 1234567'), '');

  const socialField = { id: 'socialInstagram', type: 'text', required: false, socialHandle: true };
  assert.equal(
    computeFieldError(socialField, 'bad handle'),
    'Bitte gib den Benutzernamen ohne Leerzeichen ein.'
  );
  assert.equal(computeFieldError(socialField, 'good_handle'), '');
});

test('computeErrors aggregates field and cross-field issues, including photo errors', () => {
  const descriptors = [
    { id: 'firstName', type: 'text', required: true, socialHandle: false },
    { id: 'lastName', type: 'text', required: true, socialHandle: false },
    { id: 'phoneWork', type: 'tel', required: false, socialHandle: false },
    { id: 'company', type: 'text', required: false, socialHandle: false },
  ];
  const data = {
    firstName: 'Max',
    lastName: 'Mustermann',
    phoneWork: '+49 40 123456',
    company: '',
  };
  const errors = computeErrors(descriptors, data, { photoError: 'Nur JPG- oder PNG-Bilder werden unterstützt.' });
  assert.equal(errors.company, 'Bitte gib dein Unternehmen an, wenn du berufliche Angaben machst.');
  assert.equal(errors.photo, 'Nur JPG- oder PNG-Bilder werden unterstützt.');

  const validData = { ...data, company: 'Beispiel GmbH' };
  const validErrors = computeErrors(descriptors, validData);
  assert.equal(Object.keys(validErrors).length, 0);
});

test('validatePhotoFile enforces type and size limits', () => {
  assert.equal(validatePhotoFile(null), '');
  assert.equal(
    validatePhotoFile({ type: 'text/plain', size: 10 }),
    'Nur JPG- oder PNG-Bilder werden unterstützt.'
  );
  assert.equal(
    validatePhotoFile({ type: 'image/png', size: MAX_PHOTO_SIZE + 1 }),
    'Das Bild ist zu groß (maximal 400 KB).'
  );
  assert.equal(validatePhotoFile({ type: 'image/jpeg', size: 1024 }), '');
});

test('buildPreviewModel collects contact, address, social and note sections', () => {
  const data = {
    prefix: 'Dr.',
    firstName: 'Max',
    middleName: 'A.',
    lastName: 'Mustermann',
    suffix: 'MBA',
    title: 'Marketing Manager',
    company: 'Beispiel GmbH',
    emailHome: 'max@example.com',
    emailWork: 'max.mustermann@firma.de',
    phoneMobile: '+49 170 1111111',
    phoneHome: '+49 30 1111111',
    phoneWork: '+49 40 1111111',
    faxHome: '+49 30 2222222',
    faxWork: '+49 40 2222222',
    website: 'https://example.com',
    calendar: 'https://calendar.example.com',
    birthday: '1985-07-01',
    adrHomeStreet: 'Privatstraße 1',
    adrHomeZip: '10115',
    adrHomeCity: 'Berlin',
    adrHomeState: 'Berlin',
    adrHomeCountry: 'Deutschland',
    adrWorkStreet: 'Arbeitsweg 5',
    adrWorkZip: '20095',
    adrWorkCity: 'Hamburg',
    adrWorkState: 'Hamburg',
    adrWorkCountry: 'Deutschland',
    socialFacebook: 'beispiel',
    socialTwitter: '@beispiel',
    socialLinkedIn: 'https://www.linkedin.com/in/beispiel',
    socialInstagram: 'insta_handle',
    socialYoutube: 'kanal',
    socialTikTok: 'tiktokuser',
    notes: 'Dies ist eine Notiz.',
  };
  const model = buildPreviewModel(data);
  assert.equal(model.name, 'Dr. Max A. Mustermann MBA');
  assert.equal(model.role, 'Marketing Manager');
  assert.equal(model.company, 'Beispiel GmbH');
  assert.equal(model.contactItems.length, 10);
  assert.equal(model.addressItems.length, 2);
  assert.equal(model.socialItems.length, 6);
  assert.equal(model.notes, 'Dies ist eine Notiz.');
  assert.equal(model.showNotes, true);
});

test('buildPreviewModel falls back to placeholder values when missing names', () => {
  const model = buildPreviewModel({ firstName: '', lastName: '' });
  assert.equal(model.name, 'Name erscheint hier');
  assert.equal(model.contactItems.length, 0);
  assert.equal(model.addressItems.length, 0);
  assert.equal(model.socialItems.length, 0);
  assert.equal(model.showNotes, false);
});

test('buildSafeFileName normalizes unicode and unsafe characters', () => {
  const name = buildSafeFileName({ firstName: 'Änne', lastName: 'Müller & Co.' });
  assert.equal(name, 'A_nne_Mu_ller_Co.');
  const fallback = buildSafeFileName({ firstName: '', lastName: '' });
  assert.equal(fallback, 'kontakt');
});

test('formatDateForVCF compacts ISO dates without altering others', () => {
  assert.equal(formatDateForVCF('1985-07-01'), '19850701');
  assert.equal(formatDateForVCF(''), '');
  assert.equal(formatDateForVCF('19850701'), '19850701');
});

test('createVCFString contains key vCard lines including folded entries', () => {
  const data = {
    prefix: 'Dr.',
    firstName: 'Max',
    middleName: 'Alexander',
    lastName: 'Mustermann',
    suffix: 'MBA',
    nickname: 'Maxi',
    birthday: '1985-07-01',
    company: 'Beispiel GmbH',
    title: 'Marketing Manager',
    website: 'https://example.com',
    calendar: 'https://calendar.example.com',
    notes: 'Mehrzeilige\nNotiz',
    emailHome: 'max@example.com',
    emailWork: 'max@firma.de',
    phoneMobile: '+49 170 9876543',
    phoneHome: '+49 30 1234567',
    phoneWork: '+49 40 1234567',
    faxHome: '+49 30 7654321',
    faxWork: '+49 40 7654321',
    adrHomeStreet: 'Privatstraße 1',
    adrHomeCity: 'Berlin',
    adrHomeState: 'Berlin',
    adrHomeZip: '10115',
    adrHomeCountry: 'Deutschland',
    adrWorkStreet: 'Arbeitsweg 5',
    adrWorkCity: 'Hamburg',
    adrWorkState: 'Hamburg',
    adrWorkZip: '20095',
    adrWorkCountry: 'Deutschland',
    socialFacebook: 'beispiel',
    socialTwitter: '@beispiel',
    socialLinkedIn: 'https://www.linkedin.com/in/beispiel',
    socialInstagram: 'insta_handle',
    socialYoutube: 'kanal',
    socialTikTok: 'tiktokuser',
    photo: { base64: 'abcd', type: 'PNG' },
  };
  const vcf = createVCFString(data);
  assert.match(vcf, /BEGIN:VCARD/);
  assert.match(vcf, /VERSION:3.0/);
  assert.match(vcf, /N:Mustermann;Max;Alexander;Dr\.;MBA/);
  assert.match(vcf, /FN:Dr\. Max Alexander Mustermann MBA/);
  assert.match(vcf, /NICKNAME:Maxi/);
  assert.match(vcf, /BDAY:19850701/);
  assert.match(vcf, /ORG:Beispiel GmbH/);
  assert.match(vcf, /TITLE:Marketing Manager/);
  assert.match(vcf, /URL:https:\/\/example\.com/);
  assert.match(vcf, /CALURI:https:\/\/calendar\.example\.com/);
  assert.match(vcf, /NOTE:Mehrzeilige\\nNotiz/);
  assert.match(vcf, /EMAIL;TYPE=WORK:max@firma\.de/);
  assert.match(vcf, /TEL;TYPE=FAX,WORK:\+49 40 7654321/);
  assert.match(vcf, /ADR;TYPE=HOME/);
  assert.match(vcf, /LABEL;TYPE=HOME/);
  assert.match(vcf, /X-SOCIALPROFILE;TYPE=linkedin/);
  assert.match(vcf, /PHOTO;ENCODING=b64;TYPE=PNG:abcd/);
  assert.match(vcf, /END:VCARD/);
});

test('buildVcfPreviewState reports placeholders and final text correctly', () => {
  const missingNames = buildVcfPreviewState({ firstName: '', lastName: '' }, {}, '');
  assert.equal(missingNames.placeholder, true);
  assert.match(missingNames.text, /Fülle mindestens/);

  const withErrors = buildVcfPreviewState({ firstName: 'Max', lastName: 'Mustermann' }, { firstName: 'Fehler' }, '');
  assert.equal(withErrors.placeholder, true);
  assert.match(withErrors.text, /Bitte korrigiere/);

  const ready = buildVcfPreviewState({ firstName: 'Max', lastName: 'Mustermann' }, {}, 'BEGIN:VCARD');
  assert.equal(ready.placeholder, false);
  assert.equal(ready.text, 'BEGIN:VCARD');
});

test('shouldEnableQRCode only allows valid datasets', () => {
  const descriptors = [
    { id: 'firstName', type: 'text', required: true, socialHandle: false },
    { id: 'lastName', type: 'text', required: true, socialHandle: false },
    { id: 'company', type: 'text', required: false, socialHandle: false },
    { id: 'phoneWork', type: 'tel', required: false, socialHandle: false },
  ];
  const data = { firstName: '', lastName: '', phoneWork: '+49 40 123456', company: 'Beispiel GmbH' };
  const errors = computeErrors(descriptors, data);
  assert.equal(shouldEnableQRCode(data, errors), false);

  const validData = {
    firstName: 'Max',
    lastName: 'Mustermann',
    phoneWork: '+49 40 123456',
    company: 'Beispiel GmbH',
  };
  const validErrors = computeErrors(descriptors, validData);
  assert.equal(shouldEnableQRCode(validData, validErrors), true);
});

test('WORK_FIELDS covers all work-related inputs', () => {
  assert.deepEqual(
    WORK_FIELDS,
    [
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
    ]
  );
});
