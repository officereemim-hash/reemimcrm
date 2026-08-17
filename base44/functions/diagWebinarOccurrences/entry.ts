import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
const SECRET = 'diag_zx9Qm7';
async function tok() {
  const a=Deno.env.get('ZOOM_ACCOUNT_ID'),c=Deno.env.get('ZOOM_CLIENT_ID'),s=Deno.env.get('ZOOM_CLIENT_SECRET');
  if(!a||!c||!s) return null;
  const r=await fetch(`https://zoom.us/oauth/token?grant_type=account_credentials&account_id=${a}`,{method:'POST',headers:{Authorization:`Basic ${btoa(`${c}:${s}`)}`,'Content-Type':'application/x-www-form-urlencoded'}});
  return r.ok?(await r.json()).access_token:null;
}
Deno.serve(async (req) => {
  const url=new URL(req.url);
  if(url.searchParams.get('secret')!==SECRET) return Response.json({error:'forbidden'},{status:401});
  const base44=createClientFromRequest(req);
  const t=await tok(); if(!t) return Response.json({error:'no_token'},{status:500});
  // list ALL webinars for the host to detect any accidental duplicates
  const wid=(await base44.asServiceRole.entities.SystemSetting.filter({key:'zoom_webinar_id'}))[0]?.value;
  const w=await (await fetch(`https://api.zoom.us/v2/webinars/${wid}`,{headers:{Authorization:`Bearer ${t}`}})).json();
  const occ=(w.occurrences||[]).map(o=>({start:o.start_time,status:o.status})).sort((a,b)=>String(a.start).localeCompare(String(b.start)));
  const host=w.host_id;
  const all=await (await fetch(`https://api.zoom.us/v2/users/${host}/webinars?page_size=50`,{headers:{Authorization:`Bearer ${t}`}})).json();
  // כל המשתמשים בחשבון + הוובינרים של כל אחד — כדי לאתר תחת מי הוובינר יושב בפועל
  const usersRes=await (await fetch(`https://api.zoom.us/v2/users?page_size=30`,{headers:{Authorization:`Bearer ${t}`}})).json();
  const perUser=[];
  for(const u of (usersRes.users||[])){
    const lw=await (await fetch(`https://api.zoom.us/v2/users/${u.id}/webinars?page_size=30`,{headers:{Authorization:`Bearer ${t}`}})).json();
    perUser.push({email:u.email,user_id:u.id,user_type:u.type,status:u.status,is_webinar_host:u.id===host,webinars:(lw.webinars||[]).map(x=>({id:x.id,topic:x.topic,type:x.type,start:x.start_time}))});
  }
  return Response.json({
    system_zoom_webinar_id: wid,
    webinar: { id:w.id, topic:w.topic, type:w.type, host_id:host, host_email:w.host_email||null, occurrences_count:occ.length, first:occ[0], nearest_future:occ.find(o=>new Date(o.start).getTime()>Date.now()), has_start_url:!!w.start_url, registration_url:w.registration_url||null },
    all_host_webinars: (all.webinars||[]).map(x=>({id:x.id, topic:x.topic, type:x.type, start:x.start_time})),
    account_users: perUser,
  });
});
