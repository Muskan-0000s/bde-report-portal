"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import * as XLSX from "xlsx";
import Papa from "papaparse";

function pad(n) { return String(n).padStart(2, "0"); }
function todayISO() { return new Date().toISOString().slice(0, 10); }
function addDays(iso, n) {
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}
function formatLong(iso) {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString(undefined, { weekday: "long", year: "numeric", month: "long", day: "numeric" });
}
function trySheetNameToISO(name) {
  const raw = String(name).trim();
  let m = raw.match(/^(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})$/);
  if (m) return `${m[1]}-${pad(m[2])}-${pad(m[3])}`;
  m = raw.match(/^(\d{1,2})[-\/](\d{1,2})[-\/](\d{4})$/);
  if (m) return `${m[3]}-${pad(m[2])}-${pad(m[1])}`;
  m = raw.match(/^(\d{1,2})[-\/](\d{1,2})[-\/](\d{2})$/);
  if (m) return `20${m[3]}-${pad(m[2])}-${pad(m[1])}`;
  const d = new Date(raw);
  if (!isNaN(d) && raw.length > 3) return d.toISOString().slice(0, 10);
  return null;
}
function headerNorm(s) { return String(s || "").toLowerCase().replace(/[^a-z]/g, ""); }

// Parses one sheet (as a 2D array from header:1) into one or more BDE records.
// Handles the real-world layout: a couple of header rows, then data rows starting
// wherever the S.no column becomes numeric. The "Name of BDE" column is only filled
// on the first row of that person's block, so it's forward-filled down the sheet.
function parseSheetToRecords(rows2D) {
  const dataStart = rows2D.findIndex((r) => {
    const c0 = r && r[0];
    return typeof c0 === "number" || (typeof c0 === "string" && /^\d+$/.test(c0.trim()));
  });
  if (dataStart === -1) return [];
  const headerRows = rows2D.slice(0, dataStart);

  const findCol = (matchers) => {
    for (const hr of headerRows) {
      for (let c = 0; c < hr.length; c++) {
        const norm = headerNorm(hr[c]);
        if (matchers.some((m) => norm.includes(m))) return c;
      }
    }
    return -1;
  };

  const nameCol = findCol(["nameofbde", "bdename", "bde"]);
  const orgCol = findCol(["nameoftheorg", "org", "company"]);
  const posCol = findCol(["positiveresponse", "positive"]);
  const meetCol = findCol(["meetingsscheduled", "meeting"]);
  const physCol = findCol(["physicalmeets", "physical"]);
  const statusCol = findCol(["status"]);

  const dataRows = rows2D.slice(dataStart).filter((r) => r.some((c) => String(c || "").trim() !== ""));
  let currentName = "";
  const order = [];
  const groups = {};

  dataRows.forEach((r) => {
    const nameVal = nameCol >= 0 ? String(r[nameCol] || "").trim() : "";
    if (nameVal) currentName = nameVal;
    const key = currentName || "Unnamed BDE";
    if (!groups[key]) {
      groups[key] = { totalCalls: 0, positiveResponse: 0, meetingsScheduled: 0, physicalMeets: [], statusRemarks: [] };
      order.push(key);
    }
    const org = orgCol >= 0 ? String(r[orgCol] || "").trim() : "";
    if (org) groups[key].totalCalls++;
    if (posCol >= 0 && String(r[posCol] || "").trim()) groups[key].positiveResponse++;
    if (meetCol >= 0 && String(r[meetCol] || "").trim()) groups[key].meetingsScheduled++;
    if (physCol >= 0) { const v = String(r[physCol] || "").trim(); if (v) groups[key].physicalMeets.push(v); }
    if (statusCol >= 0) { const v = String(r[statusCol] || "").trim(); if (v) groups[key].statusRemarks.push(v); }
  });

  return order.map((name) => ({
    bdeName: name,
    totalCalls: groups[name].totalCalls,
    positiveResponse: groups[name].positiveResponse,
    meetingsScheduled: groups[name].meetingsScheduled,
    physicalMeets: groups[name].physicalMeets.join("; "),
    physicalMeetsRemarks: groups[name].statusRemarks.join("; "),
  }));
}

