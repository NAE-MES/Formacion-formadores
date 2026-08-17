const loginForm = document.querySelector('#loginForm');
const usernameInput = document.querySelector('#adminUsername');
const passwordInput = document.querySelector('#adminPassword');
const loginError = document.querySelector('#loginError');

checkExistingSession();

loginForm.addEventListener('submit', async event => {
  event.preventDefault();
  loginError.textContent = '';
  try {
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({
        username: usernameInput.value.trim(),
        password: passwordInput.value,
      }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.message || body.error || 'No autorizado.');
    window.location.assign('/home');
  } catch (error) {
    passwordInput.value = '';
    loginError.textContent = 'Usuario o contraseña inválidos.';
    passwordInput.focus();
  }
});

async function checkExistingSession() {
  const response = await fetch('/api/auth/me', {
    credentials: 'same-origin',
  }).catch(() => null);
  if (response?.ok) window.location.replace('/home');
}
