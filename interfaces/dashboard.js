// Check if user is authenticated when page loads
document.addEventListener('DOMContentLoaded', function() {
    // Check authentication
    const token = localStorage.getItem('token');
    if (!token) {
        window.location.href = 'login.html';
        return;
    }

    // Verify token is still valid
    try {
        const tokenPayload = JSON.parse(atob(token.split('.')[1]));
        const expirationTime = tokenPayload.exp * 1000;
        
        if (Date.now() >= expirationTime) {
            localStorage.removeItem('token');
            localStorage.removeItem('refreshToken');
            localStorage.removeItem('userName');
            window.location.href = 'login.html';
            return;
        }

        // Store user ID for API calls
        window.currentUserId = tokenPayload.id;
        
        // Load dashboard data
        loadDashboardData();
    } catch (error) {
        console.error('Invalid token:', error);
        window.location.href = 'login.html';
    }
});

// Load all dashboard data
async function loadDashboardData() {
    try {
        // Show loading state
        showLoadingState();

        // Fetch user data and dashboard info in parallel
        const [userResponse, dashboardResponse] = await Promise.all([
            apiService.users.getProfile(window.currentUserId),
            apiService.users.getDashboard(window.currentUserId)
        ]);

        // If activePackage exists but packageId is not populated, fetch package details
        if (dashboardResponse.data.activePackage && 
            (!dashboardResponse.data.activePackage.packageId || 
             typeof dashboardResponse.data.activePackage.packageId === 'string')) {
            
            try {
                const packageId = dashboardResponse.data.activePackage.packageId || 
                               dashboardResponse.data.activePackage._id;
                               
                if (packageId) {
                    const packageResponse = await apiService.packages.getById(packageId);
                    if (packageResponse.data.package) {
                        dashboardResponse.data.activePackage.packageId = packageResponse.data.package;
                    }
                }
            } catch (err) {
                console.log('Could not fetch package details:', err);
                // Continue with fallback data
            }
        }

        // Update UI with fetched data
        updateWelcomeSection(userResponse.data.user);
        updateStatsSection(dashboardResponse.data);
        updateActivePackages(dashboardResponse.data.activePackage);
        updateUpcomingReservations(dashboardResponse.data.upcomingReservations);

    } catch (error) {
        console.error('Error loading dashboard data:', error);
        showErrorState(error.message);
    }
}

// Update welcome section
function updateWelcomeSection(user) {
    const welcomeMessage = document.getElementById('welcomeMessage');
    const welcomeSubtitle = document.getElementById('welcomeSubtitle');
    
    // Save user name for navbar
    localStorage.setItem('userName', user.name);
    
    const firstName = user.name.split(' ')[0];
    const currentHour = new Date().getHours();
    
    let greeting = 'Hola';
    if (currentHour < 12) {
        greeting = 'Buenos días';
    } else if (currentHour < 18) {
        greeting = 'Buenas tardes';
    } else {
        greeting = 'Buenas noches';
    }
    
    welcomeMessage.textContent = `¡${greeting}, ${firstName}!`;
    welcomeSubtitle.textContent = getMotivationalMessage();
}

// Get random motivational message
function getMotivationalMessage() {
    const messages = [
        'Es un gran día para cuidar de tu cuerpo y mente',
        'Tu bienestar es nuestra prioridad',
        'Cada clase es un paso hacia una mejor versión de ti',
        'Tu dedicación te está llevando lejos',
        'El movimiento es medicina para el cuerpo y el alma'
    ];
    
    return messages[Math.floor(Math.random() * messages.length)];
}

// Update statistics section
function updateStatsSection(dashboardData) {
    // Total reservations
    const totalReservations = document.getElementById('totalReservations');
    totalReservations.textContent = dashboardData.statistics.totalReservations || 0;
    
    // Available credits
    const creditsAvailable = document.getElementById('creditsAvailable');
    const credits = dashboardData.activePackage ? dashboardData.activePackage.creditsLeft : 0;
    creditsAvailable.textContent = credits;
    
    // Member since (in months)
    const memberSince = document.getElementById('memberSince');
    const joinDate = new Date(dashboardData.user.createdAt);
    const monthsDiff = getMonthsDifference(joinDate, new Date());
    memberSince.textContent = monthsDiff;
}

// Calculate months difference between two dates
function getMonthsDifference(startDate, endDate) {
    const monthsDiff = (endDate.getFullYear() - startDate.getFullYear()) * 12 + 
                      (endDate.getMonth() - startDate.getMonth());
    return Math.max(0, monthsDiff);
}

