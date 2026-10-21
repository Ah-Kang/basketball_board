import test from 'node:test';
import assert from 'node:assert/strict';
import {createMemberStore,validateProfile} from '../lib/members.js';
const user={id:'11111111-1111-4111-8111-111111111111'};
const other='22222222-2222-4222-8222-222222222222';
const input={nickname:' 농구친구 ',region:'서울',position:'guard',skill:'beginner',bio:'반가워요'};
test('profile validation bounds fields and ignores identity overrides',()=>{
  assert.deepEqual(validateProfile({...input,user_id:other}),{...input,nickname:'농구친구'});
  assert.throws(()=>validateProfile({...input,nickname:''}));
  assert.throws(()=>validateProfile({...input,bio:'x'.repeat(301)}));
  assert.throws(()=>validateProfile({...input,position:'administrator'}));
});
test('profile writes always target authenticated owner',async()=>{
  const calls=[];
  const store=createMemberStore({env:{SUPABASE_URL:'https://test.invalid'},request:async(url,options)=>{
    calls.push({url,...options});return new Response(JSON.stringify([{user_id:user.id,...input}]));
  }});
  await store.saveProfile(user,{...input,user_id:other});
  assert.equal(calls.length,2);
  for(const call of calls)assert.ok(call.url.includes(`user_id=eq.${user.id}`));
  assert.equal(JSON.parse(calls[1].body).user_id,undefined);
});
test('anonymous member access never contacts database',async()=>{
  const store=createMemberStore({request:()=>{throw new Error('Unexpected database access');}});
  await assert.rejects(store.profile(null),/로그인/);
  await assert.rejects(store.activities({id:'injected&user_id=eq.other'}),/로그인/);
});
test('new activity preserves only event summary and binds owner',async()=>{
  const calls=[];
  const store=createMemberStore({env:{SUPABASE_URL:'https://test.invalid'},request:async(url,options)=>{
    calls.push({url,...options});
    return new Response(JSON.stringify(url.includes('profiles?')?[{user_id:user.id}]:options.method==='GET'?[]:[{}]));
  }});
  await store.saveActivity(user,'event-1','applied',{title:'농구',date:'2026-10-22',bodyText:'private body',contact:{phone:'private'}});
  const body=JSON.parse(calls.at(-1).body);
  assert.equal(body.user_id,user.id);
  assert.equal(body.status,'applied');
  assert.equal(body.event_snapshot.bodyText,undefined);
  assert.equal(body.event_snapshot.contact,undefined);
});
test('existing activity can be updated after source event disappears',async()=>{
  const calls=[];
  const store=createMemberStore({env:{SUPABASE_URL:'https://test.invalid'},request:async(url,options)=>{
    calls.push({url,...options});return new Response(JSON.stringify([{event_id:'old',user_id:user.id}]));
  }});
  await store.saveActivity(user,'old','attended',null);
  assert.equal(calls.at(-1).method,'PATCH');
  assert.ok(calls.at(-1).url.includes(`user_id=eq.${user.id}&event_id=eq.old`));
  assert.equal(JSON.parse(calls.at(-1).body).event_snapshot,undefined);
});
test('database failures return safe errors',async()=>{
  const store=createMemberStore({env:{SUPABASE_URL:'https://test.invalid'},request:async()=>new Response('secret sql details',{status:500})});
  await assert.rejects(store.profile(user),error=>!error.message.includes('secret')&&error.message.includes('저장소'));
});
