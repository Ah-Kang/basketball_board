export function validateProfile(input) {
  if (!input || typeof input !== 'object') throw new Error('프로필 내용을 확인해 주세요.');
  const result = {};
  for (const [key, limit] of Object.entries({nickname:24, region:60, bio:300, position:20, skill:20})) {
    if (typeof input[key] !== 'string' || input[key].trim().length > limit) throw new Error('프로필 입력 길이를 확인해 주세요.');
    result[key] = input[key].trim();
  }
  if (!result.nickname) throw new Error('닉네임을 입력해 주세요.');
  if (!['','guard','forward','center','any'].includes(result.position) || !['','beginner','intermediate','advanced'].includes(result.skill)) throw new Error('포지션과 실력을 다시 선택해 주세요.');
  return result;
}

export function createMemberStore({env=process.env, request=fetch}={}) {
  async function db(path, method='GET', body, prefer) {
    const response = await request(`${env.SUPABASE_URL?.replace(/\/$/,'')}/rest/v1/${path}`, {
      method, headers:{apikey:env.SUPABASE_SERVICE_ROLE_KEY, authorization:`Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        'content-type':'application/json', ...(prefer ? {prefer} : {})},
      ...(body === undefined ? {} : {body:JSON.stringify(body)}), signal:AbortSignal.timeout(10000)
    });
    if (!response.ok) throw new Error('프로필 저장소에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.');
    return response.status === 204 ? null : response.json();
  }
  function owner(user) {
    if (!user?.id || !/^[0-9a-f-]{36}$/i.test(user.id)) throw new Error('다시 로그인해 주세요.');
    return encodeURIComponent(user.id);
  }
  async function profile(user) {
    const id=owner(user);
    const rows=await db(`profiles?user_id=eq.${id}&select=*`);
    if (rows[0]) return rows[0];
    await db('profiles?on_conflict=user_id','POST',{user_id:user.id},'resolution=ignore-duplicates,return=representation');
    return (await db(`profiles?user_id=eq.${id}&select=*`))[0];
  }
  async function saveProfile(user,input) {
    const data=validateProfile(input);
    await profile(user);
    return (await db(`profiles?user_id=eq.${owner(user)}`,'PATCH',{...data,updated_at:new Date().toISOString()},'return=representation'))[0];
  }
  async function activities(user) {
    return db(`member_activities?user_id=eq.${owner(user)}&select=*&order=updated_at.desc&limit=200`);
  }
  async function saveActivity(user,eventId,status,event) {
    const id=owner(user);
    if (typeof eventId !== 'string' || !eventId || eventId.length>300 || !['interested','applied','attended','cancelled'].includes(status)) throw new Error('활동 상태를 확인해 주세요.');
    await profile(user);
    const path=`member_activities?user_id=eq.${id}&event_id=eq.${encodeURIComponent(eventId)}`;
    const existing=await db(`${path}&select=event_id`);
    if (existing.length) return (await db(path,'PATCH',{status,updated_at:new Date().toISOString()},'return=representation'))[0];
    if (!event) throw new Error('일정을 찾지 못했습니다. 새로고침해 주세요.');
    const event_snapshot={title:event.title,date:event.date,startTime:event.startTime,area:event.area,venue:event.venue,sourceUrl:event.sourceUrl,type:event.type};
    return (await db('member_activities?on_conflict=user_id,event_id','POST',{
      user_id:user.id,event_id:eventId,status,event_snapshot,updated_at:new Date().toISOString()
    },'resolution=merge-duplicates,return=representation'))[0];
  }
  return {profile,saveProfile,activities,saveActivity};
}
