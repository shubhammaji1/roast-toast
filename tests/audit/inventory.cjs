const fs = require('fs');
const { chromium, firefox, webkit } = require('playwright');
const AxeBuilder = require('@axe-core/playwright').default;
const TARGET_URL = process.env.AUDIT_URL || 'https://roast-and-toast-ebon.vercel.app';
const out = '.data/audit-2026-11-16'; fs.mkdirSync(out,{recursive:true});
const routes=['/','/feed','/explore','/building','/new','/saved','/community','/about','/privacy','/terms','/notifications','/profile','/my-ideas','/creator-support','/coffee-history','/reset-password','/admin'];
const sizes=[[280,653],[320,568],[344,760],[360,800],[375,667],[390,844],[393,852],[412,915],[430,932],[480,800],[600,960],[744,1133],[768,1024],[820,1180],[834,1194],[1024,768],[1180,820],[1280,720],[1366,768],[1440,900],[1536,864],[1600,900],[1728,1117],[1920,1080],[2560,1440],[3440,1440]];
const result={target:TARGET_URL,date:new Date().toISOString(),routes:[],responsive:[],browsers:[],blockedWrites:[]};
const save=()=>fs.writeFileSync(out+'/live.json',JSON.stringify(result,null,2));
(async()=>{
const b=await chromium.launch({headless:false}); result.version=b.version();
const context=await b.newContext({viewport:{width:1440,height:900},reducedMotion:'reduce'});
// Prevent content mutations. Anonymous session initialization is the application's normal browsing prerequisite.
await context.route('**/api/**',async r=>{const req=r.request();if(!['GET','HEAD','OPTIONS'].includes(req.method())&&!new URL(req.url()).pathname.endsWith('/session')){result.blockedWrites.push({method:req.method(),url:req.url()});return r.abort('blockedbyclient');}return r.continue();});
await context.tracing.start({screenshots:true,snapshots:true});
const p=await context.newPage(); let current;
p.on('pageerror',e=>current?.errors.push(e.message));
p.on('response',r=>{if(r.status()>=400)current?.httpErrors.push({url:r.url(),status:r.status()});});
for(const path of routes){
 current={path,errors:[],httpErrors:[]};result.routes.push(current);
 try{const response=await p.goto(TARGET_URL+path,{waitUntil:'networkidle',timeout:45000});current.status=response.status();current.headers=await response.allHeaders();await p.evaluate(()=>document.fonts.ready);
 current.title=await p.title();current.url=p.url();current.text=await p.locator('body').innerText();current.links=await p.locator('a[href]').evaluateAll(es=>es.map(e=>({text:e.textContent,href:e.getAttribute('href'),target:e.target,rel:e.rel})));
 current.controls=await p.locator('input,textarea,select,button').evaluateAll(es=>es.map(e=>({tag:e.tagName,text:e.textContent,label:e.getAttribute('aria-label'),name:e.name,type:e.type})));
 current.metadata=await p.locator('meta[name="description"],link[rel="canonical"]').evaluateAll(es=>es.map(e=>e.outerHTML));
 current.timing=await p.evaluate(()=>{let n=performance.getEntriesByType('navigation')[0];return {ttfb:n.responseStart,domContentLoaded:n.domContentLoadedEventEnd,load:n.loadEventEnd,resources:performance.getEntriesByType('resource').length}});
 current.screenshot=`${out}/${path.slice(1)||'home'}-1440.png`;await p.screenshot({path:current.screenshot,fullPage:true});
 current.axe=(await new AxeBuilder({page:p}).withTags(['wcag2a','wcag2aa','wcag21aa','wcag22aa']).analyze()).violations.map(v=>({id:v.id,impact:v.impact,description:v.description,tags:v.tags,nodes:v.nodes.map(n=>({target:n.target,summary:n.failureSummary}))}));
 for(const [width,height] of sizes){await p.setViewportSize({width,height});const measurement=await p.evaluate(()=>({scroll:document.documentElement.scrollWidth,client:document.documentElement.clientWidth,overflowElements:[...document.querySelectorAll('main *')].filter(e=>{const r=e.getBoundingClientRect();return r.width&& (r.right>innerWidth+1||r.left< -1)}).slice(0,8).map(e=>({tag:e.tagName,cls:e.className,text:e.textContent.slice(0,80)}))}));result.responsive.push({path,width,height,...measurement});if([280,390,768].includes(width))await p.screenshot({path:`${out}/${path.slice(1)||'home'}-${width}.png`,fullPage:true});}
 current.sweep=[];for(const width of [...new Set([...Array.from({length:58},(_,i)=>280+i*40),369,370,371,699,700,701,799,800,801,1049,1050,1051,1249,1250,1251,1599,1600,1601])].sort((a,b)=>a-b)){await p.setViewportSize({width,height:900});current.sweep.push({width,overflow:await p.evaluate(()=>document.documentElement.scrollWidth-innerWidth)});}
 await p.setViewportSize({width:1440,height:900});console.log(path,current.status,'axe',current.axe.length,'errors',current.httpErrors.length);
 }catch(e){current.failure=e.message;console.log(path,e.message.slice(0,200));}save();
}
await context.tracing.stop({path:out+'/live-trace.zip'});await b.close();
for(const [name,type,channel] of [['Firefox',firefox],['WebKit',webkit],['Edge',chromium,'msedge'],['Chrome',chromium,'chrome']]){let browser;try{browser=await type.launch({headless:false,...(channel?{channel}:{})});const page=await browser.newPage();const response=await page.goto(TARGET_URL,{waitUntil:'networkidle',timeout:45000});result.browsers.push({name,version:browser.version(),status:response.status(),title:await page.title(),text:(await page.locator('body').innerText()).slice(0,500)});await page.screenshot({path:out+'/'+name+'.png',fullPage:true});}catch(e){result.browsers.push({name,blocked:e.message});}finally{await browser?.close();save();}}
})().catch(e=>{console.error(e);save();process.exitCode=1});
