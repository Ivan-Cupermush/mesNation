import { Router, Request, Response } from 'express';
import multer from 'multer';
import * as XLSX from 'xlsx';
import pool from '../db/pool';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

// ================= ХЕЛПЕРЫ ПАРСЕРА =================
function num(v: any): number {
  if (typeof v === 'number') return isFinite(v) ? v : 0;
  if (typeof v === 'string') {
    let s = v.trim();
    if (!s) return 0;
    if (/^да$/i.test(s)) return 1;
    if (/^нет$/i.test(s)) return 0;
    if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(s)) s = s.replace(/,/g, '');
    s = s.replace(/%/g, '').replace(/\s/g, '').replace(',', '.');
    const n = parseFloat(s);
    return isFinite(n) ? n : 0;
  }
  return 0;
}

function rowType(b: string): string | null {
  const s = (b || '').toLowerCase();
  if (!s) return null;
  if (s.includes('план')) return 'plan';
  if (s.includes('факт')) return 'fact';
  if (s.includes('бонус')) return 'bonus';
  if (s.includes('выплат')) return 'payment';
  if (s.includes('%') || s.includes('выполн')) return 'percent';
  return null;
}

const CYCLE = ['plan', 'fact', 'percent', 'bonus', 'payment'];
function expectedNext(last: string | null): string {
  if (!last) return 'plan';
  const i = CYCLE.indexOf(last);
  if (i === -1 || i === CYCLE.length - 1) return 'plan';
  return CYCLE[i + 1];
}

interface Metric {
  name: string; plan: number; fact: number; percent: number;
  bonus: number; payment: number; lastType: string | null;
  fixed: boolean; subItems: string[];
}

