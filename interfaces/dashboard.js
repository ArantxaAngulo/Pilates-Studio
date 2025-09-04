// Use API_BASE_URL from api-service.js if available, otherwise create local API_URL
const API_URL = (typeof API_BASE_URL !== 'undefined') ? API_BASE_URL : (() => {
  const currentHost = window.location.hostname;
  if (currentHost === 'localhost' || currentHost === '127.0.0.1') {
    return 'http://localhost:5000/api';
  }
  return '/api';
})();

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

        // Check if we have multiple active packages
        let activePackages = dashboardResponse.data.activePackages || dashboardResponse.data.activePackage;
        
        // Ensure it's always an array for consistent handling
        if (activePackages && !Array.isArray(activePackages)) {
            activePackages = [activePackages];
        }

        // If packages exist but packageId is not populated, fetch package details
        if (activePackages && activePackages.length > 0) {
            for (let i = 0; i < activePackages.length; i++) {
                const pkg = activePackages[i];
                if (pkg && (!pkg.packageId || typeof pkg.packageId === 'string')) {
                    try {
                        const packageId = pkg.packageId || pkg._id;
                        if (packageId && typeof packageId === 'string') {
                            const packageResponse = await apiService.packages.getById(packageId);
                            if (packageResponse.data.package) {
                                activePackages[i].packageId = packageResponse.data.package;
                            }
                        }
                    } catch (err) {
                        console.log('Could not fetch package details:', err);
                        // Continue with fallback data
                    }
                }
            }
        }

        // Calculate total credits for statistics
        const totalCredits = activePackages ? 
            activePackages.reduce((sum, pkg) => sum + (pkg.creditsLeft || 0), 0) : 0;

        // Update UI with fetched data
        updateWelcomeSection(userResponse.data.user);
        updateStatsSection({
            ...dashboardResponse.data,
            totalCreditsAvailable: totalCredits
        });
        updateActivePackages(activePackages);
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
    totalReservations.textContent = dashboardData.statistics?.totalReservations || 0;
    
    // Available credits - now shows total from all packages
    const creditsAvailable = document.getElementById('creditsAvailable');
    const credits = dashboardData.totalCreditsAvailable || 0;
    creditsAvailable.textContent = credits;
    
    // Member since (in months)
    const memberSince = document.getElementById('memberSince');
    const joinDate = new Date(dashboardData.user?.createdAt || Date.now());
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
function updateActivePackages(activePackages) {
    const container = document.getElementById('activePackagesContainer');
    
    // Handle case when activePackages is a single object (backward compatibility)
    if (activePackages && !Array.isArray(activePackages)) {
        activePackages = [activePackages];
    }
    
    if (!activePackages || activePackages.length === 0) {
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

    // Calculate total credits across all packages
    const totalCreditsAvailable = activePackages.reduce((sum, pkg) => sum + (pkg.creditsLeft || 0), 0);
    
    // Create HTML for all active packages
    let packagesHTML = '';
    
    activePackages.forEach((activePackage, index) => {
        // Handle different data structures
        let packageName = 'Paquete';
        let totalCredits = activePackage.creditsLeft;
        
        // Check if packageId is populated with details
        if (activePackage.packageId) {
            if (typeof activePackage.packageId === 'object' && activePackage.packageId.name) {
                packageName = activePackage.packageId.name;
                totalCredits = activePackage.packageId.creditCount;
            } else if (typeof activePackage.packageId === 'string') {
                // Map package IDs to names
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
        
        packagesHTML += `
            <div class="package-card" style="margin-bottom: 20px;">
                ${isExpiringSoon || isLowCredits ? `
                    <div class="alert alert-custom mb-3">
                        <strong>⚠️ Atención:</strong> 
                        ${isLowCredits ? `Solo te quedan ${activePackage.creditsLeft} ${activePackage.creditsLeft === 1 ? 'crédito' : 'créditos'}.` : ''}
                        ${isExpiringSoon ? `Tu paquete expira en ${daysUntilExpiry} días.` : ''}
                    </div>
                ` : ''}
                
                <h3 class="package-name">${packageName}</h3>
                
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
                </div>
            </div>
        `;
    });
    
    // Add summary if there are multiple packages
    if (activePackages.length > 1) {
        container.innerHTML = `
            <div class="packages-summary" style="background: #f9f9f9; padding: 15px; border-radius: 8px; margin-bottom: 20px;">
                <h4 style="margin: 0 0 10px 0;">Resumen de Paquetes</h4>
                <p style="margin: 0; font-size: 18px; font-weight: 500;">
                    Total de créditos disponibles: <span style="color: #D4B2A7; font-size: 24px;">${totalCreditsAvailable}</span>
                </p>
                <p style="margin: 5px 0 0 0; color: #666; font-size: 14px;">
                    Tienes ${activePackages.length} paquetes activos
                </p>
            </div>
            ${packagesHTML}
            <div style="text-align: center; margin-top: 20px;">
                <a href="packages.html" class="btn-action btn-outline-custom">
                    Ver más paquetes
                </a>
            </div>
        `;
    } else {
        // Single package display
        container.innerHTML = packagesHTML + `
            ${activePackages[0].creditsLeft <= 2 || Math.ceil((new Date(activePackages[0].expiresAt) - new Date()) / (1000 * 60 * 60 * 24)) <= 7 ? `
                <div style="text-align: center; margin-top: 20px;">
                    <a href="packages.html" class="btn-action btn-outline-custom">
                        Renovar paquete
                    </a>
                </div>
            ` : ''}
        `;
    }
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

    // Sort reservations by date - add null checks
    reservations.sort((a, b) => {
        const dateA = a.sessionId?.startsAt ? new Date(a.sessionId.startsAt) : new Date();
        const dateB = b.sessionId?.startsAt ? new Date(b.sessionId.startsAt) : new Date();
        return dateA - dateB;
    });

    container.innerHTML = reservations.map(reservation => {
        // Safely access nested properties with fallbacks
        const classDate = reservation.sessionId?.startsAt ? new Date(reservation.sessionId.startsAt) : new Date();
        const classType = reservation.sessionId?.classTypeId;
        const instructor = reservation.sessionId?.instructorId;
        
        // Build class name with null checks
        const className = classType?.name || 'Clase de Pilates';
        
        // Build instructor name with null checks
        let instructorName = 'Instructor';
        if (instructor) {
            if (typeof instructor === 'string') {
                instructorName = instructor;
            } else if (instructor.name) {
                if (typeof instructor.name === 'string') {
                    instructorName = instructor.name;
                } else if (instructor.name.first || instructor.name.last) {
                    instructorName = `${instructor.name.first || ''} ${instructor.name.last || ''}`.trim();
                }
            }
        }
        
        return `
            <div class="reservation-card">
                <div class="reservation-date">${formatDateWithDay(classDate)}</div>
                <div class="reservation-class">${className}</div>
                <div class="reservation-details">
                    ${formatTime(classDate)} • ${instructorName}
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

async function handleReservation() {
    const token = localStorage.getItem('token');
    if (!token) {
        sessionStorage.setItem('intendedAction', JSON.stringify({ 
            action: 'makeReservation', 
            sessionId: selectedSession?._id 
        }));
        window.location.href = 'login.html';
        return;
    }
    
    if (!selectedSession) {
        showAlert('Por favor selecciona una fecha y horario', 'error');
        return;
    }
    
    // Check 8-hour rule
    if (isWithin8Hours(selectedSession.startsAt)) {
        showAlert('No se pueden hacer reservas con menos de 8 horas de anticipación', 'error');
        return;
    }
    
    try {
        const userId = getUserIdFromToken();
        
        // Check eligibility from backend
        const eligibilityResponse = await fetch(`${API_URL}/reservations/eligibility/${selectedSession._id}`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        const eligibility = await eligibilityResponse.json();
        
        if (!eligibility.canBook) {
            showAlert(eligibility.message || 'No puedes reservar esta clase', 'error');
            return;
        }
        
        // Continue with existing reservation logic...
        if (userActivePackage && userActivePackage.creditsLeft > 0) {
            // Package flow
            const reservationResponse = await apiService.reservations.create({
                userId,
                sessionId: selectedSession._id,
                purchaseId: userActivePackage._id,
                paymentMethod: 'package'
            });

            if (reservationResponse.status === 'success') {
                showAlert('¡Clase reservada con éxito!', 'success');
                userActivePackage.creditsLeft--;
                updateReservationUI();
                selectedSession.reservedCount++;
                updateSessionDetails();
            } else {
                throw new Error(reservationResponse.message || 'Error al reservar');
            }
        } else {
            // Single class payment flow
            const confirmPayment = confirm(`Esta clase tiene un costo de $270 MXN. ¿Deseas continuar con el pago?`);
            if (confirmPayment) {
                // Redirect to payment...
                await processSingleClassPayment(selectedSession._id, userId);
            }
        }
    } catch (error) {
        console.error('Error making reservation:', error);
        showAlert(error.message || 'Error al procesar la reserva', 'error');
    }
}

// Updated cancelReservation function with 8-hour check and refund warning
async function cancelReservation(reservationId) {
    try {
        // Get reservation details first
        const reservationResponse = await fetch(`${API_URL}/reservations/${reservationId}`, {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
        });
        
        if (!reservationResponse.ok) {
            throw new Error('No se pudo obtener información de la reserva');
        }
        
        const reservationData = await reservationResponse.json();
        const reservation = reservationData.data.reservation;
        
        // Check if within 8 hours
        const within8Hours = isWithin8Hours(reservation.sessionId.startsAt);
        
        let confirmMessage = '¿Estás seguro de que deseas cancelar esta reserva?';
        
        if (within8Hours) {
            confirmMessage = '⚠️ ADVERTENCIA: Estás cancelando con menos de 8 horas de anticipación. ' +
                            'NO se reembolsarán créditos ni dinero. ¿Deseas continuar?';
        } else {
            if (reservation.paymentMethod === 'package') {
                confirmMessage = '¿Estás seguro de que deseas cancelar esta reserva? Tu crédito será reembolsado.';
            } else {
                confirmMessage = '¿Estás seguro de que deseas cancelar esta reserva? ' +
                               'El reembolso se procesará en 5-10 días hábiles.';
            }
        }
        
        if (!confirm(confirmMessage)) {
            return;
        }
        
        // Proceed with cancellation
        const response = await fetch(`${API_URL}/reservations/${reservationId}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
        });
        
        const result = await response.json();
        
        if (response.ok) {
            showAlert(result.message || 'Reserva cancelada exitosamente', 'success');
            // Reload reservations
            if (typeof loadUserReservations === 'function') {
                loadUserReservations();
            }
            if (typeof loadDashboardData === 'function') {
                loadDashboardData();
            }
        } else {
            throw new Error(result.error || 'Error al cancelar la reserva');
        }
        
    } catch (error) {
        console.error('Error cancelling reservation:', error);
        showAlert(error.message || 'Error al cancelar la reserva', 'error');
    }
}

// Helper function to display time remaining until class
function getTimeUntilClass(classStartTime) {
    const now = new Date();
    const classStart = new Date(classStartTime);
    const hoursUntilClass = (classStart - now) / (1000 * 60 * 60);
    
    if (hoursUntilClass < 0) {
        return 'Clase ya iniciada';
    } else if (hoursUntilClass < 1) {
        const minutes = Math.floor(hoursUntilClass * 60);
        return `${minutes} minutos`;
    } else if (hoursUntilClass < 24) {
        const hours = Math.floor(hoursUntilClass);
        const minutes = Math.floor((hoursUntilClass - hours) * 60);
        return `${hours}h ${minutes}min`;
    } else {
        const days = Math.floor(hoursUntilClass / 24);
        const hours = Math.floor(hoursUntilClass % 24);
        return `${days} días, ${hours} horas`;
    }
}

// Visual indicator for classes within 8-hour window
function updateClassAvailabilityIndicators() {
    const classElements = document.querySelectorAll('.class-session');
    
    classElements.forEach(element => {
        const startTime = element.dataset.startTime;
        if (startTime) {
            const within8Hours = isWithin8Hours(startTime);
            
            if (within8Hours) {
                element.classList.add('no-booking-allowed');
                
                // Add warning badge
                const warningBadge = document.createElement('span');
                warningBadge.className = 'warning-badge';
                warningBadge.textContent = 'No modificable';
                warningBadge.title = 'No se pueden hacer reservas o cancelaciones con menos de 8 horas de anticipación';
                element.appendChild(warningBadge);
            }
        }
    });
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

// Check if action is within 8 hours of class
function isWithin8Hours(classStartTime) {
    const now = new Date();
    const classStart = new Date(classStartTime);
    const hoursUntilClass = (classStart - now) / (1000 * 60 * 60);
    return hoursUntilClass < 8;
}