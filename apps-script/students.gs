/**
 * 學生名冊（後台統一建，每位老師自己的班）
 * Students schema: student_id, name, teacher, department, status, notes, created_at, updated_at
 */

function listStudents(params) {
  const { teacher, department, includeInactive } = params || {};
  let list = sheetToObjects(SHEET_NAMES.STUDENTS);
  if (teacher) list = list.filter(s => s.teacher === teacher);
  if (department) list = list.filter(s => sameDepartment_(s.department, department));
  if (!includeInactive) list = list.filter(s => s.status !== 'inactive');
  list.sort((a, b) => String(a.name).localeCompare(String(b.name), 'zh-Hant'));
  return { ok: true, students: list };
}

function addStudent(params) {
  return withRecordWriteLock_(function () { return addStudentLocked_(params); });
}

function addStudentLocked_(params) {
  const name = String(params.name || '').trim();
  const teacher = String(params.teacher || '').trim();
  if (!name || !teacher) return { ok: false, error: '缺少姓名或老師' };
  const t = findUserByNickname(teacher);
  if (!t || t.status !== 'active') return { ok: false, error: '老師不存在或未啟用：' + teacher };
  // 同老師班內姓名重複檢查
  const dup = sheetToObjects(SHEET_NAMES.STUDENTS)
    .some(s => s.teacher === teacher && String(s.name || '').trim() === name && s.status !== 'inactive');
  if (dup) return { ok: false, error: '此老師班上已有同名學生' };

  appendRow(SHEET_NAMES.STUDENTS, {
    student_id: Utilities.getUuid(),
    name: String(name).trim(),
    teacher,
    department: normalizeDepartment_(t.department),
    status: 'active',
    notes: params.notes || '',
    created_at: nowIso(),
    updated_at: nowIso()
  });
  logSystem(params.operator || 'system', 'add_student', name, { teacher });
  return { ok: true, msg: '新增成功' };
}

function updateStudent(params) {
  return withRecordWriteLock_(function () { return updateStudentLocked_(params); });
}

function updateStudentLocked_(params) {
  const { student_id } = params;
  if (!student_id) return { ok: false, error: '缺少 student_id' };
  const existing = findObject(SHEET_NAMES.STUDENTS, 'student_id', student_id);
  if (!existing) return { ok: false, error: '學生不存在' };

  const updates = {};
  ['name', 'teacher', 'status', 'notes'].forEach(k => {
    if (params[k] !== undefined) updates[k] = params[k];
  });
  const name = String(updates.name === undefined ? existing.name : updates.name).trim();
  const teacher = String(updates.teacher === undefined ? existing.teacher : updates.teacher).trim();
  const status = updates.status === undefined ? existing.status : updates.status;
  if (!name || !teacher) return { ok: false, error: '缺少姓名或老師' };
  if (['active', 'inactive'].indexOf(status) < 0) return { ok: false, error: '學生狀態不正確' };
  const t = findUserByNickname(teacher);
  if (!t || (params.teacher !== undefined && t.status !== 'active')) return { ok: false, error: '老師不存在或未啟用' };
  if (status !== 'inactive' && sheetToObjects(SHEET_NAMES.STUDENTS).some(s => s.student_id !== student_id && s.teacher === teacher && String(s.name || '').trim() === name && s.status !== 'inactive')) return { ok: false, error: '此老師班上已有同名學生' };
  Object.assign(updates, { name: name, teacher: teacher, department: normalizeDepartment_(t.department) });
  updates.updated_at = nowIso();
  updateRow(SHEET_NAMES.STUDENTS, existing._row, updates);
  logSystem(params.operator || 'system', 'update_student', student_id, updates);
  return { ok: true, msg: '更新成功' };
}

function deleteStudent(params) {
  return withRecordWriteLock_(function () { return deleteStudentLocked_(params); });
}

function deleteStudentLocked_(params) {
  const { student_id } = params;
  if (!student_id) return { ok: false, error: '缺少 student_id' };
  const rowNum = findRow(SHEET_NAMES.STUDENTS, 'student_id', student_id);
  if (rowNum < 0) return { ok: false, error: '學生不存在' };
  deleteRow(SHEET_NAMES.STUDENTS, rowNum);
  logSystem(params.operator || 'system', 'delete_student', student_id, {});
  return { ok: true, msg: '已刪除' };
}
