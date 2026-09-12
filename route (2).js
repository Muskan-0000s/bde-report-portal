import { NextResponse } from "next/server";
import { supabaseServer } from "../../../lib/supabaseServer";

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const date = searchParams.get("date");
  const wantDates = searchParams.get("dates");
  const supabase = supabaseServer();

  if (wantDates) {
    const { data, error } = await supabase
      .from("bde_reports")
      .select("report_date")
      .order("report_date", { ascending: false });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    const dates = [...new Set(data.map((r) => r.report_date))];
    return NextResponse.json({ dates });
  }

  if (!date) return NextResponse.json({ error: "date query param is required" }, { status: 400 });

  const { data, error } = await supabase
    .from("bde_reports")
    .select("*")
    .eq("report_date", date)
    .order("sort_order", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ rows: data });
}

export async function POST(request) {
  const body = await request.json();
  const supabase = supabaseServer();
  const { data, error } = await supabase
    .from("bde_reports")
    .insert({
      report_date: body.reportDate,
      bde_name: body.bdeName || "",
      total_calls: body.totalCalls || 0,
      positive_response: body.positiveResponse || 0,
      meetings_scheduled: body.meetingsScheduled || 0,
      physical_meets: body.physicalMeets || "",
      physical_meets_remarks: body.physicalMeetsRemarks || "",
      absent: !!body.absent,
      sort_order: body.sortOrder || 0,
    })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ row: data });
}
