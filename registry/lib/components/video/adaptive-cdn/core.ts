/* eslint-disable */
// @ts-nocheck
/**
 * 视频与直播 CDN 自动优选 - 核心逻辑
 * 源自浏览器中安装的 v1.0.0 单文件版本 (见 EVO/archive/adaptiveMediaCdn-v1.0.0-installed.js), 保持原有紧凑写法.
 */
import { createPlaybackStats } from './stats';
const NAME = 'adaptiveMediaCdn';
const VERSION = '1.2.0';
/** 只在真正播放视频 / 直播的页面上挂钩和测速; 首页、搜索页等的悬停预览不值得为之测速 */
const playbackPages = [
  /^https:\/\/www\.bilibili\.com\/(video|bangumi\/play|list|festival|medialist\/play|cheese\/play)\//,
  /^https:\/\/m\.bilibili\.com\/(video|bangumi\/play)\//,
  /^https:\/\/live\.bilibili\.com\/(blanc\/)?\d+/,
];
const isPlaybackPage = href => playbackPages.some(p => p.test(href));
/** 请求路径看起来是 B 站的媒体资源 (含 PCDN 的 /v1/resource/ 形式) */
const mediaPath = path => /\/upgcxcode\/|\/live-bvc\/|\.m4s$|\.flv$|\.m3u8$/.test(path);
/** 起播保护: 视频缓冲到这么多秒前不做测速, 避免和起播抢带宽 */
const WARMUP_BUFFER = 5;
const WARMUP_MAX = 20000;
const SLOT = '__biliAdaptiveCdn';
const TTL = 30 * 60 * 1000;
const COOLDOWN = 120000;
/** 直播节点测速失败后多久内不再重测 (原来失败的直播节点每次都会重测, 主播断流时会连续测出一串 404) */
const FAIL_RETRY = 5 * 60 * 1000;
/** 播放器自己换了线路后, 这么久之内不再把它拉回插件选的节点 */
const PIN_TTL = 10 * 60 * 1000;
const MAX_BYTES = 2 * 1024 * 1024;
const MAX_GROUPS = 80;
const domains = ['bilivideo.com', 'bilivideo.cn'];
// Observed redirect target of the official d1--cn-gotcha04b live CDN.
const playbackEndpoint = value => {const u=officialUrl(value);return u&&(mediaUrl(value)||u.hostname.endsWith('.smtcdns.net'))?u:null;};
const defaults = { autoVideo: true, autoLive: true, autoRecover: true, refreshMinutes: 60,
  videoHosts: '', liveHosts: '', listSources: '' };
