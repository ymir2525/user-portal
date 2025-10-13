import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { Navigate } from 'react-router-dom'


export default function RequireAuth({ children }) {
const [loading, setLoading] = useState(true)
const [session, setSession] = useState(null)


useEffect(() => {
supabase.auth.getSession().then(({ data }) => {
setSession(data.session); setLoading(false)
})
const { data: sub } = supabase.auth.onAuthStateChange((_event, sess) => setSession(sess))
return () => sub.subscription.unsubscribe()
}, [])


if (loading) return null
if (!session) return <Navigate to="/login" replace />
return children
}