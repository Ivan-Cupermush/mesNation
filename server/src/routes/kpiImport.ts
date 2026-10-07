import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import multer from 'multer';
import { withTransaction } from '../db/pool';
import { AuthRequest, authenticate } from '../middleware/auth';
import { forbidden, badRequest } from '../lib/errors';
import { isSubordinate } from '../services/access';
import { knownGroups, saveKpiFile } from '../services/kpi/imports';
import { parseKpiFile } from '../services/kpi/kpiFile';
import { defaultRules, ruleText } from '../services/kpi/rules';
import { enrichTargets, kpiScope, matchPeople } from '../services/kpi/store';

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (/\.(xlsx|xls|xlsm|ods)$/i.test(file.originalname) || /spreadsheet|excel/i.test(file.mimetype)) cb(null, true);
    else cb(badRequest('Загрузите файл KPI в формате Excel (.xlsx или .xls)'));
  },
});

// ================= ВЕБ-СТРАНИЦА ЗАГРУЗКИ =================
const PAGE_HTML = `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Импорт KPI</title><style>
body{font-family:system-ui;background:#f3f4f6;margin:0;padding:20px}
.card{max-width:600px;margin:0 auto;background:#fff;border-radius:16px;padding:24px;box-shadow:0 2px 12px rgba(0,0,0,.08)}
h1{font-size:22px;margin:0 0 4px}p.sub{color:#6b7280;margin:0 0 20px}
label{display:block;font-weight:600;margin:14px 0 6px}
input,select{width:100%;padding:10px;border:1px solid #d1d5db;border-radius:10px;font-size:15px;box-sizing:border-box}
button{margin-top:18px;width:100%;padding:12px;background:#1F7A52;color:#fff;border:none;border-radius:10px;font-size:16px;font-weight:600;cursor:pointer}
button:disabled{opacity:.6}
#result{margin-top:18px;padding:14px;border-radius:10px;display:none}
.ok{background:#d1fae5;color:#065f46}.err{background:#fee2e2;color:#991b1b}
table{width:100%;border-collapse:collapse;font-size:13px;margin-top:10px}
td,th{border-bottom:1px solid #e5e7eb;padding:6px;text-align:left}
.hidden{display:none}
</style></head><body>
<div class="card">
<h1>Импорт KPI из Excel</h1><p class="sub">Загрузка файла KPI для сотрудника</p>
<div id="loginBox">
 <label>Логин</label><input id="login" value="admin">
 <label>Пароль</label><input id="password" type="password">
 <button id="loginBtn" type="button">Войти</button>
</div>
<div id="uploadBox" class="hidden">
 <label>Сотрудник</label><select id="employee"></select>
 <div id="hint" style="margin-top:8px;color:#6b7280;font-size:13px"></div>
 <label>Файл KPI (.xlsx)</label><input type="file" id="file" accept=".xlsx,.xls">
 <button id="btn" type="button">Загрузить и создать KPI</button>
</div>
<div id="result"></div>
</div>
<script nonce="__NONCE__">
var token='';
function esc(v){var d=document.createElement('div');d.textContent=String(v==null?'':v);return d.innerHTML;}
function doLogin(){
 fetch('/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:document.getElementById('login').value,password:document.getElementById('password').value})})
 .then(function(r){return r.json()}).then(function(d){
   if(d.token){token=d.token;document.getElementById('loginBox').classList.add('hidden');document.getElementById('uploadBox').classList.remove('hidden');loadUsers();}
   else{show('Ошибка входа: '+esc(d.error||''),false);}
 });
}
function loadUsers(){
 fetch('/api/users',{headers:{Authorization:'Bearer '+token}}).then(function(r){return r.json()}).then(function(users){
   var sel=document.getElementById('employee');sel.innerHTML='';
   users.forEach(function(u){var o=document.createElement('option');o.value=u.id;o.textContent=u.display_name||u.username;sel.appendChild(o);});
 });
}
function doUpload(){
 var f=document.getElementById('file').files[0];
 if(!f){show('Выберите файл',false);return;}
 var fd=new FormData();fd.append('file',f);fd.append('userId',document.getElementById('employee').value);fd.append('period','month');
 document.getElementById('btn').disabled=true;
 fetch('/api/kpi/import',{method:'POST',headers:{Authorization:'Bearer '+token},body:fd})
 .then(function(r){return r.json()}).then(function(d){
   document.getElementById('btn').disabled=false;
   if(d.success){
     var html='Импортировано метрик: <b>'+esc(d.imported)+'</b>'+(d.employeeName?' (в файле: '+esc(d.employeeName)+')':'');
     html+='<table><tr><th>Метрика</th><th>План</th><th>Факт</th><th>%</th><th>Бонус</th><th>К выплате</th></tr>';
     d.kpis.forEach(function(k){html+='<tr><td>'+esc(k.product_name)+'</td><td>'+esc(k.target_value)+'</td><td>'+esc(k.current_value)+'</td><td>'+esc(k.target_percent)+'</td><td>'+esc(k.bonus_amount||0)+'</td><td>'+esc(k.payment_amount||0)+'</td></tr>';});
     html+='</table>';show(html,true);
   } else {show('Ошибка: '+esc(d.error||''),false);}
 }).catch(function(e){document.getElementById('btn').disabled=false;show('Ошибка сети: '+esc(e),false);});
}
function show(html,ok){var el=document.getElementById('result');el.style.display='block';el.className=ok?'ok':'err';el.innerHTML=html;}
document.getElementById('loginBtn').addEventListener('click',doLogin);
document.getElementById('btn').addEventListener('click',doUpload);
</script></body></html>`;

