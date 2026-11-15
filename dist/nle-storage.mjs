let dbPromise;
function db(){
 if(!dbPromise)dbPromise=new Promise((resolve,reject)=>{
  const r=indexedDB.open('jingxu-nle-v2',1);
  r.onupgradeneeded=()=>{
   if(!r.result.objectStoreNames.contains('projects'))r.result.createObjectStore('projects',{keyPath:'id'});
  };
  r.onsuccess=()=>resolve(r.result);
  r.onerror=()=>reject(r.error);
 });
 return dbPromise;
}
async function tx(mode,work){
 const d=await db();
 return new Promise((resolve,reject)=>{
  const t=d.transaction('projects',mode);
  const res=work(t.objectStore('projects'));
  let val;
  res.onsuccess=()=>val=res.result;
  t.oncomplete=()=>resolve(val);
  t.onerror=()=>reject(t.error);
  t.onabort=()=>reject(t.error||Error('保存操作被中断'));
 });
}
export function isDeletedSnapshot(p,ids=[],clearedAt=0){
 return ids.includes(p.id)||(Number(clearedAt)>0&&Number(p.createdAt||0)<=Number(clearedAt));
}
export function projectWasDeleted(p){
 try{return isDeletedSnapshot(p,JSON.parse(localStorage.getItem('jingxu-v2-deleted')||'[]'),Number(localStorage.getItem('jingxu-v2-cleared-at')||0));}
 catch{return false;}
}
export const saveProject=p=>projectWasDeleted(p)?Promise.reject(Error('此项目已被删除，请复制为新项目后保存。')):tx('readwrite',s=>s.put(p));
export const loadProject=id=>tx('readonly',s=>s.get(id));
export async function listAllRawProjects(){
 const rows=await tx('readonly',s=>s.getAll());
 return Array.isArray(rows)?rows:[];
}
export async function listProjects(){
 const rows=await listAllRawProjects();
 return rows.filter(p=>p&&!p.deletedAt).sort((a,b)=>(b.updatedAt||0)-(a.updatedAt||0));
}
export async function listTrashedProjects(){
 const rows=await listAllRawProjects();
 return rows.filter(p=>p&&p.deletedAt).sort((a,b)=>(b.deletedAt||0)-(a.deletedAt||0));
}
export async function softDeleteProject(id){
 const item=await loadProject(id);
 if(!item)return null;
 item.deletedAt=Date.now();
 await tx('readwrite',s=>s.put(item));
 return item;
}
export async function restoreProject(id){
 const item=await loadProject(id);
 if(!item)return null;
 delete item.deletedAt;
 item.updatedAt=Date.now();
 try{
  const ids=JSON.parse(localStorage.getItem('jingxu-v2-deleted')||'[]');
  localStorage.setItem('jingxu-v2-deleted',JSON.stringify(ids.filter(x=>x!==id)));
 }catch{}
 await tx('readwrite',s=>s.put(item));
 return item;
}
export async function deleteProject(id){
 const old=localStorage.getItem('jingxu-v2-deleted');
 const ids=JSON.parse(old||'[]');
 localStorage.setItem('jingxu-v2-deleted',JSON.stringify([...new Set([...ids,id])]));
 try{await tx('readwrite',s=>s.delete(id));}
 catch(e){old===null?localStorage.removeItem('jingxu-v2-deleted'):localStorage.setItem('jingxu-v2-deleted',old);throw e;}
}
export async function emptyTrash(){
 const trashed=await listTrashedProjects();
 for(const item of trashed){await deleteProject(item.id);}
 return trashed.length;
}
export async function clearProjects(){
 const old=localStorage.getItem('jingxu-v2-cleared-at');
 localStorage.setItem('jingxu-v2-cleared-at',String(Date.now()));
 try{await tx('readwrite',s=>s.clear());}
 catch(e){old===null?localStorage.removeItem('jingxu-v2-cleared-at'):localStorage.setItem('jingxu-v2-cleared-at',old);throw e;}
}
export function readPrefs(){
 try{return JSON.parse(localStorage.getItem('jingxu-v2-prefs')||'null')||{lang:'zh',zoomPx:48,snap:true,ripple:true,outputMode:'storyboard'};}
 catch{return {lang:'zh',zoomPx:48,snap:true,ripple:true,outputMode:'storyboard'};}
}
export function savePrefs(prefs){localStorage.setItem('jingxu-v2-prefs',JSON.stringify(prefs));}
export function lastProject(id){
 if(id){localStorage.setItem('jingxu-v2-last-project',id);return id;}
 return localStorage.getItem('jingxu-v2-last-project');
}
export const clearLastProject=()=>localStorage.removeItem('jingxu-v2-last-project');
