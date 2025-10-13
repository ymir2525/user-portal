import { supabase } from './supabase'


export async function currentUser() {
const { data: { user } } = await supabase.auth.getUser()
return user
}


// Patients
export async function listPatients() {
return await supabase.from('patients').select('*').order('created_at', { ascending: false })
}
export async function createPatient(payload) {
return await supabase.from('patients').insert(payload).select().single()
}
export async function updatePatient(id, patch) {
return await supabase.from('patients').update(patch).eq('id', id).select().single()
}


// Records
export async function listRecords(patient_id) {
return await supabase.from('patient_records').select('*').eq('patient_id', patient_id).order('created_at', { ascending: false })
}
export async function createRecord(payload) {
return await supabase.from('patient_records').insert(payload).select().single()
}


// Documents (use Storage for files, this table keeps metadata)
export async function createDocument(payload) {
return await supabase.from('record_documents').insert(payload).select().single()
}


// Inventory
export async function listInventory() {
return await supabase.from('medicine_inventory').select('*').order('id', { ascending: true })
}
export async function updateInventory(id, patch) {
return await supabase.from('medicine_inventory').update(patch).eq('id', id).select().single()
}

export async function uploadDocument(file, keyPrefix = '') {
const ext = file.name.split('.').pop()
const fileName = `${keyPrefix}${crypto.randomUUID()}.${ext}`
const { data, error } = await supabase.storage.from('documents').upload(fileName, file)
if (error) throw error
const { data: pub } = supabase.storage.from('documents').getPublicUrl(fileName)
return { path: fileName, url: pub.publicUrl }
}