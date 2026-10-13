import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 3000);
const key = process.env.OPENAI_API_KEY;
const model = process.env.OPENAI_MODEL || 'gpt-4.1-mini';
const types = {'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.svg':'image/svg+xml'};
const json = (res, status, obj) => { res.writeHead(status, {'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(obj)); };
async function ai(req,res){
 if(!key) return json(res,503,{error:'AI API ещё не подключён. Доступен демонстрационный режим.'});
 let body='';for await(const chunk of req){body+=chunk;if(body.length>80000)return json(res,413,{error:'Слишком длинный запрос'});}
 let data;try{data=JSON.parse(body)}catch{return json(res,400,{error:'Некорректный JSON'})}
 const {kind,transcript,scenario,messages}=data;
 let system,user;
 if(kind==='analysis'){
  if(typeof transcript!=='string'||transcript.trim().length<30||transcript.length>25000)return json(res,400,{error:'Текст должен содержать от 30 до 25 000 символов'});
  system=`Ты учебный супервизор психологического консультирования. Отвечай на русском языке. Не ставь диагнозы, не делай необоснованных утверждений о чувствах клиента. Разделяй наблюдение, интерпретацию и рекомендацию. Возвращай ТОЛЬКО JSON объект с полями summary (string), strengths (array of strings с точными цитатами), improvements (array of objects {quote,issue,alternative,reason}), scores (array of objects {name,score,reason} где score число 1..5 или null для недостатка данных), exercises (array of strings), limitations (string). Критерии: Контакт и эмпатия, Активное слушание, Качество вопросов, Понимание запроса, Отражение эмоций, Профессиональные границы и этика. Опирайся только на текст.`;
  user=`Проанализируй обезличенный УЧЕБНЫЙ диалог:\n${transcript}`;
 } else if(kind==='chat') {
  if(!Array.isArray(messages)||messages.length>35||!messages.every(x=>['user','assistant'].includes(x.role)&&typeof x.content==='string'&&x.content.length<4000))return json(res,400,{error:'Некорректная история диалога'});
  system=`Ты виртуальный клиент учебного психологического тренажёра. Роль: ${String(scenario||'тревога перед экзаменом').slice(0,300)}. Общайся на русском от первого лица, как живой клиент: 1-3 коротких предложения. Реагируй на слова психолога, не оценивай его и не давай советы по ведению терапии. Без постановки диагнозов. При угрозе немедленной опасности не симулируй опасное поведение, предложи привлечь живого специалиста.`;
  user=null;
 } else if(kind==='feedback') {
  if(!Array.isArray(messages)||messages.length>35)return json(res,400,{error:'Нет истории тренировки'});
  system='Ты учебный супервизор. На русском, кратко и конструктивно оцени навыки психолога в учебном диалоге. Дай 2 сильные стороны, 2 возможные зоны роста с примерами и одно практическое упражнение. Не ставь диагнозы. Указывай ограничения оценки.';
  user=`Сценарий: ${String(scenario||'').slice(0,300)}\nДиалог:\n${messages.map(m=>`${m.role==='user'?'Психолог':'Клиент'}: ${String(m.content).slice(0,3000)}`).join('\n')}`;
 } else return json(res,400,{error:'Неизвестная операция'});
 try{
  const content=kind==='chat'?[{role:'system',content:system},...messages]:[{role:'system',content:system},{role:'user',content:user}];
  const response=await fetch('https://api.openai.com/v1/chat/completions',{method:'POST',headers:{'Content-Type':'application/json','Authorization':`Bearer ${key}`},body:JSON.stringify({model,messages:content,temperature:0.5,...(kind==='analysis'?{response_format:{type:'json_object'}}:{})}),signal:AbortSignal.timeout(45000)});
  const result=await response.json();if(!response.ok) return json(res,502,{error:result.error?.message||'Ошибка AI API'});
  const answer=result.choices?.[0]?.message?.content||'';
  if(kind==='analysis'){try{return json(res,200,{result:JSON.parse(answer)})}catch{return json(res,502,{error:'Некорректный формат AI-анализа'})}}
  json(res,200,{result:answer});
 }catch(e){json(res,502,{error:'Сервис ИИ временно недоступен: '+e.message})}
}
const server=http.createServer(async(req,res)=>{
 const url=new URL(req.url,'http://localhost');
 if(url.pathname==='/api/status')return json(res,200,{aiEnabled:!!key});
 if(url.pathname==='/api/ai'&&req.method==='POST')return ai(req,res);
 if(req.method!=='GET')return json(res,405,{error:'Method not allowed'});
 const files={'/':'index.html','/index.html':'index.html','/style.css':'style.css','/app.js':'app.js'};
 const file=files[url.pathname];if(!file)return json(res,404,{error:'Not found'});
 try{const bytes=await fs.readFile(path.join(root,file));res.writeHead(200,{'Content-Type':types[path.extname(file)],'Cache-Control':'no-cache','X-Content-Type-Options':'nosniff'});res.end(bytes)}catch{json(res,500,{error:'Ошибка сервера'})}
});server.listen(PORT,'0.0.0.0',()=>console.log(`PsyPractice: http://localhost:${PORT} • AI: ${key?'enabled':'demo'}`));
