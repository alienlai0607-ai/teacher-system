/**
 * OKR 學期目標管理
 */

function saveOKR(params) {
  const { semester, nickname, objective_no, objective_type, objective_text,
          kr1_text, kr2_text, kr3_text } = params;
  if (!semester || !nickname || !objective_no) {
    return { ok: false, error: 'missing required fields' };
  }
  const okr_id = `OKR-${semester}-${nickname}-${objective_no}`;
  const existing = findObject(SHEET_NAMES.OKR, 'okr_id', okr_id);

  const data = {
    okr_id, semester, nickname,
    objective_no: Number(objective_no),
    objective_type: objective_type || '',
    objective_text: objective_text || '',
    kr1_text: kr1_text || '',
    kr2_text: kr2_text || '',
    kr3_text: kr3_text || '',
    kr1_progress: existing ? existing.kr1_progress : 0,
    kr2_progress: existing ? existing.kr2_progress : 0,
    kr3_progress: existing ? existing.kr3_progress : 0,
    status: 'active',
    updated_at: nowIso()
  };

  if (existing) {
    updateRow(SHEET_NAMES.OKR, existing._row, data);
  } else {
    data.created_at = nowIso();
    appendRow(SHEET_NAMES.OKR, data);
  }
  return { ok: true, okr_id };
}

function getOKR(params) {
  const { nickname, semester } = params;
  if (!nickname) return { ok: false, error: 'missing nickname' };
  let list = sheetToObjects(SHEET_NAMES.OKR);
  list = list.filter(o => o.nickname === nickname);
  if (semester) list = list.filter(o => o.semester === semester);
  return { ok: true, okrs: list };
}

function updateOKRProgress(params) {
  const { okr_id, kr1_progress, kr2_progress, kr3_progress, month, month_note } = params;
  const row = findRow(SHEET_NAMES.OKR, 'okr_id', okr_id);
  if (row < 0) return { ok: false, error: 'OKR not found' };
  const updates = { updated_at: nowIso() };
  if (kr1_progress !== undefined) updates.kr1_progress = kr1_progress;
  if (kr2_progress !== undefined) updates.kr2_progress = kr2_progress;
  if (kr3_progress !== undefined) updates.kr3_progress = kr3_progress;
  if (month && month_note !== undefined) {
    updates['month' + month] = month_note;
  }
  updateRow(SHEET_NAMES.OKR, row, updates);
  return { ok: true };
}