function parseWorkbook(buffer: Buffer): { employeeName: string; metrics: Metric[] } {
  const wb = XLSX.read(buffer, { type: 'buffer' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

  let employeeName = '';
  const metrics: Metric[] = [];
  let current: Metric | null = null;

  for (const row of rows) {
    if (!row) continue;
    const a = String(row[0] ?? '').trim();
    const b = String(row[1] ?? '').trim();
    const c = row[2];
    const d = row[3];
    const low = (a + ' ' + b).toLowerCase();
    if (low.includes('итого')) continue;

    const t = rowType(b);
    const cv = num(c), dv = num(d);

    // Имя сотрудника — первая строка с текстом без чисел
    if (!employeeName && a && !b && !t && cv === 0 && dv === 0 && !/\d/.test(a)) {
      employeeName = a;
      continue;
    }

    // Пустые/служебные строки без значений
    if (a && !b && !t && cv === 0 && dv === 0) continue;
    if (!a && !t) continue;

    // Фиксированные выплаты (Оклад, ГСМ)
    if (a && !b && !t && (cv > 0 || dv > 0)) {
      current = { name: a, plan: cv, fact: dv, percent: 100, bonus: 0, payment: dv, lastType: null, fixed: true, subItems: [] };
      metrics.push(current);
      continue;
    }

    if (!t) continue;

    // Строка с типом (план/факт/%/бонус/к выплате)
    let same = false;
    if (current) {
      if (!a || a === current.name) same = true;
      else if (t !== 'plan' && !current.fixed && expectedNext(current.lastType) === t) same = true;
    }

    if (!same) {
      current = { name: a || ('KPI ' + (metrics.length + 1)), plan: 0, fact: 0, percent: 100, bonus: 0, payment: 0, lastType: null, fixed: false, subItems: [] };
      metrics.push(current);
    }

    if (current && a && a !== current.name) current.subItems.push(a);

    if (current) {
      if (t === 'plan') current.plan = cv || dv;
      else if (t === 'fact') { current.fact = dv || cv; if (!current.plan && cv) current.plan = cv; }
      else if (t === 'percent') { let p = dv || cv; if (p > 0 && p <= 1) p *= 100; current.percent = p; }
      else if (t === 'bonus') current.bonus = dv || cv;
      else if (t === 'payment') current.payment = dv || cv;
      current.lastType = t;
    }
  }

  return { employeeName, metrics };
}

function metricTypeOf(m: Metric): string {
  const n = m.name.toLowerCase();
  if (m.plan === 1 && m.fact <= 1) return 'boolean';
  if (n.includes('руб')) return 'amount';
  if (n.includes('тт')) return 'quantity';
  return 'amount';
}

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
 <button onclick="doLogin()">Войти</button>
</div>
<div id="uploadBox" class="hidden">
 <label>Сотрудник</label><select id="employee"></select>
 <div id="hint" style="margin-top:8px;color:#6b7280;font-size:13px"></div>
 <label>Файл KPI (.xlsx)</label><input type="file" id="file" accept=".xlsx,.xls">
 <button id="btn" onclick="doUpload()">Загрузить и создать KPI</button>
</div>
<div id="result"></div>
</div>
<script>
var token='';
function doLogin(){
 fetch('/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:document.getElementById('login').value,password:document.getElementById('password').value})})
 .then(function(r){return r.json()}).then(function(d){
   if(d.token){token=d.token;document.getElementById('loginBox').classList.add('hidden');document.getElementById('uploadBox').classList.remove('hidden');loadUsers();}
   else{show('Ошибка входа: '+(d.error||''),false);}
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
     var html='Импортировано метрик: <b>'+d.imported+'</b>'+(d.employeeName?' (в файле: '+d.employeeName+')':'');
     html+='<table><tr><th>Метрика</th><th>План</th><th>Факт</th><th>%</th><th>Бонус</th><th>К выплате</th></tr>';
     d.kpis.forEach(function(k){html+='<tr><td>'+k.product_name+'</td><td>'+k.target_value+'</td><td>'+k.current_value+'</td><td>'+k.target_percent+'</td><td>'+(k.bonus_amount||0)+'</td><td>'+(k.payment_amount||0)+'</td></tr>';});
     html+='</table>';show(html,true);
   } else {show('Ошибка: '+(d.error||'')+' '+(d.details||''),false);}
 }).catch(function(e){document.getElementById('btn').disabled=false;show('Ошибка сети: '+e,false);});
}
function show(html,ok){var el=document.getElementById('result');el.style.display='block';el.className=ok?'ok':'err';el.innerHTML=html;}
</script></body></html>`;

router.get('/upload', (req: Request, res: Response) => {
  res.send(PAGE_HTML);
});

// ================= ИМПОРТ KPI =================
router.post('/import', upload.single('file'), async (req: any, res: Response) => {
  try {
    const targetUserId = parseInt(req.body.userId);
    if (!targetUserId) return res.status(400).json({ error: 'Не указан сотрудник' });
    if (!req.file) return res.status(400).json({ error: 'Файл не загружен' });

    // Гарантируем наличие колонок
    await pool.query(`ALTER TABLE sales_targets ADD COLUMN IF NOT EXISTS bonus_amount NUMERIC DEFAULT 0`);
    await pool.query(`ALTER TABLE sales_targets ADD COLUMN IF NOT EXISTS payment_amount NUMERIC DEFAULT 0`);
    await pool.query(`ALTER TABLE sales_targets ADD COLUMN IF NOT EXISTS target_percent NUMERIC DEFAULT 100`);
    await pool.query(`ALTER TABLE sales_targets ADD COLUMN IF NOT EXISTS description TEXT DEFAULT ''`);

    const { employeeName, metrics } = parseWorkbook(req.file.buffer);
    console.log(`📊 KPI import: employee="${employeeName}", metrics=${metrics.length}`);

    const now = new Date();
    const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);

    // Удаляем старые KPI за этот период
    await pool.query(
      `DELETE FROM sales_targets WHERE user_id = $1 AND period_start >= $2 AND period_end <= $3`,
      [targetUserId, periodStart, periodEnd]
    );

    const saved: any[] = [];
    for (const m of metrics) {
      const r = await pool.query(
        `INSERT INTO sales_targets
         (user_id, product_name, metric_type, target_value, current_value,
          period_start, period_end, bonus_amount, payment_amount, target_percent, description)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
        [targetUserId, m.name, metricTypeOf(m), m.plan, m.fact,
         periodStart, periodEnd, m.bonus, m.payment, m.percent, m.subItems.join('; ')]
      );
      saved.push(r.rows[0]);
    }

    res.json({ success: true, imported: saved.length, employeeName, kpis: saved });
  } catch (error) {
    console.error('❌ KPI import error:', error);
    res.status(500).json({ error: 'Ошибка импорта', details: error instanceof Error ? error.message : 'unknown' });
  }
});

export default router;
