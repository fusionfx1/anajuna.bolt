import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://pmwlukvixofqqjehlokj.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBtd2x1a3ZpeG9mcXFqZWhsb2tqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzczMDczODUsImV4cCI6MjA5Mjg4MzM4NX0.IGrvvmUujFuXZI85CYO-GYRUXQxS6jzo76TDM6WQUyU'

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

async function setupAuth() {
  const email = 'kittipong.fx@gmail.com'
  const password = '@Fusion1988'

  try {
    // 1. Sign up user (will require email confirmation)
    console.log('📝 Signing up user...')
    const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
    })

    if (signUpError) {
      console.error('❌ Sign up error:', signUpError.message)
      return
    }

    console.log('✅ Sign up successful')
    console.log('User ID:', signUpData.user?.id)

    // 2. Confirm email via edge function
    console.log('📧 Confirming email via edge function...')
    const confirmRes = await fetch(
      `${SUPABASE_URL}/functions/v1/confirm-user-email`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({ email }),
      }
    )

    const confirmData = await confirmRes.json()
    if (!confirmRes.ok) {
      console.error('❌ Email confirmation error:', confirmData.error)
      return
    }

    console.log('✅ Email confirmed')

    // 3. Test login
    console.log('🔐 Testing login...')
    const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (signInError) {
      console.error('❌ Sign in error:', signInError.message)
      return
    }

    console.log('✅ Login successful')
    console.log('Session:', signInData.session?.access_token.slice(0, 20) + '...')
    console.log('\n🎉 Auth setup complete! You can now log in via the app.')
  } catch (error) {
    console.error('❌ Error:', error)
  }
}

setupAuth()
