// Makes the navbar login button dynamic based on authentication status

// Function to check if user is logged in
function isUserLoggedIn() {
    const token = localStorage.getItem('token');
    if (!token) return false;
    
    try {
        // Check if token is expired by decoding it
        const tokenPayload = JSON.parse(atob(token.split('.')[1]));
        const expirationTime = tokenPayload.exp * 1000; // Convert to milliseconds
        return Date.now() < expirationTime;
    } catch (e) {
        return false;
    }
}

// Function to get user name from token
function getUserName() {
    return localStorage.getItem('userName') || 'Usuario';
}

// Function to handle logout
function handleLogout() {
    localStorage.removeItem('token');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('userName');
    window.location.href = 'landing-page.html';
}

// Function to update navbar based on auth status
function updateNavbar() {
    // Find all navbar login button containers
    const navbarAuthContainers = document.querySelectorAll('.navbar .d-flex');
    
    navbarAuthContainers.forEach(container => {
        if (isUserLoggedIn()) {
            // User is logged in - show user menu
            container.innerHTML = `
                <div class="dropdown">
                    <button class="btn btn-link nav-link dropdown-toggle d-flex align-items-center" 
                            type="button" 
                            id="userDropdown" 
                            data-bs-toggle="dropdown" 
                            aria-expanded="false"
                            style="text-decoration: none; color: #7D6666;">
                        <svg width="30" height="30" viewBox="0 0 24 24" fill="#D4B2A7" style="margin-right: 8px;">
                            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 3c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3 1.34-3 3-3zm0 14.2c-2.5 0-4.71-1.28-6-3.22.03-1.99 4-3.08 6-3.08 1.99 0 5.97 1.09 6 3.08-1.29 1.94-3.5 3.22-6 3.22z"/>
                        </svg>
                        <span style="margin-right: 5px;">${getUserName()}</span>
                    </button>
                    <ul class="dropdown-menu dropdown-menu-end" aria-labelledby="userDropdown">
                        <li><a class="dropdown-item" href="dashboard.html">Mi Dashboard</a></li>
                        <li><hr class="dropdown-divider"></li>
                        <li><a class="dropdown-item" href="#" id="logout-link">Cerrar Sesión</a></li>
                    </ul>
                </div>
            `;
        } else {
            // User is not logged in - show login button
            container.innerHTML = `
                <a class="btn btn-secondary px-5 py-3 rounded-4" href="login.html" role="button">Log In</a>
            `;
        }
    });
    
    // Re-attach event listeners after updating the navbar
    attachLogoutListeners();
}

// Update navbar on page load
document.addEventListener('DOMContentLoaded', function() {
    updateNavbar();
    
    // Also update the footer auth buttons if they exist
    updateFooterAuthButtons();
    
    // Add event listeners for logout links
    setTimeout(() => {
        // Navbar logout link
        const logoutLink = document.getElementById('logout-link');
        if (logoutLink) {
            logoutLink.addEventListener('click', function(e) {
                e.preventDefault();
                handleLogout();
            });
        }
        
        // Footer logout link
        const footerLogout = document.getElementById('footer-logout');
        if (footerLogout) {
            footerLogout.addEventListener('click', function(e) {
                e.preventDefault();
                handleLogout();
            });
        }
    }, 100); // Small delay to ensure DOM is updated
});

// Function to update footer auth buttons
function updateFooterAuthButtons() {
    const footerAuthButtons = document.querySelector('.footer-container .auth-buttons');
    
    if (footerAuthButtons) {
        if (isUserLoggedIn()) {
            // User is logged in - show dashboard link and logout
            footerAuthButtons.innerHTML = `
                <a href="dashboard.html" class="btn-auth btn-login">Mi Dashboard</a>
                <a href="#" class="btn-auth btn-signup" id="footer-logout">Cerrar Sesión</a>
            `;
        } else {
            // User is not logged in - show login and signup
            footerAuthButtons.innerHTML = `
                <a href="login.html" class="btn-auth btn-login">Log In</a>
                <a href="sign-up.html" class="btn-auth btn-signup">Sign Up</a>
            `;
        }
    }
}

// Re-attach event listeners after navbar updates
function attachLogoutListeners() {
    setTimeout(() => {
        const logoutLink = document.getElementById('logout-link');
        if (logoutLink) {
            logoutLink.addEventListener('click', function(e) {
                e.preventDefault();
                handleLogout();
            });
        }
        
        const footerLogout = document.getElementById('footer-logout');
        if (footerLogout) {
            footerLogout.addEventListener('click', function(e) {
                e.preventDefault();
                handleLogout();
            });
        }
    }, 100);
}

// Add global logout handler
window.handleLogout = handleLogout;