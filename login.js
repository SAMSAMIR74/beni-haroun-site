// Login credentials
const VALID_USERNAME = 'beni haroun';
const VALID_PASSWORD = 'brbh43';

document.getElementById('loginForm').addEventListener('submit', (e) => {
    e.preventDefault();

    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;
    const errorMessage = document.getElementById('errorMessage');

    // Validate credentials
    if (username === VALID_USERNAME && password === VALID_PASSWORD) {
        // Store login state
        localStorage.setItem('isLoggedIn', 'true');
        localStorage.setItem('loginTime', new Date().toISOString());

        // Navigate to home page (Web version)
        window.location.href = 'home.html';
    } else {
        // Show error message
        errorMessage.textContent = 'Nom d\'utilisateur ou mot de passe incorrect';
        errorMessage.classList.remove('hidden');

        // Clear password field
        document.getElementById('password').value = '';

        // Hide error after 3 seconds
        setTimeout(() => {
            errorMessage.classList.add('hidden');
        }, 3000);
    }
});

// Clear any existing login state on load
window.addEventListener('DOMContentLoaded', () => {
    localStorage.removeItem('isLoggedIn');
});