export default function Page() {
  const [reportDate, setReportDate] = useState(todayISO());
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [savedDates, setSavedDates] = useState([]);
  const [importStatus, setImportStatus] = useState("");
  const [importError, setImportError] = useState("");
  const [syncError, setSyncError] = useState("");
  const debounceTimers = useRef({});

  const loadDates = useCallback(async () => {
    try {
      const res = await fetch("/api/reports?dates=1");
      const json = await res.json();
      setSavedDates(json.dates || []);
    } catch (e) { /* ignore */ }
  }, []);

  const loadRows = useCallback(async (date) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/reports?date=${date}`);
      const json = await res.json();
      setRows(json.rows || []);
    } catch (e) {
      setSyncError("Couldn't load data — check your internet connection or Supabase setup.");
    }
    setLoading(false);
  }, []);

  useEffect(() => { loadDates(); }, [loadDates]);
  useEffect(() => { loadRows(reportDate); }, [reportDate, loadRows]);

  const patchRow = (id, patch) => {
    // optimistic local update
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));
    // debounce the network write per row+field burst
    clearTimeout(debounceTimers.current[id]);
    debounceTimers.current[id] = setTimeout(async () => {
      try {
        const res = await fetch(`/api/reports/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(patch),
        });
        if (!res.ok) throw new Error();
        setSyncError("");
      } catch (e) {
        setSyncError("A change didn't save — check your connection and try again.");
      }
    }, 500);
  };

  const removeRow = async (id) => {
    setRows((rs) => rs.filter((r) => r.id !== id));
    try {
      await fetch(`/api/reports/${id}`, { method: "DELETE" });
    } catch (e) { setSyncError("Couldn't delete that row — try again."); }
  };

  const addManualRow = async () => {
    try {
      const res = await fetch("/api/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reportDate, bdeName: "", sortOrder: rows.length }),
      });
      const json = await res.json();
      if (json.row) setRows((rs) => [...rs, json.row]);
    } catch (e) { setSyncError("Couldn't add a row — try again."); }
  };

  const handleFiles = (files) => {
    setImportError(""); setImportStatus("");
    Array.from(files).forEach((file) => {
      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          const wb = XLSX.read(e.target.result, { type: "array", cellDates: true });
          const sheetNames = wb.SheetNames;
          let chosen = sheetNames[0];
          if (sheetNames.length > 1) {
            const match = sheetNames.find((n) => trySheetNameToISO(n) === reportDate);
            if (match) chosen = match;
          }
          const rows2D = XLSX.utils.sheet_to_json(wb.Sheets[chosen], { header: 1, defval: "" });
          const records = parseSheetToRecords(rows2D);
          if (!records.length) { setImportError(`No readable rows found in ${file.name}.`); return; }
          const res = await fetch("/api/reports/bulk", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ reportDate, rows: records }),
          });
          const json = await res.json();
          if (json.rows) {
            setRows((rs) => [...rs, ...json.rows]);
            setImportStatus(`${json.rows.length} BDE record(s) imported from ${file.name}${sheetNames.length > 1 ? ` (tab used: ${chosen})` : ""}.`);
          } else {
            setImportError(json.error || `Couldn't import ${file.name}.`);
          }
        } catch (err) {
          setImportError(`Couldn't read ${file.name}. Make sure it's a valid .xlsx, .xls, or .csv file.`);
        }
      };
      reader.readAsArrayBuffer(file);
    });
  };

  const totals = rows.reduce((a, r) => ({
    totalCalls: a.totalCalls + (r.absent ? 0 : Number(r.total_calls) || 0),
    positiveResponse: a.positiveResponse + (r.absent ? 0 : Number(r.positive_response) || 0),
    meetingsScheduled: a.meetingsScheduled + (r.absent ? 0 : Number(r.meetings_scheduled) || 0),
    present: a.present + (r.absent ? 0 : 1),
    absent: a.absent + (r.absent ? 1 : 0),
  }), { totalCalls: 0, positiveResponse: 0, meetingsScheduled: 0, present: 0, absent: 0 });

  const exportCSV = () => {
    const data = rows.map((r, idx) => ({
      "Sl No": idx + 1, "Name of BDE": r.bde_name,
      "Total calls made": r.absent ? "Absent" : r.total_calls,
      "Positive response": r.absent ? "Absent" : r.positive_response,
      "Meetings scheduled": r.absent ? "Absent" : r.meetings_scheduled,
      "Physical meets done": r.absent ? "Absent" : r.physical_meets,
      "Physical meets remarks": r.absent ? "" : r.physical_meets_remarks,
    }));
    const csv = Papa.unparse(data);
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `bde-overall-report-${reportDate}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  const printPDF = () => window.print();

  return (
    <div>
      <div className="header">
        <div className="title">BDE overall report portal</div>
        <div className="sub">Upload your team's daily report — it's read in automatically and synced live for everyone</div>
      </div>
      <div className="wrap">
        <div className="row" style={{ marginBottom: 20 }}>
          <button className="btn-icon" onClick={() => setReportDate((d) => addDays(d, -1))}>◀</button>
          <div>
            <label className="small">Report date</label>
            <input type="date" value={reportDate} onChange={(e) => setReportDate(e.target.value)} />
          </div>
          <button className="btn-icon" style={{ marginTop: 16 }} onClick={() => setReportDate((d) => addDays(d, 1))}>▶</button>
          <button className="btn-icon" style={{ marginTop: 16, color: "var(--teal)" }} onClick={() => setReportDate(todayISO())}>Today</button>
          {savedDates.length > 0 && (
            <div style={{ marginLeft: "auto" }}>
              <label className="small">Saved reports</label>
              <select value="" onChange={(e) => e.target.value && setReportDate(e.target.value)}>
                <option value="">Open a saved date…</option>
                {savedDates.map((d) => <option key={d} value={d}>{formatLong(d)}</option>)}
              </select>
            </div>
          )}
        </div>

        <div className="row" style={{ marginBottom: 16 }}>
          <span className="tag"><span className="sync-dot"></span>Live-synced across your team</span>
          {syncError && <span style={{ color: "var(--rust)", fontSize: 12 }}>{syncError}</span>}
        </div>

        <div className="dropzone" style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 14, marginBottom: 6 }}>Upload a team member's daily report (.xlsx, .xls, .csv)</div>
          <div style={{ fontSize: 12, color: "var(--slate)", marginBottom: 10 }}>
            Reads your existing call-log format automatically: counts calls, positive responses, and scheduled meetings,
            and pulls in Physical Meets / Status notes. If the workbook has one tab per date, the tab matching the report date above is picked automatically.
          </div>
          <input type="file" accept=".xlsx,.xls,.csv" multiple onChange={(e) => handleFiles(e.target.files)} />
        </div>

        {importError && <div className="warn warn-red">{importError}</div>}
        {importStatus && <div className="warn warn-green">{importStatus}</div>}

        <div className="row" style={{ justifyContent: "space-between", marginBottom: 12 }}>
          <div style={{ fontWeight: 700, fontSize: 18 }}>Overall total report — {formatLong(reportDate)}</div>
          <div className="row">
            <button className="btn btn-outline" onClick={addManualRow}>+ Add member manually</button>
            <button className="btn btn-outline" disabled={!rows.length} onClick={exportCSV}>⬇ Export CSV</button>
            <button className="btn btn-teal" disabled={!rows.length} onClick={printPDF}>🖨 Save as PDF</button>
          </div>
        </div>

        <div className="card" style={{ padding: 0, overflow: "auto" }}>
          <table>
            <thead>
              <tr>
                <th>Sl No</th><th>Name of BDE</th><th>Attendance</th><th>Total calls made</th>
                <th>Positive response</th><th>Meetings scheduled</th><th>Physical meets done</th>
                <th>Physical meets remarks</th><th>Remove</th>
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan="9" style={{ color: "var(--slate)", whiteSpace: "normal" }}>Loading…</td></tr>}
              {!loading && rows.length === 0 && (
                <tr><td colSpan="9" style={{ color: "var(--slate)", whiteSpace: "normal" }}>No BDE reports yet for this date — upload a file above, or add a member manually.</td></tr>
              )}
              {rows.map((r, idx) => (
                <tr key={r.id}>
                  <td>{idx + 1}</td>
                  <td>
                    <input type="text" style={{ width: 150 }} value={r.bde_name}
                      onChange={(e) => patchRow(r.id, { bdeName: e.target.value })} />
                  </td>
                  <td>
                    <label style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12 }}>
                      <input type="checkbox" checked={!!r.absent}
                        onChange={(e) => patchRow(r.id, { absent: e.target.checked })} /> Absent
                    </label>
                  </td>
                  {r.absent ? (
                    <td colSpan="3" className="absent-badge" style={{ textAlign: "center" }}>Absent on this date</td>
                  ) : (
                    <>
                      <td><input type="number" min="0" style={{ width: 64 }} value={r.total_calls}
                        onChange={(e) => patchRow(r.id, { totalCalls: Number(e.target.value) || 0 })} /></td>
                      <td><input type="number" min="0" style={{ width: 64 }} value={r.positive_response}
                        onChange={(e) => patchRow(r.id, { positiveResponse: Number(e.target.value) || 0 })} /></td>
                      <td><input type="number" min="0" style={{ width: 64 }} value={r.meetings_scheduled}
                        onChange={(e) => patchRow(r.id, { meetingsScheduled: Number(e.target.value) || 0 })} /></td>
                    </>
                  )}
                  <td>{r.absent ? "—" : (
                    <input type="text" placeholder="e.g. Visited 3 clients" style={{ width: 190 }} value={r.physical_meets}
                      onChange={(e) => patchRow(r.id, { physicalMeets: e.target.value })} />
                  )}</td>
                  <td>{r.absent ? "—" : (
                    <input type="text" placeholder="e.g. client site visit" style={{ width: 160 }} value={r.physical_meets_remarks}
                      onChange={(e) => patchRow(r.id, { physicalMeetsRemarks: e.target.value })} />
                  )}</td>
                  <td><button className="btn-icon" style={{ color: "var(--rust)", fontWeight: 700 }} onClick={() => removeRow(r.id)}>✕ Remove</button></td>
                </tr>
              ))}
            </tbody>
            {rows.length > 0 && (
              <tfoot>
                <tr>
                  <td></td><td>Total</td><td>{totals.present} present, {totals.absent} absent</td>
                  <td>{totals.totalCalls}</td><td>{totals.positiveResponse}</td><td>{totals.meetingsScheduled}</td>
                  <td></td><td></td><td></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
        <div className="footnote">
          Every field is editable and saves automatically for the whole team — fix a misspelled name or a number right in the table.
          Tick "Absent" for anyone who didn't work that day; their metrics are excluded from totals. "Save as PDF" opens your browser's print dialog — choose "Save as PDF" there to download it for email.
        </div>
      </div>

      <div id="print-area">
        <div style={{ padding: "32px", maxWidth: 900, margin: "0 auto" }}>
          <div style={{ fontWeight: 700, fontSize: 20 }}>Overall BDE report summary</div>
          <div style={{ color: "var(--slate)", fontSize: 14, marginTop: 4 }}>{formatLong(reportDate)}</div>
          <div style={{ borderTop: "1px solid #1C2331", margin: "16px 0" }}></div>
          <table>
            <thead>
              <tr style={{ borderBottom: "1px solid #1C2331" }}>
                <th>Sl No</th><th>Name of BDE</th><th>Total calls made</th><th>Positive response</th>
                <th>Meetings scheduled</th><th>Physical meets done</th><th>Remarks</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, idx) => (
                <tr key={r.id} style={{ borderBottom: "1px solid var(--line)" }}>
                  <td>{idx + 1}</td><td>{r.bde_name}</td>
                  {r.absent ? (
                    <td colSpan="5" style={{ fontWeight: 700 }}>Absent on this date</td>
                  ) : (
                    <>
                      <td>{r.total_calls}</td><td>{r.positive_response}</td><td>{r.meetings_scheduled}</td>
                      <td>{r.physical_meets}</td><td>{r.physical_meets_remarks}</td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ borderTop: "2px solid #1C2331", fontWeight: 700 }}>
                <td></td><td>Total ({totals.present} present, {totals.absent} absent)</td>
                <td>{totals.totalCalls}</td><td>{totals.positiveResponse}</td><td>{totals.meetingsScheduled}</td><td></td><td></td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
}
