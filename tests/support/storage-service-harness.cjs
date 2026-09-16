const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const { harness } = require('../system-logic-audit.test.cjs');

// Only the external Sheets/Drive services are doubles. Routes, authorization,
// receipts, upload identity, ACL selection and record validation stay unchanged.
module.exports = function storageServiceHarness() {
  const service = harness();
  const { c } = service;
  for (const name of ['archivefiles']) {
    vm.runInContext(fs.readFileSync(path.resolve(__dirname, '../../apps-script', name + '.gs'), 'utf8'), c);
  }
  const today = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Taipei' }).format(new Date());
  c.todayStr = () => today;
  const objects = new Map();
  const files = new Map();
  const iterator = values => {
    let i = 0;
    return { hasNext: () => i < values.length, next: () => values[i++] };
  };
  const blob = (bytes, mime = 'application/octet-stream', name = '') => {
    const data = Buffer.from(bytes);
    return {
      getBytes: () => Buffer.from(data), getDataAsString: () => data.toString('utf8'),
      getContentType: () => mime, getName: () => name,
      setName(value) { name = value; return this; },
      copyBlob: () => blob(data, mime, name),
      getAs() { const error = new Error('Isolated PDF conversion unavailable; original records and photos must remain saved'); error.code = 'QA_PDF_CONVERSION_UNAVAILABLE'; throw error; },
    };
  };
  c.Utilities.newBlob = blob;
  function item(name, parent, source) {
    const id = 'qa_' + crypto.randomUUID().replaceAll('-', '');
    const viewers = new Set();
    let trashed = false;
    let sharing = 'PRIVATE';
    const owner = 'service-owner@example.invalid';
    const record = {
      getId: () => id, getName: () => name, getUrl: () => 'https://drive.google.com/file/d/' + id + '/view',
      getOwner: () => ({ getEmail: () => owner }), getViewers: () => [...viewers].map(email => ({ getEmail: () => email })),
      getEditors: () => [], addViewer: email => viewers.add(email.toLowerCase()), removeViewer: email => viewers.delete(email), removeEditor() {},
      getAccess: email => email === owner ? 'OWNER' : viewers.has(email.toLowerCase()) ? 'VIEW' : 'NONE',
      setSharing(access) { sharing = access; }, getSharingAccess: () => sharing, setShareableByEditors() {},
      isTrashed: () => trashed, setTrashed: value => { trashed = value; }, getParents: () => iterator(parent ? [parent] : []),
      setName(value) { name = value; return this; },
    };
    objects.set(id, record);
    if (source) {
      const data = source.copyBlob();
      Object.assign(record, { getBlob: () => data.copyBlob(), getThumbnail: () => null,
        getSize: () => data.getBytes().length, getMimeType: () => data.getContentType() });
      files.set(id, record);
    } else {
      const children = [];
      const ownFiles = [];
      Object.assign(record, {
        getFoldersByName: value => iterator(children.filter(child => child.getName() === value)),
        getFolders: () => iterator(children), getFiles: () => iterator(ownFiles),
        getFilesByName: value => iterator(ownFiles.filter(file => file.getName() === value)),
        createFolder(value) { const child = item(value, record); children.push(child); return child; },
        createFile(value) { const file = item(value.getName(), record, value); ownFiles.push(file); return file; },
      });
    }
    return record;
  }
  const roots = [];
  c.DriveApp = {
    Access: { PRIVATE: 'PRIVATE' }, Permission: { VIEW: 'VIEW', EDIT: 'EDIT', OWNER: 'OWNER' },
    getFoldersByName: name => iterator(roots.filter(folder => folder.getName() === name)),
    createFolder(name) { const folder = item(name); roots.push(folder); return folder; },
    getFolderById: id => { if (!objects.has(id)) throw new Error('Folder not found'); return objects.get(id); },
    getFileById: id => { if (!files.has(id)) throw new Error('File not found'); return files.get(id); },
  };
  service.sheet('CoursePreps', ['prep_id', 'nickname', 'course_name', 'course_type', 'materials', 'created_at', 'updated_at']);
  c.ensureHeaders(c.SpreadsheetApp.getActiveSpreadsheet().getSheetByName('DailyLogs'), [
    'department', 'role', 'kpi1_data', 'kpi2_data', 'kpi3_data', 'kpi4_data', 'kpi5_data', 'kpi6_data',
    'submitted_at', 'locked', 'is_makeup', 'help_needed', 'help_content', 'checkin_at', 'checkout_at',
  ]);
  c.ensureHeaders(c.SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Evidence'), [
    'evidence_id', 'log_id', 'date', 'kpi', 'type', 'file_id', 'file_name', 'description', 'created_at',
  ]);
  return { ...service, files, today, dispatch: payload => c.handleRequest({ postData: { contents: JSON.stringify(payload) } }, 'POST') };
};