// Update active packages section
function updateActivePackages(activePackage) {
    const container = document.getElementById('activePackagesContainer');
    
    if (!activePackage) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">📦</div>
                <h3>No tienes paquetes activos</h3>
                <p>¡Compra un paquete para empezar a reservar clases!</p>
                <a href="packages.html" class="btn-action btn-primary-custom mt-3">Ver Paquetes</a>
            </div>
        `;
        return;
    }

    // Handle different data structures - sometimes packageId is populated, sometimes it's just an ID
    let packageName = 'Paquete';
    let totalCredits = activePackage.creditsLeft;
    
    // Check if packageId is populated with details
    if (activePackage.packageId) {
        if (typeof activePackage.packageId === 'object' && activePackage.packageId.name) {
            packageName = activePackage.packageId.name;
            totalCredits = activePackage.packageId.creditCount;
        } else if (typeof activePackage.packageId === 'string') {
            // If packageId is just a string ID, we need to fetch package details
            // mapping based on common package IDs
            const packageNames = {
                'pkg-trial': 'Clase de Prueba',
                'pkg-single': '1 Clase',
                'pkg-3': '3 Clases',
                'pkg-9': '9 Clases',
                'pkg-14': '14 Clases',
                'pkg-19': '19 Clases',
                'pkg-24': '24 Clases',
                'pkg-35': '35 Clases'
            };
            
            const packageCredits = {
                'pkg-trial': 1,
                'pkg-single': 1,
                'pkg-3': 3,
                'pkg-9': 9,
                'pkg-14': 14,
                'pkg-19': 19,
                'pkg-24': 24,
                'pkg-35': 35
            };
            
            packageName = packageNames[activePackage.packageId] || 'Paquete de Clases';
            totalCredits = packageCredits[activePackage.packageId] || activePackage.creditsLeft;
        }
    }

    // Calculate progress
    const usedCredits = totalCredits - activePackage.creditsLeft;
    const progressPercentage = (usedCredits / totalCredits) * 100;
    
    // Format expiration date
    const expirationDate = new Date(activePackage.expiresAt);
    const daysUntilExpiry = Math.ceil((expirationDate - new Date()) / (1000 * 60 * 60 * 24));
    
    // Determine if package is expiring soon
    const isExpiringSoon = daysUntilExpiry <= 7;
    const isLowCredits = activePackage.creditsLeft <= 2;
    
    container.innerHTML = `
        <div class="package-card">
            ${isExpiringSoon || isLowCredits ? `
                <div class="alert alert-custom mb-3">
                    <strong>⚠️ Atención:</strong> 
                    ${isLowCredits ? `Solo te quedan ${activePackage.creditsLeft} ${activePackage.creditsLeft === 1 ? 'crédito' : 'créditos'}.` : ''}
                    ${isExpiringSoon ? `Tu paquete expira en ${daysUntilExpiry} días.` : ''}
                </div>
            ` : ''}
            
            <h3 class="package-name">Paquete ${packageName}</h3>
            
            <div class="package-details">
                <div class="package-info">
                    <div class="credits-display">
                        <span class="credits-number">${activePackage.creditsLeft}</span>
                        <span class="credits-label">de ${totalCredits} créditos disponibles</span>
                    </div>
                    <div class="expiration-date">
                        Válido hasta: ${formatDate(expirationDate)}
                    </div>
                    
                    <div class="progress-bar-container">
                        <div class="progress-bar-fill" style="width: ${100 - progressPercentage}%"></div>
                    </div>
                </div>
                
                <div class="package-actions">
                    ${isExpiringSoon || isLowCredits ? `
                        <a href="packages.html" class="btn-action btn-outline-custom">
                            Renovar
                        </a>
                    ` : ''}
                </div>
            </div>
        </div>
    `;
}

// Update upcoming reservations section
function updateUpcomingReservations(reservations) {
    const container = document.getElementById('upcomingReservationsContainer');
    
    if (!reservations || reservations.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">🧘‍♀️</div>
                <h3>No tienes clases reservadas</h3>
                <p>¡Es momento de agendar tu próxima sesión!</p>
                <a href="calendar.html" class="btn-action btn-primary-custom mt-3">Ver Horario</a>
            </div>
        `;
        return;
    }

    // Sort reservations by date
    reservations.sort((a, b) => new Date(a.sessionId.startsAt) - new Date(b.sessionId.startsAt));

    container.innerHTML = reservations.map(reservation => {
        const classDate = new Date(reservation.sessionId.startsAt);
        const classType = reservation.sessionId.classTypeId;
        const instructor = reservation.sessionId.instructorId;
        
        return `
            <div class="reservation-card">
                <div class="reservation-date">${formatDateWithDay(classDate)}</div>
                <div class="reservation-class">${classType.name}</div>
                <div class="reservation-details">
                    ${formatTime(classDate)} • ${instructor.name.first} ${instructor.name.last}
                </div>
                <button class="btn btn-sm btn-outline-danger mt-2" 
                        onclick="cancelReservation('${reservation._id}')">
                    Cancelar Reserva
                </button>
            </div>
        `;
    }).join('');
}

