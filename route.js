import { NextResponse } from "next/server";
import { supabaseServer } from "../../../../lib/supabaseServer";

const FIELD_MAP = {
  bdeName: "bde_name",
  totalCalls: "total_calls",
  positiveResponse: "positive_response",
  meetingsScheduled: "meetings_scheduled",
  physicalMeets: "physical_meets",
  physicalMeetsRemarks: "physical_meets_remarks",
  absent: "absent",
  sortOrder: "sort_order",
};

export async function PATCH(request, { params }) {
  const body = await request.json();
  const supabase = supabaseServer();
  const patch = { updated_at: new Date().toISOString() };
  for (const key of Object.keys(FIELD_MAP)) {
    if (key in body) patch[FIELD_MAP[key]] = body[key];
  }
  const { data, error } = await supabase
    .from("bde_reports")
    .update(patch)
    .eq("id", params.id)
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ row: data });
}

export async function DELETE(request, { params }) {
  const supabase = supabaseServer();
  const { error } = await supabase.from("bde_reports").delete().eq("id", params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
