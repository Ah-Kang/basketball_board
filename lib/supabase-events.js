const tableName = process.env.SUPABASE_EVENTS_TABLE || "events";

export function isSupabaseConfigured() {
  return Boolean(process.env.SUPABASE_URL && supabaseServiceKey());
}

export async function fetchEventsFromSupabase() {
  const url = supabaseRestUrl(`/${tableName}?select=*&order=date.asc,start_time.asc`);
  const response = await fetch(url, {
    headers: supabaseHeaders()
  });
  if (!response.ok) {
    throw new Error(`Supabase 이벤트 조회 실패: ${response.status} ${await response.text()}`);
  }
  const rows = await response.json();
  return rows.map(eventFromRow);
}

export async function upsertEventsToSupabase(events) {
  if (!events.length) return [];
  const rows = events.map(eventToRow);
  const response = await fetch(supabaseRestUrl(`/${tableName}?on_conflict=id`), {
    method: "POST",
    headers: {
      ...supabaseHeaders(),
      "content-type": "application/json",
      prefer: "resolution=merge-duplicates,return=representation"
    },
    body: JSON.stringify(rows)
  });
  if (!response.ok) {
    throw new Error(`Supabase 이벤트 저장 실패: ${response.status} ${await response.text()}`);
  }
  return response.json();
}

function supabaseRestUrl(path) {
  return `${process.env.SUPABASE_URL.replace(/\/$/, "")}/rest/v1${path}`;
}

function supabaseHeaders() {
  const key = supabaseServiceKey();
  return {
    apikey: key,
    authorization: `Bearer ${key}`
  };
}

function supabaseServiceKey() {
  return process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || "";
}

function eventToRow(event) {
  return {
    id: event.id,
    title: event.title,
    type: event.type,
    date: event.date,
    start_time: event.startTime,
    end_time: event.endTime,
    area: event.area,
    venue: event.venue,
    fee: Number(event.fee || 0),
    spots: Number(event.spots || 0),
    status: event.status,
    level: event.level,
    source_cafe: event.sourceCafe,
    source_board_key: event.sourceBoardKey,
    source_url: event.sourceUrl,
    summary: event.summary,
    body_text: event.bodyText || "",
    contact: event.contact || null,
    collected_by_user_id: event.collectedByUserId || "default",
    access_mode: event.accessMode || "authenticated",
    collected_at: event.collectedAt || new Date().toISOString(),
    raw: event
  };
}

function eventFromRow(row) {
  return {
    id: row.id,
    title: row.title,
    type: row.type,
    date: row.date,
    startTime: row.start_time,
    endTime: row.end_time,
    area: row.area,
    venue: row.venue,
    fee: row.fee,
    spots: row.spots,
    status: row.status,
    level: row.level,
    sourceCafe: row.source_cafe,
    sourceBoardKey: row.source_board_key,
    sourceUrl: row.source_url,
    summary: row.summary,
    bodyText: row.body_text,
    contact: row.contact,
    collectedByUserId: row.collected_by_user_id,
    accessMode: row.access_mode,
    collectedAt: row.collected_at
  };
}