// Общая политика безопасности запрещает встроенные скрипты; этой странице
// разрешён ровно один — её собственный, по одноразовому nonce.
router.get('/upload', (_req: Request, res: Response) => {
  const nonce = crypto.randomBytes(16).toString('base64');
  res.setHeader(
    'Content-Security-Policy',
    `default-src 'self'; script-src 'nonce-${nonce}'; script-src-attr 'none'; style-src 'self' 'unsafe-inline'; ` +
      `connect-src 'self'; img-src 'self' data:; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'self'`,
  );
  res.setHeader('Cache-Control', 'no-store');
  res.type('html').send(PAGE_HTML.replace('__NONCE__', nonce));
});

// ================= ИМПОРТ KPI =================

function currentMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

/**
 * POST /api/kpi/import — файл KPI сотрудника.
 * dryRun=1 — только разобрать: показатели, правила, месяц из файла и
 * подходящий сотрудник (по имени в файле, среди своих подчинённых).
 * Иначе — сохранить сотруднику userId за месяц month (ГГГГ-ММ; по умолчанию —
 * месяц из файла, а если его нет — текущий).
 */
router.post('/import', authenticate, upload.single('file'), async (req: AuthRequest, res: Response) => {
  if (!req.file) throw badRequest('Файл не загружен');
  const parsed = parseKpiFile(req.file.buffer);
  if (!parsed.metrics.length) throw badRequest('В файле не найдено ни одной метрики KPI');
  const monthParam = String(req.body.month ?? '').trim();
  if (monthParam && !/^\d{4}-(0[1-9]|1[0-2])$/.test(monthParam)) throw badRequest('Месяц в формате ГГГГ-ММ');
  const month = monthParam ? `${monthParam}-01` : parsed.month ?? currentMonth();

  if (req.body.dryRun === '1' || req.body.dryRun === 'true') {
    const scope = await kpiScope(req.userId!);
    if (!scope) throw forbidden('Загружать KPI можно только своим подчинённым');
    const match = parsed.employeeName ? (await matchPeople([parsed.employeeName], scope.all ? undefined : scope.ids)).values().next().value : null;
    const groups = await knownGroups();
    return res.json({
      success: true,
      dryRun: true,
      employeeName: parsed.employeeName,
      month: month.slice(0, 7),
      monthFromFile: parsed.month ? parsed.month.slice(0, 7) : null,
      hasResults: parsed.hasResults,
      warnings: parsed.warnings,
      suggestedUser: match?.userId ? { id: match.userId, name: match.userName } : null,
      metrics: parsed.metrics.map((m) => {
        const rules = defaultRules(m, groups);
        return { ...m, factRule: rules.fact, payoutRule: rules.payout, rule: ruleText(rules.payout, m.bonus, m.items.length) };
      }),
    });
  }

  const targetUserId = Number(req.body.userId);
  if (!Number.isInteger(targetUserId) || targetUserId <= 0) throw badRequest('Не указан сотрудник');
  // Загружать KPI можно только своим подчинённым (директор — всем).
  if (!(await isSubordinate(req.userId!, targetUserId))) throw forbidden('Загружать KPI можно только своим подчинённым');

  // Замена KPI за месяц атомарна: при ошибке старые данные остаются на месте.
  const saved = await withTransaction((db) => saveKpiFile(db, { userId: targetUserId, month, file: parsed, byUserId: req.userId! }));
  res.json({
    success: true,
    imported: saved.targets.length,
    replaced: saved.replaced,
    employeeName: parsed.employeeName,
    month: month.slice(0, 7),
    hasResults: parsed.hasResults,
    warnings: parsed.warnings,
    kpis: await enrichTargets(saved.targets),
  });
});

export default router;
