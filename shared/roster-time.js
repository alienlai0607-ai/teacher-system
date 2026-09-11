(function (root) {
  'use strict';
  function normalize(value) {
    const text = String(value ?? '').trim();
    // Older server responses serialized spreadsheet time cells with Date.toString().
    const clock = text.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/)
      || text.match(/^[A-Za-z]{3} [A-Za-z]{3} \d{2} \d{4} (\d{2}):(\d{2}):\d{2} GMT[+-]\d{4}(?: \(.*\))?$/);
    if (clock && Number(clock[1]) < 24 && Number(clock[2]) < 60) return clock[1].padStart(2, '0') + ':' + clock[2];
    return '';
  }
  function item(value) {
    return { ...value, start: normalize(value.start), end: normalize(value.end) };
  }
  const api = { normalize, item };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.RosterTime = api;
})(typeof window === 'object' ? window : globalThis);
