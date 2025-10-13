// src/components/past/PastDocumentsView.jsx
import React, { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";

export default function PastDocumentsView({ rec, onBack }) {
  const [docs, setDocs] = useState([]);
  const [loadingDocs, setLoadingDocs] = useState(true);
  const [err, setErr] = useState("");

  useEffect(() => {
    if (!rec?.id) return;
    let mounted = true;

    (async () => {
      try {
        setLoadingDocs(true);
        setErr("");

        const { data, error } = await supabase
          .from("record_documents")
          .select("*")
          .eq("record_id", rec.id)
          .order("created_at", { ascending: false });

        if (error) throw error;
        if (!mounted) return;
        setDocs(Array.isArray(data) ? data : []);
      } catch (e) {
        console.error(e);
        if (!mounted) return;
        setErr(e.message || "Failed to load documents");
      } finally {
        if (mounted) setLoadingDocs(false);
      }
    })();

    return () => { mounted = false; };
  }, [rec?.id]);

  return (
    <div className="bg-white border rounded p-4">
      <div className="text-xl font-semibold mb-4">Document Request</div>

      <div className="border rounded bg-orange-50 border-orange-200 p-4">
        {loadingDocs && <div className="text-sm text-gray-600">Loading…</div>}
        {err && !loadingDocs && (
          <div className="text-sm text-red-700 mb-2">{err}</div>
        )}

        {!loadingDocs && !err && docs.length === 0 && (
          <div className="text-sm text-gray-500">No documents for this visit yet.</div>
        )}

        {!loadingDocs && !err && docs.length > 0 && (
          <div className="space-y-2">
            {docs.map((d) => (
              <div key={d.id} className="flex items-center justify-between border rounded px-3 py-2 bg-white">
                <div className="text-sm">
                  <b>{String(d.type).toUpperCase()}</b> •{" "}
                  {new Date(d.created_at).toLocaleString()}
                </div>
                {d.url ? (
                  <a className="underline text-sm" href={d.url} target="_blank" rel="noreferrer">
                    Open
                  </a>
                ) : (
                  <span className="text-xs text-gray-500">no file URL</span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="flex items-center justify-between mt-4">
        <button onClick={onBack} className="px-3 py-1 rounded bg-orange-200 hover:bg-orange-300 text-sm">
          Back
        </button>
        <button
          className="px-3 py-1 rounded bg-green-300 text-white opacity-60 cursor-not-allowed text-sm"
          title="Create new documents from the Day tab"
        >
          Save as pdf
        </button>
      </div>
    </div>
  );
}
