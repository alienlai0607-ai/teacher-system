/**
 * 學生名冊（後台統一建，每位老師自己的班）
 * Students schema: student_id, name, teacher, department, status, notes, created_at, updated_at
 */

function listStudents(params) {
  const { teacher, department, includeInactive } = params || {};
  let list = sheetToObjects(SHEET_NAMES.STUDENTS);
  if (teacher) list = list.filter(s => s.teacher === teacher);
  if (department) list = list.filter(s => s.department === department);
  if (!includeInactive) list = list.filter(s => s.status !== 'inactive');
  list.sort((a, b) => String(a.name).localeCompare(String(b.name), 'zh-Hant'));
  return { ok: true, students: list };
}

function addStudent(params) {
  const { name, teacher } = params;
  if (!name || !teacher) return { ok: false, error: '缺少姓名或老師' };
  const t = findUserByNickname(teacher);
  if (!t) return { ok: false, error: '老師不存在：' + teacher };
  // 同老師班內姓名重複檢查
  const dup = sheetToObjects(SHEET_NAMES.STUDENTS)
    .some(s => s.teacher === teacher && s.name === name && s.status !== 'inactive');
  if (dup) return { ok: false, error: '此老師班上已有同名學生' };

  appendRow(SHEET_NAMES.STUDENTS, {
    student_id: Utilities.getUuid(),
    name: String(name).trim(),
    teacher,
    department: t.department,
    status: 'active',
    notes: params.notes || '',
    created_at: nowIso(),
    updated_at: nowIso()
  });
  logSystem(params.operator || 'system', 'add_student', name, { teacher });
  return { ok: true, msg: '新增成功' };
}

function updateStudent(params) {
  const { student_id } = params;
  if (!student_id) return { ok: false, error: '缺少 student_id' };
  const rowNum = findRow(SHEET_NAMES.STUDENTS, 'student_id', student_id);
  if (rowNum < 0) return { ok: false, error: '學生不存在' };

  const updates = {};
  ['name', 'teacher', 'department', 'status', 'notes'].forEach(k => {
    if (params[k] !== undefined) updates[k] = params[k];
  });
  // 換老師時連帶更新所屬部門
  if (params.teacher) {
    const t = findUserByNickname(params.teacher);
    if (t) updates.department = t.department;
  }
  updates.updated_at = nowIso();
  updateRow(SHEET_NAMES.STUDENTS, rowNum, updates);
  logSystem(params.operator || 'system', 'update_student', student_id, updates);
  return { ok: true, msg: '更新成功' };
}

function deleteStudent(params) {
  const { student_id } = params;
  if (!student_id) return { ok: false, error: '缺少 student_id' };
  const rowNum = findRow(SHEET_NAMES.STUDENTS, 'student_id', student_id);
  if (rowNum < 0) return { ok: false, error: '學生不存在' };
  deleteRow(SHEET_NAMES.STUDENTS, rowNum);
  logSystem(params.operator || 'system', 'delete_student', student_id, {});
  return { ok: true, msg: '已刪除' };
}
