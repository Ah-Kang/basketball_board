const labels={interested:'관심',applied:'신청 기록',attended:'참여 기록',cancelled:'취소'};
let generation=0;
const panel=document.createElement('section');
panel.className='member-panel';
panel.setAttribute('aria-label','내 프로필');
panel.innerHTML=`<p class="eyebrow">나의 농구 생활</p><h2>내 프로필</h2><p class="member-help">프로필과 활동 기록은 현재 본인에게만 보여요.</p>
<p id="memberNotice" role="status"></p>
<form id="memberForm"><label>닉네임<input name="nickname" maxlength="24" required placeholder="코트에서 불릴 이름"></label>
<label>활동 지역<input name="region" maxlength="60" placeholder="예: 서울 강서구"></label>
<div class="member-columns"><label>포지션<select name="position"><option value="">선택 안 함</option><option value="guard">가드</option><option value="forward">포워드</option><option value="center">센터</option><option value="any">상관없음</option></select></label>
<label>실력<select name="skill"><option value="">선택 안 함</option><option value="beginner">입문</option><option value="intermediate">중급</option><option value="advanced">상급</option></select></label></div>
<label>자기소개<textarea name="bio" maxlength="300" rows="3" placeholder="좋아하는 플레이와 함께하고 싶은 농구를 소개해 주세요."></textarea></label>
<button class="member-primary" type="submit">프로필 저장</button></form>
<div class="member-activity-heading"><h2>내 활동</h2><button id="reloadActivities" type="button">새로고침</button></div>
<p class="member-help">외부 카페에서 직접 신청한 뒤 기록해 주세요. 여기서 상태를 바꿔도 주최자에게 신청되거나 취소되지 않아요.</p>
<p id="memberCounts"></p><div id="memberActivities"></div>`;
document.querySelector('#app main').append(panel);
const nav=document.createElement('button');
nav.type='button';nav.dataset.mobileTab='profile';nav.setAttribute('aria-pressed','false');
nav.innerHTML='<svg class="tab-icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21v-2a8 8 0 0 1 16 0v2"/></svg><span>내 프로필</span>';
document.querySelector('.mobile-tabs').append(nav);
const form=document.getElementById('memberForm');
const notice=document.getElementById('memberNotice');
const list=document.getElementById('memberActivities');

async function api(path,body) {
  const response=await fetch(path,body===undefined?{}:{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
  const data=await response.json();
  if (!response.ok) throw new Error(data.error || '요청을 처리하지 못했습니다.');
  return data;
}
function showActivities(rows) {
  list.replaceChildren();
  document.getElementById('memberCounts').textContent=`최근 ${rows.length}개 기록 · 관심 ${rows.filter(r=>r.status==='interested').length} · 신청 ${rows.filter(r=>r.status==='applied').length} · 참여 ${rows.filter(r=>r.status==='attended').length}`;
  if (!rows.length) {const p=document.createElement('p');p.className='member-help';p.textContent='아직 기록이 없어요. 경기 상세에서 관심 경기를 저장해 보세요.';list.append(p);}
  for (const row of rows) {
    const card=document.createElement('article');card.className='member-activity';
    const heading=document.createElement('h3');heading.textContent=row.event_snapshot.title;
    const detail=document.createElement('p');detail.textContent=[row.event_snapshot.date,row.event_snapshot.startTime,row.event_snapshot.area].filter(Boolean).join(' · ');
    const label=document.createElement('label');label.textContent='내 기록 상태';
    const select=document.createElement('select');
    for (const [value,text] of Object.entries(labels)) select.add(new Option(text,value));
    select.value=row.status; label.append(select);
    select.addEventListener('change',async()=>{
      const previous=row.status;select.disabled=true;const current=generation;
      try {await api('/api/me/activities',{eventId:row.event_id,status:select.value});if(current!==generation)return;await refreshActivities();notice.textContent='활동 기록을 저장했어요.';}
      catch(error){if(current===generation){select.value=previous;notice.textContent=error.message;}}
      finally{select.disabled=false;}
    });
    card.append(heading,detail,label);list.append(card);
  }
}
async function refreshActivities() {
  const current=generation;const rows=await api('/api/me/activities');
  if(current===generation)showActivities(rows);
}
export function clearMember() {
  generation++; form.reset();list.replaceChildren();notice.textContent='';document.getElementById('memberCounts').textContent='';form.hidden=true;
}
export async function loadMember(user) {
  const current=++generation;
  if(!user?.id){notice.textContent='로그인하면 프로필과 활동 기록을 저장할 수 있어요.';form.hidden=true;return;}
  notice.textContent='프로필을 불러오고 있어요.';form.hidden=true;
  try {
    const [profile,rows]=await Promise.all([api('/api/me/profile'),api('/api/me/activities')]);
    if(current!==generation)return;
    for(const key of ['nickname','region','position','skill','bio'])form.elements[key].value=profile[key]||'';
    form.hidden=false;showActivities(rows);notice.textContent=profile.nickname?'':'닉네임을 정하고 나만의 프로필을 완성해 보세요.';
  }catch(error){if(current===generation)notice.textContent=error.message;}
}
form.addEventListener('submit',async event=>{
  event.preventDefault();const current=generation;const button=form.querySelector('button');button.disabled=true;
  try{await api('/api/me/profile',Object.fromEntries(new FormData(form)));if(current===generation)notice.textContent='프로필을 저장했어요. 다른 기기에서도 이어서 사용할 수 있어요.';}
  catch(error){if(current===generation)notice.textContent=error.message;}
  finally{button.disabled=false;}
});
document.getElementById('reloadActivities').addEventListener('click',()=>refreshActivities().catch(error=>{notice.textContent=error.message;}));

export function attachActivityActions(container,event) {
  const box=document.createElement('section');box.className='record-actions';
  const help=document.createElement('p');help.className='member-help';help.textContent='개인 기록만 저장돼요. 실제 신청은 원문에서 진행해 주세요.';
  const message=document.createElement('p');message.setAttribute('role','status');
  const select=document.createElement('select');select.setAttribute('aria-label','이 경기의 내 활동 상태');
  for(const [value,text] of Object.entries(labels))select.add(new Option(text,value));
  const button=document.createElement('button');button.type='button';button.className='member-primary';button.textContent='내 활동에 저장';
  const current=generation;button.disabled=true;
  api('/api/me/activities').then(rows=>{if(current!==generation)return;const saved=rows.find(r=>r.event_id===event.id);if(saved){select.value=saved.status;message.textContent='저장한 기록이에요. 상태를 변경할 수 있어요.';}button.disabled=false;}).catch(error=>{message.textContent=error.message;});
  button.addEventListener('click',async()=>{
    button.disabled=true;
    try{await api('/api/me/activities',{eventId:event.id,status:select.value});if(current!==generation)return;message.textContent='내 활동에 저장했어요.';await refreshActivities();}
    catch(error){if(current===generation)message.textContent=error.message;}
    finally{button.disabled=false;}
  });
  box.append(help,select,button,message);container.append(box);
}