// Format date with day name
function formatDateWithDay(date) {
    const days = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
    const months = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 
                   'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
    
    const dayName = days[date.getDay()];
    const day = date.getDate();
    const month = months[date.getMonth()];
    
    return `${dayName}, ${day} de ${month}`;
}

// Format date
function formatDate(date) {
    const months = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 
                   'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
    
    const day = date.getDate();
    const month = months[date.getMonth()];
    const year = date.getFullYear();
    
    return `${day} de ${month} de ${year}`;
}

// Format time
function formatTime(date) {
    const hours = date.getHours();
    const minutes = date.getMinutes().toString().padStart(2, '0');
    const ampm = hours >= 12 ? 'PM' : 'AM';
    const displayHours = hours % 12 || 12;
    
    return `${displayHours}:${minutes} ${ampm}`;
}

// Cancel reservation
async function cancelReservation(reservationId) {
    if (!confirm('¿Estás seguro de que deseas cancelar esta reserva?')) {
        return;
    }

    try {
        await apiService.reservations.cancel(reservationId);
        showNotification('Reserva cancelada exitosamente', 'success');
        
        // Reload dashboard data
        loadDashboardData();
    } catch (error) {
        showNotification('Error al cancelar la reserva', 'error');
        console.error('Error canceling reservation:', error);
    }
}

// Show loading state
function showLoadingState() {
    const containers = [
        'activePackagesContainer',
        'upcomingReservationsContainer'
    ];
    
    containers.forEach(id => {
        const container = document.getElementById(id);
        if (container) {
            container.innerHTML = `
                <div class="loading-spinner">
                    <div class="spinner"></div>
                </div>
            `;
        }
    });
}

// Show error state
function showErrorState(message) {
    const containers = [
        'activePackagesContainer',
        'upcomingReservationsContainer'
    ];
    
    containers.forEach(id => {
        const container = document.getElementById(id);
        if (container) {
            container.innerHTML = `
                <div class="alert alert-danger">
                    <strong>Error:</strong> ${message}
                </div>
            `;
        }
    });
}

// Show notification
function showNotification(message, type = 'success') {
    // Remove any existing notifications
    const existingNotification = document.querySelector('.notification-toast');
    if (existingNotification) {
        existingNotification.remove();
    }

    // Create notification element
    const notification = document.createElement('div');
    notification.className = `notification-toast alert alert-${type === 'success' ? 'success' : 'danger'}`;
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        z-index: 1050;
        min-width: 250px;
        animation: slideIn 0.3s ease-out;
    `;
    notification.textContent = message;
    
    document.body.appendChild(notification);
    
    // Auto-remove after 3 seconds
    setTimeout(() => {
        notification.style.animation = 'slideOut 0.3s ease-out';
        setTimeout(() => notification.remove(), 300);
    }, 3000);
}

// Add CSS animations
const style = document.createElement('style');
style.textContent = `
    @keyframes slideIn {
        from {
            transform: translateX(100%);
            opacity: 0;
        }
        to {
            transform: translateX(0);
            opacity: 1;
        }
    }
    
    @keyframes slideOut {
        from {
            transform: translateX(0);
            opacity: 1;
        }
        to {
            transform: translateX(100%);
            opacity: 0;
        }
    }
`;
document.head.appendChild(style);

// Refresh data every 5 minutes if user is on the page
setInterval(() => {
    if (document.visibilityState === 'visible') {
        loadDashboardData();
    }
}, 5 * 60 * 1000);

// Export functions for use in other files
window.dashboardFunctions = {
    loadDashboardData,
    cancelReservation,
    showNotification
};