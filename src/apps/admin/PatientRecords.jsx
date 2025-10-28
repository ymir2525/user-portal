// src/apps/admin/PatientRecords.jsx
import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase";
import "./PatientRecords.css"; // ← NEW: external CSS

export default function PatientRecords() {
  const [err, setErr] = useState("");
  const [families, setFamilies] = useState([]); // [{ family_number, surname }]
  const [doctorName, setDoctorName] = useState("");
  const [q, setQ] = useState("");

  const [showModal, setShowModal] = useState(false);
  const [selectedFamNo, setSelectedFamNo] = useState("");
  const [members, setMembers] = useState([]);
  const [loadingMembers, setLoadingMembers] = useState(false);

  const loadFamilies = async () => {
    try {
      setErr("");
      const { data } = await supabase
        .from("patients")
        .select("id, family_number, surname")
        .order("family_number", { ascending: true });
      const map = new Map();
      (data || []).forEach((p) => {
        const fam = p.family_number || "—";
        if (!map.has(fam)) map.set(fam, { family_number: fam, surname: p.surname || "—" });
      });
      setFamilies(Array.from(map.values()));
    } catch (e) {
      console.error("❌ Failed to load families:", e);
      setErr(e.message || "Failed to load families");
      setFamilies([]);
    }
  };

  const loadDoctorInCharge = async () => {
    try {
      const { data } = await supabase
        .from("profiles")
        .select("surname, firstname, middle_initial, role")
        .eq("role", "Doctor")
        .order("surname", { ascending: true })
        .limit(1)
        .maybeSingle();
      if (!data) { setDoctorName(""); return; }
      const name = [data.firstname, data.middle_initial ? `${data.middle_initial}.` : "", data.surname]
        .filter(Boolean).join(" ");
      setDoctorName(name);
    } catch {
      setDoctorName("");
    }
  };

  const openFamily = async (familyNumber) => {
    setSelectedFamNo(familyNumber);
    setShowModal(true);
    setLoadingMembers(true);
    try {
      const { data } = await supabase
        .from("patients")
        .select("id, family_number, surname, first_name, middle_name, created_at")
        .eq("family_number", familyNumber)
        .order("surname", { ascending: true })
        .order("first_name", { ascending: true });
      setMembers(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error("❌ Failed to load family members:", e);
      setMembers([]);
    } finally {
      setLoadingMembers(false);
    }
  };

  useEffect(() => {
    loadFamilies();
    loadDoctorInCharge();

    const chPatients = supabase
      .channel("patients_realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "patients" }, loadFamilies)
      .subscribe();

    const chUsers = supabase
      .channel("doctor_realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "profiles" }, loadDoctorInCharge)
      .subscribe();

    return () => {
      supabase.removeChannel(chPatients);
      supabase.removeChannel(chUsers);
    };
  }, []);

  const term = q.trim().toLowerCase();
  const filteredFamilies = useMemo(() => {
    if (!term) return families;
    return families.filter((f) => {
      const fam = (f.family_number || "").toLowerCase();
      const sur = (f.surname || "").toLowerCase();
      const doc = (doctorName || "").toLowerCase();
      return fam.includes(term) || sur.includes(term) || (doc && doc.includes(term));
    });
  }, [families, doctorName, term]);

  return (
    <section className="pr-section">
      <h3 className="pr-title">Patient Records</h3>

      <div className="pr-search">
        <div className="pr-search__wrap">
          <input
            className="pr-input"
            placeholder="Search by family number, surname, or doctor…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        {err && (
          <div className="pr-alert pr-alert--error">
            {err}
          </div>
        )}
      </div>

      <div className="pr-card">
        <table className="pr-table">
          <thead>
            <tr>
              <th className="w-180">Family Number</th>
              <th>Surname</th>
              <th className="w-220">Doctor-in-Charge</th>
            </tr>
          </thead>
          <tbody>
            {filteredFamilies.length ? (
              filteredFamilies.map((f) => (
                <tr
                  key={f.family_number}
                  className="row--clickable"
                  onClick={() => openFamily(f.family_number)}
                  title="View family members"
                >
                  <td>{f.family_number}</td>
                  <td>{f.surname}</td>
                  <td>{doctorName || "—"}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={3} className="pr-empty">No families found.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {showModal && (
        <div className="modal">
          <div className="modal__card">
            <div className="modal__head">
              <h4 className="modal__title">Family {selectedFamNo} — Members</h4>
              <button onClick={() => setShowModal(false)} className="modal__close" aria-label="Close">✕</button>
            </div>

            <div className="pr-card">
              <table className="pr-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th className="w-180">Created</th>
                    <th className="w-120">Patient ID</th>
                  </tr>
                </thead>
                <tbody>
                  {loadingMembers ? (
                    <tr><td colSpan={3} className="pr-empty">Loading…</td></tr>
                  ) : members.length ? (
                    members.map((m) => (
                      <tr key={m.id}>
                        <td>
                          {[m.first_name, m.middle_name, m.surname].filter(Boolean).join(" ")}
                        </td>
                        <td>
                          {m.created_at ? new Date(m.created_at).toLocaleDateString() : "—"}
                        </td>
                        <td className="truncate">{m.id}</td>
                      </tr>
                    ))
                  ) : (
                    <tr><td colSpan={3} className="pr-empty">No members in this family.</td></tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="modal__actions">
              <button onClick={() => setShowModal(false)} className="btn btn--light">Close</button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