const hostAllowed = host => domains.some(d => host === d || host.endsWith('.' + d));
function mediaUrl(value) {
  try { const u = new URL(value, 'https://www.bilibili.com');
    return u.protocol === 'https:' && !u.username && !u.password && !u.port && hostAllowed(u.hostname) ? u : null;
  } catch { return null; }
}
function officialUrl(value) {try {const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password?u:null;}catch{return null;}}
// 媒体身份: 去掉 PCDN 的 /v1/resource 前缀; 直播流路径里 /live-bvc/<数字>/ 这段每次请求播放地址都会变, 同一路流要去掉它才认得出来
function mediaIdentity(value) {const u=officialUrl(value);return u?u.pathname.replace(/^\/v1\/resource(?=\/)/,'').replace(/^\/live-bvc\/\d+\//,'/live-bvc/'):'';}
function hosts(text) {
  const result = [];
  for (let entry of String(text || '').split(/[\s,;]+/)) {
    if (!entry) continue;
    try { const u = new URL(entry.includes('://') ? entry : 'https://' + entry);
      if (mediaUrl(u.href) && u.pathname === '/' && !u.search && !u.hash) result.push(u.hostname);
    } catch { /* Invalid input cannot become a request target. */ }
  }
  return [...new Set(result)].slice(0,32);
}
function alive(url, now = Date.now()) {
  const u = mediaUrl(url); if (!u) return false;
  const deadline = Number(u.searchParams.get('deadline') || u.searchParams.get('expires'));
  return !deadline || deadline * 1000 > now + 30000;
}
function groupsOf(json) {
  const out = [];
  const seen = new Set();
  function visit(x, path, depth) {
    if (!x || typeof x !== 'object' || seen.has(x) || depth > 12) return;
    seen.add(x);
    if (x.dash) {
      for (const track of ['video','audio']) for (const item of x.dash[track] || []) {
        if (!item || typeof item !== 'object') continue;
        const primary = item.baseUrl || item.base_url;
        const originalUrls = [...new Set([primary, ...(item.backupUrl || []), ...(item.backup_url || [])])].filter(u=>officialUrl(u));
        const urls = originalUrls.filter(u=>mediaUrl(u));
        if (!urls.length) continue;
        out.push({kind:'video', format:'dash', codec:String(item.codecs || item.codecid || track),
          quality:String(item.id || ''), track, urls, originalUrls, primary,
          apply(ordered) { const first=ordered[0]; if (!first) return;
            if ('baseUrl' in item) item.baseUrl=first;
            if ('base_url' in item) item.base_url=first;
            if (!('baseUrl' in item) && !('base_url' in item)) item.base_url=first;
            const backup=[...new Set([...ordered.slice(1),...originalUrls])].filter(u=>u!==first);
            item.backupUrl=backup; item.backup_url=backup;
          }});
      }
      for (const extra of [x.dash.dolby?.audio, x.dash.flac?.audio]) {
        if (extra) visit({dash:{audio:Array.isArray(extra)?extra:[extra]}},path+'.extra',depth+1);
      }
    }
    if (Array.isArray(x.durl)) for (const item of x.durl) {
      const originalUrls=[...new Set([item.url,...(item.backup_url||[])])].filter(u=>officialUrl(u));
      const urls=originalUrls.filter(u=>mediaUrl(u));
      if (urls.length) out.push({kind:'video',format:'progressive',codec:'unknown',quality:String(x.quality||''),track:'video',
        urls,originalUrls,primary:item.url,apply(ordered){item.url=ordered[0];item.backup_url=[...new Set([...ordered.slice(1),...originalUrls])].filter(u=>u!==item.url);}});
    }
    if (x.protocol_name && Array.isArray(x.format)) for (const f of x.format) for (const c of f.codec || []) {
      const entries=(c.url_info||[]).map(i=>({info:i,url:i.host+c.base_url+i.extra})).filter(i=>mediaUrl(i.url));
      if (entries.length) out.push({kind:'live',format:f.format_name,codec:c.codec_name,quality:String(c.current_qn),track:'live',
        urls:entries.map(i=>i.url),primary:entries[0].url,
        apply(ordered){const ranks=new Map(ordered.map((u,i)=>[u,i]));c.url_info=[...(c.url_info||[])].sort((a,b)=>
          (ranks.get(a.host+c.base_url+a.extra)??999)-(ranks.get(b.host+c.base_url+b.extra)??999));}});
    }
    for (const [k,v] of Object.entries(x)) {
      if (k==='dash' || k==='durl' || k==='url_info') continue;
      if (v && typeof v==='object') visit(v,path+'.'+k,depth+1);
    }
  }
  visit(json,'root',0); return out;
}
const groupId = g => [g.kind,g.format,g.codec,g.quality,g.track,mediaIdentity(g.urls[0])].join('|');
// 点播的吞吐只取决于节点, 与编码 / 清晰度无关: 按节点记录, 避免同一节点按每种编码重复测速.
// 直播 FLV / HLS 的取流路径不同, 仍按格式区分.
const metricKey = (g,u) => (g.kind==='video'?[g.kind,g.format,new URL(u).host]:[g.kind,g.format,g.codec,new URL(u).host]).join('|');
function validMedia(bytes, type) {
  if (bytes.length<12) return false;
  const ascii=String.fromCharCode(...bytes.slice(0,64));
  if (/^\s*(<|\{|\[)/.test(ascii)) return false;
  if (/html|json|text\/plain/i.test(type||'')) return false;
  return ascii.startsWith('FLV') || bytes[0]===0x47 || ['ftyp','styp','moof','sidx','moov','mdat'].includes(ascii.slice(4,8));
}
function rank(g, metrics, preferred, now=Date.now()) {
  return g.urls.map((url,index)=>{
    const m=metrics[metricKey(g,url)]; const fresh=m && now-m.at<TTL && (g.kind!=='live'||g.format!=='flv'||!m.ok||m.sustained===true);
    let score=0;
    if (fresh) score=m.ok ? Math.max(0.01,m.mbps)/(1+m.ttfb/600)/(1+(m.failures||0))/(1+(m.gap||0)/1000) : -1000;
    if (fresh && m.ok && preferred?.includes(new URL(url).host)) score*=1.1;
    return {url,index,score,verified:Boolean(fresh&&m.ok),failed:Boolean(fresh&&!m.ok)};
  }).sort((a,b)=>b.score-a.score || a.index-b.index);
}
function parseList(text) {
  if (text.length>262144) throw Error('节点列表超过 256 KB');
  const data=JSON.parse(text);
  if (!data || typeof data!=='object' || Array.isArray(data)) throw Error('节点列表必须是 JSON 对象');
  return {video:hosts((Array.isArray(data.video)?data.video:[]).join('\n')),live:hosts((Array.isArray(data.live)?data.live:[]).join('\n'))};
}
function boot(core) {
  const W=typeof unsafeWindow!=='undefined'?unsafeWindow:globalThis;
  if (!W.document || !isPlaybackPage(W.location.href)) return null;
  if (W[SLOT]) return W[SLOT];
  const settingsApi=core?.settings || W.bilibiliEvolved?.settingsApis;
  const setting=settingsApi?.getComponentSettings(NAME);
  if (!setting?.enabled) return null;
  const opts=setting.options;
  const rawFetch=W.fetch.bind(W);
  const storageKind=W.location.hostname==='live.bilibili.com'?'live':'video';
  let store;
  // 测速状态按视频 / 直播分键保存在脚本存储里. 旧版在没有脚本存储时写进组件设置 (_state), 会每分钟改写整份 BE 设置,
  // 而且视频页和直播页会互相覆盖; 这里迁移一次后删掉.
  const localStore={GM_getValue:(k,d)=>{try{const v=W.localStorage.getItem(k);return v?JSON.parse(v):d;}catch{return d;}},GM_setValue:(k,v)=>{try{W.localStorage.setItem(k,JSON.stringify(v));}catch{}}};
  const storage=(typeof GM_getValue==='function'&&typeof GM_setValue==='function'?{GM_getValue,GM_setValue}:W.bilibiliEvolved?.monkeyApis)||localStore;
  try { const a=storage.GM_getValue(NAME+'.state.video',{}),b=storage.GM_getValue(NAME+'.state.live',{});let legacy={};try{legacy=JSON.parse(opts._state||'{}');}catch{}
    store={metrics:{...legacy.metrics,...a?.metrics,...b?.metrics},catalog:{...legacy.catalog,...a?.catalog,...b?.catalog}}; } catch { store={}; }
  // 旧版的悬浮按钮开关已经没有用了 (入口移到了 BE 侧栏「功能」里)
  for(const legacyKey of ['_state','showButton'])if(legacyKey in opts)delete opts[legacyKey];
  const metrics=store.metrics||{}, catalog=store.catalog||{};
  let stopped=false, busy=false, refreshBusy=false, lastRefresh=Date.now(), lastRecovery=Date.now(), probeCount=0;
  let pending=false, currentVideo=null, lastSample=null;
  let remoteLists={video:[],live:[]}, lastPersist=0;
  const bootAt=Date.now();
  const stats=createPlaybackStats({W,kind:storageKind,name:NAME,storage});
  const groups=new Map(), mediaMap=new Map(), pathMap=new Map(), knownSourceHosts=new Set(), chosen=new Map(), endpoints=new Map();
  // 直播: 播放器上一次请求的线路, 以及播放器自己换过去、暂时不接管的线路
  const playerLast=new Map(), pinned=new Map(), routedHosts=new Map();
  let lastMediaHost="";
  const samples=[], events=[], logs=[], controllers=new Set(), subscriptions=[];
  const cfg=()=>Object.assign({},defaults,opts);
  const enabled=kind=>!stopped&&setting.enabled&&(kind==='live'?cfg().autoLive:cfg().autoVideo);
  const log=(message,detail={})=>{logs.push({at:Date.now(),message,...detail});if(logs.length>160)logs.shift();render();};
  const persist=()=>{const now=Date.now();for(const[k,v]of Object.entries(metrics))if(now-v.at>86400000*2)delete metrics[k];
    for(const[k,v]of Object.entries(catalog))if(now-v.seen>86400000*14)delete catalog[k];
    const state={metrics:Object.fromEntries(Object.entries(metrics).filter(([k])=>k.startsWith(storageKind+'|')).slice(-200)),catalog:Object.fromEntries(Object.entries(catalog).filter(([k])=>k.startsWith(storageKind+'|')).slice(-128))};
    storage.GM_setValue(NAME+'.state.'+storageKind,state);lastPersist=now;};
  function remember(g) {
    if (!enabled(g.kind)) return;
    const id=groupId(g);const old=groups.get(id);
    const clean={...g,urls:[...g.urls,...(g.kind==='video'?(old?.urls||[]).filter(u=>alive(u)):[])].filter((u,i,a)=>a.findIndex(v=>new URL(v).host===new URL(u).host)===i).slice(0,16),originalUrls:g.originalUrls||g.urls,apply:undefined,id};
    if (g.kind==='video') {
      const add=[...hosts(cfg().videoHosts),...remoteLists.video];
      clean.manual=add.map(h=>{const u=new URL(g.urls[0]);u.hostname=h;return u.href;}).filter(u=>!clean.urls.includes(u));
    }
    groups.set(id,clean);
    for(const url of [...clean.urls,...clean.originalUrls]) {
      mediaMap.set(url,id);knownSourceHosts.add(new URL(url).host);pathMap.set(mediaIdentity(url),id); const h=new URL(url).host;catalog[g.kind+'|'+h]={kind:g.kind,host:h,seen:Date.now()};
    }
    if(groups.size>MAX_GROUPS)dropGroup(groups.keys().next().value);
    if(!old || clean.urls.some(u=>!metrics[metricKey(g,u)])) schedule();
  }
  function dropGroup(id){groups.delete(id);chosen.delete(id);pinned.delete(id);playerLast.delete(id);routedHosts.delete(id);
    for(const[u,x]of mediaMap)if(x===id)mediaMap.delete(u);for(const[p,x]of pathMap)if(x===id)pathMap.delete(p);}
  const livePlayingPath=()=>{try{return mediaIdentity(W.livePlayer.getPlayerInfo().playurl);}catch{return '';}};
  /** 主播重新推流后旧的流地址会 404; 只保留最新返回的和正在播放的直播流, 免得对着失效地址反复测速、把节点误判成失败 */
  function pruneLive(keep){const current=livePlayingPath();
    for(const[id,g]of [...groups])if(g.kind==='live'&&!keep.has(id)&&!g.urls.some(u=>mediaIdentity(u)===current))dropGroup(id);}
  function choose(g) {
    const list=rank(g,metrics,g.kind==='live'?[...hosts(cfg().liveHosts),...remoteLists.live]:[]);
    const id=groupId(g), previous=chosen.get(id), best=list[0];
    if(!best?.verified)return list.filter(x=>!x.failed).concat(list.filter(x=>x.failed)).map(x=>x.url);
    let winner=best;
    if(previous){const old=list.find(x=>new URL(x.url).host===previous.host);
      if(old?.verified && (Date.now()-previous.at<COOLDOWN || best.score<old.score*1.25))winner=old;}
    if(!previous||previous.host!==new URL(winner.url).host)chosen.set(id,{host:new URL(winner.url).host,at:Date.now()});
    return [winner.url,...list.filter(x=>x.url!==winner.url).map(x=>x.url)];
  }
  function transform(json,url='',fromPlugin=false) {
    if(stopped||!setting.enabled||!json||typeof json!=='object'||(typeof json.code==='number'&&json.code!==0))return json;
    if(url) {try {const u=new URL(url,W.location.href);if(apiKind(u.href))endpoints.set(apiKind(u.href),u.href);}catch{}}
    const liveIds=new Set();
    for(const g of groupsOf(json)){remember(g);const id=groupId(g);
      // 播放器拿到新的播放地址后会从第一条线路重新开始, 不算它自己换线
      if(g.kind==='live'){liveIds.add(id);if(!fromPlugin)playerLast.delete(id);}
      if(enabled(g.kind)){const ordered=choose(groups.get(id)||g);const verified=ordered[0]&&metrics[metricKey(g,ordered[0])];if(verified?.ok&&Date.now()-verified.at<TTL)g.apply(ordered);}}
    if(liveIds.size)pruneLive(liveIds);
    return json;
  }
  function apiKind(url) {
    try {const u=new URL(url,W.location.href);
      if(u.hostname==='api.live.bilibili.com' && /\/getRoomPlayInfo$|\/playUrl$/.test(u.pathname))return 'live';
      if(u.hostname==='api.bilibili.com' && /\/(?:wbi\/)?playurl$/i.test(u.pathname))return 'video';
    } catch{} return null;
  }
  function route(url) {
    let parsed;try{parsed=new URL(url,W.location.href);}catch{return url;}
    // PCDN / MCDN 节点 (如 *.mountaintoys.cn:4483) 不一定出现在播放地址里, 但其路径与官方媒体一致, 按路径归组才能在播放中途切线
    const identity=mediaIdentity(url);
    const id=mediaMap.get(url)||((hostAllowed(parsed.hostname)||knownSourceHosts.has(parsed.host)||mediaPath(identity))?pathMap.get(identity):null),g=groups.get(id);
    if(!g||!enabled(g.kind))return url;
    if(g.kind==='live'){
      // 播放器自己换了线路 (原线路出错, 或者用户在播放器里手动选了线路) 时按它的选择, 不再把请求拉回插件选的节点
      const previous=playerLast.get(id);playerLast.set(id,parsed.host);
      if(previous&&previous!==parsed.host){pinned.set(id,{host:parsed.host,at:Date.now()});log('播放器自行切换了线路，按播放器的选择',{kind:'live',from:previous,to:parsed.host});}
      const pin=pinned.get(id);if(pin&&pin.host===parsed.host&&Date.now()-pin.at<PIN_TTL){lastMediaHost=parsed.host;return url;}
    }
    const first=choose(g)[0]; const m=first&&metrics[metricKey(g,first)];
    const result=m?.ok && Date.now()-m.at<TTL && (g.kind!=='live'||g.format!=='flv'||m.sustained)&&alive(first)?first:url;
    // 按分组记住改走的节点, 只在变化时记日志 (原来音视频分片交替请求时每个分片都会记一条, 把其它日志挤掉)
    const nextHost=new URL(result).host;if(result!==url&&routedHosts.get(id)!==nextHost){routedHosts.set(id,nextHost);log('实际媒体线路已优选',{kind:g.kind,from:new URL(url).host,to:nextHost});}
    lastMediaHost=nextHost;return result;
  }
  const inputUrl=input=>typeof input==='string'?input:input?.url||input?.href||String(input);
  function wrapResponse(response,url) {
    const json=response.json.bind(response),text=response.text.bind(response),clone=response.clone.bind(response);
    try {Object.defineProperties(response,{
      json:{configurable:true,value:async()=>transform(await json(),url)},
      text:{configurable:true,value:async()=>{const s=await text();try{return JSON.stringify(transform(JSON.parse(s),url));}catch{return s;}}},
      clone:{configurable:true,value:()=>wrapResponse(clone(),url)}
    });} catch(e){log('响应无法挂钩',{error:e.message});}return response;
  }
  const mediaGroup=url=>groups.get(mediaMap.get(url)||pathMap.get(mediaIdentity(url)));
  const isMediaRequest=url=>Boolean(mediaGroup(url))||mediaPath(mediaIdentity(url));
  const mediaCodec=g=>g&&g.track!=='audio'?g.codec:undefined;
  const hostOf=url=>{try{return new URL(url,W.location.href).host;}catch{return '';}};
  /** 播放统计: 用透传的 TransformStream 数一数媒体数据什么时候到、到了多少, 内容原样交给播放器 */
  function meter(r,used,url){
    if(!r?.body||!r.ok)return r;
    // 直播的播放地址可能比流先到也可能后到, 编码在收到数据时再按分组查
    const host=hostOf(used);let codec;
    try {const counted=r.body.pipeThrough(new W.TransformStream({transform(chunk,c){codec??=mediaCodec(mediaGroup(url));stats.noteBytes(chunk.byteLength,host,codec);c.enqueue(chunk);}}));
      const out=new W.Response(counted,{status:r.status,statusText:r.statusText,headers:r.headers});
      for(const k of ['url','redirected','type'])Object.defineProperty(out,k,{configurable:true,value:r[k]});
      return out;} catch {return r;}
  }
  const hookedFetch=async function(input,init) {
    const url=inputUrl(input),mapped=route(url);
    let target=input;if(mapped!==url)target=typeof input==='string'||input instanceof W.URL?mapped:new W.Request(mapped,input);
    let r,used=mapped;
    try {r=await rawFetch(target,init);if(mapped!==url&&!r.ok)throw Error('HTTP '+r.status);}
    catch(e){if(mapped===url || init?.signal?.aborted || input?.signal?.aborted)throw e;
      markFailure(mediaGroup(url),mapped,'媒体请求失败');used=url;r=await rawFetch(input,init);}
    if(apiKind(url))return wrapResponse(r,url);
    return isMediaRequest(url)?meter(r,used,url):r;
  };
  W.fetch=hookedFetch;
  const OriginalXHR=W.XMLHttpRequest;
  class HookedXHR extends OriginalXHR {
    open(method,url,...args){this.__cdnUrl=String(url);this.__cdnCached=undefined;this.__cdnMapped=route(String(url));this.__cdnMedia=isMediaRequest(this.__cdnUrl);this.__cdnLoaded=0;
      if(!this.__cdnListening&&this.addEventListener){this.__cdnListening=true;const fail=()=>{if(this.__cdnMapped!==this.__cdnUrl)markFailure(mediaGroup(this.__cdnUrl),this.__cdnMapped,'XHR 媒体请求失败');};
        this.addEventListener('error',fail);this.addEventListener('load',()=>{if(this.status>=400)fail();});
        this.addEventListener('progress',e=>{if(!this.__cdnMedia)return;const d=e.loaded-this.__cdnLoaded;this.__cdnLoaded=e.loaded;stats.noteBytes(d,hostOf(this.__cdnMapped),mediaCodec(mediaGroup(this.__cdnUrl)));});}
      return super.open(method,this.__cdnMapped,...args);}
    get responseText(){const s=super.responseText;if(this.readyState!==4||!apiKind(this.__cdnUrl))return s;
      if(this.__cdnCached===undefined){try{this.__cdnCached=JSON.stringify(transform(JSON.parse(s),this.__cdnUrl));}catch{this.__cdnCached=s;}}return this.__cdnCached;}
    get response(){if(this.readyState!==4||!apiKind(this.__cdnUrl))return super.response;
      if(this.responseType==='json'){if(this.__cdnCached===undefined)this.__cdnCached=transform(super.response,this.__cdnUrl);return this.__cdnCached;}
      return !this.responseType||this.responseType==='text'?this.responseText:super.response;}
  }
  W.XMLHttpRequest=HookedXHR;
  const restores=[];
  for(const key of ['__playinfo__','__NEPTUNE_IS_MY_WAIFU__']) {
    const descriptor=Object.getOwnPropertyDescriptor(W,key);if(descriptor&&!descriptor.configurable){if(W[key])transform(W[key]);continue;}
    let value=descriptor?.get?descriptor.get.call(W):W[key];if(value)transform(value);
    Object.defineProperty(W,key,{configurable:true,enumerable:descriptor?.enumerable??true,get(){return descriptor?.get?descriptor.get.call(W):value;},
      set(v){transform(v);if(descriptor?.set)descriptor.set.call(W,v);else value=v;}});
    restores.push(()=>{if(descriptor)Object.defineProperty(W,key,descriptor);else{delete W[key];W[key]=value;}});
  }
  function markFailure(g,url,error) {
    if(!g||!url)return;const key=metricKey(g,url),old=metrics[key];metrics[key]={at:Date.now(),ok:false,mbps:0,ttfb:0,failures:(old?.failures||0)+1,error};persist();
  }
  async function readBounded(url,{limit=MAX_BYTES,range=false,timeout=4000,signal=null}={}) {
    if(!playbackEndpoint(url))throw Error('非允许的媒体域名');
    const controller=new AbortController();controllers.add(controller);
    const forwardAbort=()=>controller.abort();signal?.addEventListener('abort',forwardAbort,{once:true});
    if(signal?.aborted)controller.abort();
    const timer=setTimeout(()=>controller.abort(),timeout);const start=performance.now();
    let reader,bytes=0,head=new Uint8Array(),ttfb=0,gap=0,last=0,ended=false,status=0,type='',parts=[];
    try {
      const r=await rawFetch(url,{signal:controller.signal,credentials:'omit',cache:'no-store',headers:range?{Range:'bytes=0-'+(limit-1)}:{}});
      status=r.status;type=r.headers.get('content-type')||'';
      if(!r.ok)throw Error('HTTP '+r.status);if(!playbackEndpoint(r.url||url))throw Error('CDN 重定向到未知域名');
      reader=r.body.getReader();
      while(bytes<limit){const chunk=await reader.read();if(chunk.done){ended=true;break;}const now=performance.now();
        if(!bytes){ttfb=now-start;head=chunk.value.slice(0,256);}if(last)gap=Math.max(gap,now-last);last=now;
        const keep=chunk.value.slice(0,Math.max(0,limit-bytes));parts.push(keep);bytes+=keep.length;}
    } catch(e){if(e.name!=='AbortError'||bytes<65536)throw e;}
    finally{clearTimeout(timer);try{await reader?.cancel();}catch{}controller.abort();controllers.delete(controller);signal?.removeEventListener('abort',forwardAbort);}
    const elapsed=performance.now()-start;
    const data=new Uint8Array(bytes);let offset=0;for(const p of parts){data.set(p,offset);offset+=p.length;}
    return {bytes,data,head,ttfb,elapsed,gap,ended,status,type,mbps:bytes*8/Math.max(1,elapsed)/1000};
  }
  async function probeLive(url) {
    const controller=new AbortController();controllers.add(controller);const start=performance.now();
    const timer=setTimeout(()=>controller.abort(),7500);let reader,bytes=0,head=null,first=0,warmBytes=0,warmAt=0,last=0,gap=0,ended=false;
    try {
      const response=await rawFetch(url,{signal:controller.signal,credentials:'omit',cache:'no-store'});
      if(!response.ok)throw Error('HTTP '+response.status);if(!playbackEndpoint(response.url||url))throw Error('CDN 重定向到未知域名');
      reader=response.body.getReader();
      while(bytes<32*1024*1024){const x=await reader.read();const now=performance.now();if(x.done){ended=true;break;}
        if(!first){first=now;head=x.value.slice(0,256);if(!validMedia(head,response.headers.get('content-type')))throw Error('直播媒体格式无效');}
        if(last)gap=Math.max(gap,now-last);last=now;bytes+=x.value.length;
        if(!warmAt&&now-first>=1000){warmAt=now;warmBytes=bytes;}
        if(warmAt&&now-warmAt>=4500)break;
      }
    }catch(e){if(e.name==='AbortError'&&!warmAt&&!stopped)throw Error('7.5 秒内没有持续收到直播数据');if(e.name!=='AbortError'||!warmAt)throw e;}
    finally{clearTimeout(timer);try{await reader?.cancel();}catch{}controller.abort();controllers.delete(controller);}
    const now=performance.now();gap=Math.max(gap,last?now-last:0);
    const duration=now-warmAt;if(ended||bytes<65536||!warmAt||duration<2000||bytes-warmBytes<65536)throw Error('持续直播数据不足或提前断流');
    return {bytes,head,ttfb:first-start,gap,elapsed:now-start,mbps:(bytes-warmBytes)*8/duration/1000,sustained:true};
  }
  async function probe(g,url,reference=null) {
    if(g.kind==='live'&&g.format==='flv')return probeLive(url);
    const isHls=g.kind==='live'&&g.format!=='flv';let sample=url;
    if(isHls){
      for(let depth=0;depth<3;depth++){
        const p=await readBounded(sample,{limit:65536,timeout:3500});const text=new TextDecoder().decode(p.data);
        if(!text.trimStart().startsWith('#EXTM3U'))throw Error('不是 HLS 播放列表');
        const rows=text.split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
        const variant=rows.findIndex(x=>x.startsWith('#EXT-X-STREAM-INF:'));
        if(variant>=0){const next=rows.slice(variant+1).find(x=>!x.startsWith('#'));if(!next)throw Error('HLS 缺少子列表');sample=new URL(next,sample).href;continue;}
        const segments=rows.filter(x=>!x.startsWith('#'));if(!segments.length)throw Error('HLS 暂无媒体分片');
        sample=new URL(segments[Math.max(0,segments.length-2)],sample).href;break;
      }
    }
    const r=await readBounded(sample,{range:g.kind==='video'});
    if(r.bytes<65536)throw Error('只有 '+r.bytes+' 字节，未取得有效媒体');
    if(!validMedia(r.head,r.type))throw Error('媒体格式校验失败');
    if(reference && (r.data.length<reference.length || !reference.every((b,i)=>b===r.data[i])))throw Error('自定义节点内容与原片不一致');
    return r;
  }
  function schedule(){if(pending||busy||stopped)return;pending=true;setTimeout(()=>whenWarm(()=>{pending=false;runTests(false).catch(e=>log('测速失败',{error:e.message}));}),3500);}
  async function runTests(force=false) {
    if(busy||stopped)return {busy:true};busy=true;render();let tested=0;
    try {
      let relevant=[...groups.values()].filter(g=>enabled(g.kind));
      const current=W.livePlayer?.getPlayerInfo?.().playurl,currentPath=livePlayingPath();
      // 直播只测正在播放的这一路流, 各节点的结果才有可比性; 找不到时再测全部
      const playingLive=relevant.filter(g=>g.kind==='live'&&g.urls.some(u=>mediaIdentity(u)===currentPath));
      if(playingLive.length)relevant=relevant.filter(g=>g.kind!=='live'||playingLive.includes(g));
      const active=new Set(performance.getEntriesByType('resource').slice(-100).filter(r=>mediaUrl(r.name)).map(r=>new URL(r.name).pathname));
      const priority=g=>(g.urls.includes(current)||playingLive.includes(g)?1000:0)+(g.urls.some(u=>active.has(new URL(u).pathname))?100:0)+(g.track==='video'?10:0)+Math.min(9,Number(g.quality||0)/1000);
      relevant.sort((a,b)=>priority(b)-priority(a));
      const seen=new Set();
      for(const g of relevant){
        if(tested>=6||stopped)break;
        let reference=null;
        const discovered=g.kind==='video'?Object.values(catalog).filter(x=>x.kind==='video'&&x.host.startsWith('upos-')).map(x=>x.host):[];
        const extras=g.kind==='video'?[...hosts(cfg().videoHosts),...remoteLists.video,...discovered].map(host=>{const u=new URL(g.urls[0]);u.hostname=host;return u.href;}):[];
        const candidates=[...new Set([...g.urls,...(g.manual||[]),...extras])];
        for(const url of candidates){
          // 正在卡顿时不测速, 免得和播放抢带宽
          if(tested>=6||stopped||stats.ongoing())break;
          const key=metricKey(g,url);if(seen.has(key)||!alive(url))continue;seen.add(key);
          const old=metrics[key],keep=old&&(old.ok||g.kind==='video')?TTL:FAIL_RETRY;
          if(!force&&old&&Date.now()-old.at<keep&&(!old.ok||g.kind!=='live'||g.format!=='flv'||old.sustained))continue;
          tested++;probeCount++;const manual=!g.urls.includes(url);stats.probeStart();
          try {
            if(manual&&!reference){const r=await probe(g,g.urls[0]);reference=r.data.slice(0,65536);}
            const r=await probe(g,url,manual?reference:null);
            const mbps=old?.ok&&old.sustained===!!r.sustained&&Date.now()-old.at<TTL?old.mbps*0.4+r.mbps*0.6:r.mbps;
            metrics[key]={at:Date.now(),ok:true,mbps,ttfb:r.ttfb,bytes:r.bytes,gap:r.gap,sustained:!!r.sustained,failures:Math.max(0,(old?.failures||0)-1)};
            if(manual){g.urls.push(url);mediaMap.set(url,g.id);}
            log('测速通过',{kind:g.kind,host:new URL(url).host,mbps:+r.mbps.toFixed(2),ttfb:Math.round(r.ttfb)});
          }catch(e){if(stopped)break;markFailure(g,url,e.message);log('节点测试失败',{kind:g.kind,host:new URL(url).host,error:e.message});}
          finally{stats.probeEnd();}
        }
      }
      persist();
    }finally{busy=false;render();}return {tested};
  }
  async function refreshLists(test=true) {
    if(refreshBusy||stopped)return {busy:true};refreshBusy=true;lastRefresh=Date.now();
    try {
      const lists={video:[],live:[]};
      for(const text of String(cfg().listSources).split(/\s+/).filter(Boolean).slice(0,4)){
        try { const url=new URL(text);if(url.protocol!=='https:')throw Error('订阅地址必须为 HTTPS');
        const response=await rawFetch(url.href,{credentials:'omit',cache:'no-store',signal:AbortSignal.timeout(5000)});
        if(!response.ok)throw Error('列表 HTTP '+response.status);
        const reader=response.body.getReader();let bytes=0,parts=[];
        try{while(true){const c=await reader.read();if(c.done)break;bytes+=c.value.length;if(bytes>262144)throw Error('列表超过 256 KB');parts.push(c.value);}}finally{await reader.cancel().catch(()=>{});}
        const merged=new Uint8Array(bytes);let at=0;for(const p of parts){merged.set(p,at);at+=p.length;}
        const list=parseList(new TextDecoder().decode(merged));lists.video.push(...list.video);lists.live.push(...list.live);
        } catch(e) { log('订阅列表读取失败，继续刷新官方候选',{error:e.message}); }
      }
      remoteLists=lists;
      const kind=W.location.hostname==='live.bilibili.com'?'live':'video';let api=endpoints.get(kind);
      if(!api&&kind==='live'){
        const room=W.location.pathname.match(/(?:blanc\/)?(\d+)/)?.[1];
        // 按播放器当前的清晰度取, 测到的才是正在看的那一路流
        const qn=Number(W.livePlayer?.getPlayerInfo?.().quality)||10000;
        if(room)api='https://api.live.bilibili.com/xlive/web-room/v2/index/getRoomPlayInfo?room_id='+room+'&protocol=0,1&format=0,1,2&codec=0,1,2&qn='+qn+'&platform=web';
      }
      if(api){const r=await rawFetch(api,{credentials:'include',signal:AbortSignal.timeout(6000)});const data=await r.json();if(data.code!==0)throw Error('播放接口返回 '+data.code);transform(data,api,true);}
      else if(W.__playinfo__)transform(W.__playinfo__);
      else log('等待播放器返回官方播放地址');
      lastRefresh=Date.now();log('候选列表已更新',{count:Object.keys(catalog).length});persist();
    }catch(e){log('刷新失败，保留现有可用列表',{error:e.message});if(!test)throw e;}
    finally{refreshBusy=false;render();}
    if(test)return runTests(true);return {ok:true};
  }
  function currentHost(){try{const active=stats.activeHost();if(active)return active;if(lastMediaHost)return lastMediaHost;const live=W.livePlayer?.getPlayerInfo?.().playurl;if(live)return new URL(live).host;
    const source=W.player?.getMediaInfo?.().playUrl;return source?new URL(source).host:'';}catch{return '';}}
  function snapshot(){return {version:VERSION,time:new Date().toISOString(),page:W.location.origin+W.location.pathname,
    config:Object.fromEntries(Object.entries(cfg()).filter(([k])=>!k.startsWith('_')&&k!=='listSources')),
    currentHost:currentHost(),stats:stats.summary(),metrics,catalog,samples:[...samples],events:[...events],logs:[...logs],probeCount,
    groups:[...groups.values()].map(g=>({kind:g.kind,format:g.format,codec:g.codec,quality:g.quality,hosts:[...new Set(g.urls.map(u=>new URL(u).host))]}))};}
  function download(name,content){const blob=new Blob([content],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);}
  function bestVideoHost(){for(const g of groups.values()){if(g.kind!=='video'||g.track!=='video')continue;const first=choose(g)[0];const m=first&&metrics[metricKey(g,first)];if(m?.ok&&Date.now()-m.at<TTL)return new URL(first).host;}return '';}
  function applyNow(reason='手动应用优选'){
    chosen.clear();pinned.clear();playerLast.clear();
    if(W.livePlayer?.reload){lastRecovery=Date.now();stats.noteReload('cdn',reason);log('应用优选线路，重载直播播放器');W.livePlayer.reload();return;}
    // 点播的每个分片请求都会经过 route(), 清掉切换冷却后, 后续分片立即改走当前最优节点, 不需要刷新页面
    const host=bestVideoHost();log(host?'已切换，后续分片改走 '+host:'还没有可用的测速结果，请先刷新列表并测速');
  }
  function sample(){
    if(stopped)return;const v=document.querySelector('video');if(!v)return;
    if(v!==currentVideo){currentVideo=v;
      for(const type of ['waiting','stalled','playing','pause','error','emptied']){const fn=()=>{events.push({at:Date.now(),type,time:v.currentTime});if(events.length>180)events.shift();};v.addEventListener(type,fn);subscriptions.push(()=>v.removeEventListener(type,fn));}
    }
    const quality=v.getVideoPlaybackQuality?.();let buffer=0;for(let i=0;i<v.buffered.length;i++)if(v.currentTime>=v.buffered.start(i)-0.1&&v.currentTime<=v.buffered.end(i)+0.1)buffer=Math.max(0,v.buffered.end(i)-v.currentTime);
    stats.tick(v,buffer);
    const row={at:Date.now(),time:+v.currentTime.toFixed(3),buffer:+buffer.toFixed(3),paused:v.paused,readyState:v.readyState,rate:v.playbackRate,frames:quality?.totalVideoFrames,dropped:quality?.droppedVideoFrames,host:currentHost()};
    lastSample=row;samples.push(row);if(samples.length>600)samples.shift();
    recover(row.host);
    if(Date.now()-lastPersist>60000)persist();render();
  }
  /**
   * 直播断流时换节点. 只在确实是节点不送数据时才换: 单次卡顿超过 6 秒且 4 秒没收到数据, 或者 90 秒内 3 次网络断流.
   * 原来按 waiting 事件计数 (直播播放器每次卡顿会发两次 waiting), 两次 1 秒的小卡顿就会触发整个播放器重载, 重载本身比卡顿更久;
   * 页面繁忙、播放器自身原因的卡顿换节点也没用.
   */
  function recover(host){
    if(!cfg().autoRecover||!enabled('live')||!W.livePlayer?.reload||Date.now()-lastRecovery<COOLDOWN)return;
    const stall=stats.ongoing(),dead=Boolean(stall&&stall.elapsed>=6000&&stall.noData>=4000);
    const flaky=stats.networkStallsSince(Math.max(Date.now()-90000,lastRecovery))>=3;
    if(!dead&&!flaky)return;
    const path=livePlayingPath(),g=path?[...groups.values()].find(g=>g.kind==='live'&&g.urls.some(u=>mediaIdentity(u)===path)):null;
    if(!g)return;
    const fresh=u=>{const m=metrics[metricKey(g,u)];return m?.ok&&(g.format!=='flv'||m.sustained)&&Date.now()-m.at<TTL;};
    const better=choose(g).find(u=>new URL(u).host!==host&&fresh(u));
    const reason=dead?'断流超过 6 秒':'90 秒内 3 次网络断流';
    lastRecovery=Date.now();
    if(!better){log('直播'+reason+'，但没有测速通过的备用节点，先重新测速');schedule();return;}
    const current=g.urls.find(u=>new URL(u).host===host);if(current)markFailure(g,current,reason);
    log('直播'+reason+'，切到备用节点',{kind:'live',from:host,to:new URL(better).host});applyNow(reason);
  }
  /** 起播保护: 等播放器缓冲够了 (直播要求更低), 或者超时以后, 才开始自动测速, 不和起播抢带宽 */
  function warmedUp(){
    if(Date.now()-bootAt>WARMUP_MAX)return true;
    const s=samples.at(-1);if(!s||s.readyState<3)return false;
    return s.buffer>=(storageKind==='live'?1.5:WARMUP_BUFFER);
  }
  function whenWarm(fn){if(stopped)return;if(warmedUp())fn();else setTimeout(()=>whenWarm(fn),1000);}
  // 面板 (Vue) 通过 subscribe 订阅状态变化, 由 view() 给出要显示的内容
  const listeners=new Set();
  function render(){for(const fn of listeners){try{fn();}catch{}}}
  function view(){
    const s=samples.at(-1),now=Date.now();
    const status=(busy?'正在测速 · ':refreshBusy?'正在刷新候选 · ':'')+(s?'当前 '+(s.host||'未知节点')+' · 缓冲 '+s.buffer.toFixed(1)+' 秒 · '+(s.paused?'已暂停':s.readyState<3?'等待数据':'播放中'):'等待播放器');
    const rows=Object.entries(metrics).filter(([k])=>k.startsWith(storageKind+'|')).map(([key,m])=>[key,m,now-m.at>TTL||!m.ok?-1:m.mbps]).sort((a,b)=>b[2]-a[2]||b[1].at-a[1].at).slice(0,12).map(([key,m])=>{
      const parts=key.split('|'),host=parts.at(-1),expired=now-m.at>TTL;
      return {key,host,detail:parts[0]==='live'?parts[1]+' / '+parts[2]:'',
        ttfb:m.ok?Math.round(m.ttfb)+' ms':'—',speed:m.ok?m.mbps.toFixed(1)+' Mbps'+(m.sustained?' 持续':''):'—',
        state:expired?'已过期':m.ok?(parts[0]==='live'&&parts[1]==='flv'&&!m.sustained?'待持续复测':'已验证'):m.error||'失败',ok:Boolean(m.ok)&&!expired,
        current:Boolean(s?.host)&&host===s.host};});
    const messages=logs.slice(-3).map(l=>new Date(l.at).toLocaleTimeString()+' '+l.message+(l.host?' '+l.host:'')+(l.mbps!=null?' · '+l.mbps+' Mbps':'')+(l.error?'：'+l.error:'')+(l.to?'：'+l.from+' → '+l.to:''));
    return {version:VERSION,isLive:storageKind==='live',busy:busy||refreshBusy,status,rows,messages,stats:stats.view()};
  }
  function exportDiagnostic(){download('bilibili-cdn-diagnostic-'+Date.now()+'.json',JSON.stringify(snapshot(),null,2));}
  function exportList(){download('bilibili-cdn-list.json',JSON.stringify({video:[...new Set(Object.values(catalog).filter(x=>x.kind==='video').map(x=>x.host))],live:[...new Set(Object.values(catalog).filter(x=>x.kind==='live').map(x=>x.host))]},null,2));}
  function resetMetrics(){for(const k of Object.keys(metrics))delete metrics[k];chosen.clear();persist();log('测速缓存已清空');}
  const timer=setInterval(()=>{sample();if(!document.hidden&&!busy&&!refreshBusy){const n=Number(cfg().refreshMinutes);if(n>=5&&Date.now()-lastRefresh>n*60000)refreshLists().catch(()=>{});}},1000);
  const ready=()=>whenWarm(()=>refreshLists(false).then(()=>runTests(false)).catch(()=>{}));
  if(document.body)ready();else document.addEventListener('DOMContentLoaded',ready,{once:true});
  const api={version:VERSION,transform,refresh:refreshLists,test:runTests,snapshot,apply:()=>applyNow(),view,exportDiagnostic,exportList,resetMetrics,
    /** 本页的播放统计 */ stats:()=>stats.summary(),
    /** 存在脚本存储里的历史统计 (最近的卡顿记录、各节点的卡顿率) */ history:()=>stats.history(),
    subscribe(fn){listeners.add(fn);return ()=>listeners.delete(fn);},
    stop(){stopped=true;clearInterval(timer);for(const c of controllers)c.abort();for(const off of subscriptions)off();stats.stop();
      document.removeEventListener('DOMContentLoaded',ready);if(W.fetch===hookedFetch)W.fetch=rawFetch;
      if(W.XMLHttpRequest===HookedXHR)W.XMLHttpRequest=OriginalXHR;for(const restore of restores)restore();persist();render();listeners.clear();delete W[SLOT];}};
  W[SLOT]=api;log('自动优选已启动');return api;
}

export { NAME, VERSION, SLOT, defaults, boot, playbackPages, isPlaybackPage, hosts, mediaUrl, playbackEndpoint, officialUrl, mediaIdentity, alive, groupsOf, groupId, metricKey, rank, validMedia, parseList }
