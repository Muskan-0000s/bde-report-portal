import { NextResponse } from "next/server";
import { supabaseServer } from "../../../../lib/supabaseServer";

export async function POST(request) {
  const body = await request.json(); // { reportDate, rows: [{ bdeName, totalCalls, positiveResponse, meetingsScheduled, physicalMeets, physicalMeetsRemarks }] }
  if (!body.reportDate || !Array.isArray(body.rows)) {
    return NextResponse.json({ error: "reportDate and rows[] are required" }, { status: 400 });
  }
  const supabase = supabaseServer();

  // Find the current max sort_order for this date so new rows append at the end.
  const { data: existing, error: existingErr } = await supabase
    .from("bde_reports")
    .select("sort_order")
    .eq("report_date", body.reportDate)
    .order("sort_order", { ascending: false })
    .limit(1);
  if (existingErr) return NextResponse.json({ error: existingErr.message }, { status: 500 });
  let nextOrder = existing.length ? existing[0].sort_order + 1 : 0;

  const payload = body.rows.map((r) => ({
    report_date: body.reportDate,
    bde_name: r.bdeName || "",
    total_calls: r.totalCalls || 0,
    positive_response: r.positiveResponse || 0,
    meetings_scheduled: r.meetingsScheduled || 0,
    physical_meets: r.physicalMeets || "",
    physical_meets_remarks: r.physicalMeetsRemarks || "",
    absent: false,
    sort_order: nextOrder++,
  }));

  const { data, error } = await supabase.from("bde_reports").insert(payload).select();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ rows: data });
}
