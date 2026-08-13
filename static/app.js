// REPLACE THESE WITH YOUR ACTUAL KEYS FROM SUPABASE
const SUPABASE_URL = 'https://kvlishlwkxdnlbatepsr.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt2bGlzaGx3a3hkbmxiYXRlcHNyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk1NjMxNjIsImV4cCI6MjA5NTEzOTE2Mn0.tcl14-RfH6C_04gOm8T_cu9PlEFOmWM_BxD0PVIoXHQ';

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// --- OTP AUTHENTICATION LOGIC ---
let userEmailForVerification = '';

async function requestOTP(event) {
    event.preventDefault();
    
    const emailInput = document.getElementById('email').value;
    const messageEl = document.getElementById('auth-message');
    const submitBtn = document.getElementById('request-btn');

    submitBtn.innerText = 'Sending...';
    submitBtn.disabled = true;
    console.log("Attempting to send OTP to:", emailInput);

    const { data, error } = await supabaseClient.auth.signInWithOtp({
        email: emailInput,
        options: {
            shouldCreateUser: true 
        }
    });

    if (error) {
        console.error("SUPABASE OTP ERROR:", error);
        messageEl.innerText = error.message;
        messageEl.className = 'error';
        submitBtn.innerText = 'Send Verification Code';
        submitBtn.disabled = false;
    } else {
        console.log("OTP Sent Successfully:", data);
        userEmailForVerification = emailInput;
        document.getElementById('email-form').classList.add('hidden');
        document.getElementById('otp-form').classList.remove('hidden');
        messageEl.innerText = 'Code sent! Check your inbox.';
        messageEl.className = 'success';
    }
}

async function verifyOTP(event) {
    event.preventDefault();
    
    const otpInput = document.getElementById('otp').value.trim();
    const messageEl = document.getElementById('auth-message');
    const verifyBtn = document.getElementById('verify-btn');

    verifyBtn.innerText = 'Verifying...';
    verifyBtn.disabled = true;
    console.log("Attempting to verify code:", otpInput);

    // 1st Try: Standard Email OTP
    let { data: { session }, error } = await supabaseClient.auth.verifyOtp({
        email: userEmailForVerification,
        token: otpInput,
        type: 'email'
    });

    // 2nd Try: Magic Link format
    if (error) {
        console.log("Standard OTP failed, trying Magic Link format...");
        const fallback = await supabaseClient.auth.verifyOtp({
            email: userEmailForVerification,
            token: otpInput,
            type: 'magiclink'
        });
        session = fallback.data?.session;
        error = fallback.error;
    }

    // 3rd Try: New Signup format
    if (error) {
        console.log("Magic Link failed, trying New Signup format...");
        const finalFallback = await supabaseClient.auth.verifyOtp({
            email: userEmailForVerification,
            token: otpInput,
            type: 'signup'
        });
        session = finalFallback.data?.session;
        error = finalFallback.error;
    }

    // Final result handler
    if (error) {
        console.error("FINAL VERIFICATION ERROR:", error);
        messageEl.innerText = "Invalid or expired code. Please request a new one.";
        messageEl.className = 'error';
        verifyBtn.innerText = 'Verify & Login';
        verifyBtn.disabled = false;
    } else if (session) {
        console.log("Login Successful!", session);
        
        // Generate a random session token for single-device lockdown
        const randomSessionToken = Math.random().toString(36).substring(2) + Date.now().toString(36);
        localStorage.setItem('cbt_session_token', randomSessionToken);

        // Update the token in the database
        await supabaseClient
            .from('profiles')
            .update({ current_session_token: randomSessionToken })
            .eq('id', session.user.id);

       // UPGRADED SMART REDIRECT LOGIC
        const { data: profileData } = await supabaseClient
            .from('profiles')
            .select('full_name, role')
            .eq('id', session.user.id)
            .single();

        if (profileData.role === 'admin') {
            // 1. It's the boss! Send to Admin Panel
            window.location.href = '../admin/';
        } else if (!profileData || !profileData.full_name) {
            // 2. New student! Send to bio-data
            window.location.href = '../bio-data/';
        } else {
            // 3. Returning student! Send to dashboard
            window.location.href = '../dashboard/';
        }
    }
}

// Apply local Bonaza fallback to a profile object if DB update hasn't propagated.
function applyBonazaFallback(profile) {
    try {
        if (!profile) return profile;
        const id = profile.id || profile.user_id || null;
        if (!profile.has_paid && id && localStorage.getItem('bonaza_' + id)) {
            profile.has_paid = true;
            profile.has_qbank_access = true;
        }
    } catch (e) { /* ignore */ }
    return profile;
}