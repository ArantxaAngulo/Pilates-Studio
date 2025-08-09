// Handles dynamic calendar and reservation functionality

// Global state
let selectedDate = null;
let selectedSession = null;
let availableSessions = {};
let currentMonth = new Date().getMonth();
let currentYear = new Date().getFullYear();
let userActivePackages = []; // Changed from userActivePackage to userActivePackages (array)
let totalUserCredits = 0; // Add total credits tracker

// Initialize reservation system
document.addEventListener('DOMContentLoaded', function() {
    if (document.querySelector('.calendar-grid')) {
        initializeReservationSystem();
    }
});

async function initializeReservationSystem() {
    try {
        // Check if user is logged in
        const token = localStorage.getItem('token');
        if (token) {
            // Get user's active packages (plural)
            const userId = getUserIdFromToken();
            if (userId) {
                // This will fetch ALL packages and calculate total credits
                await checkUserActivePackages(userId);
            }
        }
        
        // Initialize calendar
        await initializeCalendar();
        
        // Add event listeners
        setupEventListeners();

        // Update the UI based on login status and packages
        updateReservationUI();
        
    } catch (error) {
        console.error('Error initializing reservation system:', error);
    }
}

// Get user ID from JWT token
function getUserIdFromToken() {
    const token = localStorage.getItem('token');
    if (!token) return null;
    
    try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        return payload.id;
    } catch (e) {
        console.error('Error decoding token:', e);
        return null;
    }
}

// Check user's active package
async function checkUserActivePackages(userId) {
    try {
        const token = localStorage.getItem('token');
        if (!token || !userId) {
            userActivePackages = [];
            totalUserCredits = 0;
            return null;
        }

        // Get ALL active packages, not just one
        const response = await fetch(`http://localhost:5000/api/purchases/user/${userId}`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (!response.ok) {
            console.log('No active packages found or user not authorized.');
            userActivePackages = [];
            totalUserCredits = 0;
            return null;
        }

        const data = await response.json();
        const allPurchases = data.data.purchases || [];
        
        // Filter only active packages (not expired and with credits)
        userActivePackages = allPurchases.filter(purchase => {
            const isActive = new Date(purchase.expiresAt) > new Date() && purchase.creditsLeft > 0;
            return isActive;
        });

        // Calculate total credits
        totalUserCredits = userActivePackages.reduce((sum, pkg) => sum + pkg.creditsLeft, 0);
        
        console.log('Active packages:', userActivePackages);
        console.log('Total credits available:', totalUserCredits);
        
        return userActivePackages;

    } catch (error) {
        console.error('Error checking active packages:', error);
        userActivePackages = [];
        totalUserCredits = 0;
        return null;
    }
}

// Initialize calendar with current month
async function initializeCalendar() {
    const monthNames = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 
                       'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
    const calendarHeader = document.querySelector('.calendar-header');
    if (calendarHeader) {
        let monthText = calendarHeader.querySelector('span');
        if (!monthText) {
            addMonthNavigation();
            monthText = calendarHeader.querySelector('span');
        }
        monthText.textContent = `${monthNames[currentMonth]} ${currentYear}`;
    }
    
    generateCalendarDays();
    await loadMonthSessions();
    
    // DON'T automatically select today or any date
    // Remove any pre-selected dates
    document.querySelectorAll('.calendar-day.selected').forEach(day => {
        day.classList.remove('selected');
    });
    
    // Clear time slots
    const timeSlotsGrid = document.querySelector('.time-slots-grid');
    if (timeSlotsGrid) {
        timeSlotsGrid.innerHTML = '<p style="color: #7d666698;">Selecciona una fecha para ver horarios</p>';
    }
    
    // Reset class info to default state
    const classDate = document.querySelector('.class-date');
    if (classDate) {
        classDate.textContent = 'Selecciona una fecha';
    }
    
    const classCapacity = document.querySelector('.class-capacity');
    if (classCapacity) {
        classCapacity.textContent = '--/-- 👤';
    }
    
    const classDetails = document.querySelector('.class-details');
    if (classDetails) {
        classDetails.textContent = 'Selecciona un horario para ver detalles';
    }
}

// Generate calendar days
function generateCalendarDays() {
    const calendarGrid = document.querySelector('.calendar-grid');
    if (!calendarGrid) return;
    
    const headers = calendarGrid.querySelectorAll('.calendar-day.header');
    calendarGrid.innerHTML = '';
    headers.forEach(header => calendarGrid.appendChild(header));
    
    const firstDay = new Date(currentYear, currentMonth, 1);
    const lastDay = new Date(currentYear, currentMonth + 1, 0);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const startingDayOfWeek = firstDay.getDay() === 0 ? 7 : firstDay.getDay();
    for (let i = 1; i < startingDayOfWeek; i++) {
        const emptyDay = document.createElement('div');
        emptyDay.className = 'calendar-day';
        calendarGrid.appendChild(emptyDay);
    }
    
    for (let day = 1; day <= lastDay.getDate(); day++) {
        const dayElement = document.createElement('div');
        dayElement.className = 'calendar-day';
        dayElement.textContent = day.toString().padStart(2, '0');
        
        const currentDate = new Date(currentYear, currentMonth, day);
        currentDate.setHours(0, 0, 0, 0);
        
        if (currentDate < today) {
            dayElement.classList.add('disabled');
        } else {
            dayElement.addEventListener('click', () => selectDate(currentDate));
            const dateKey = currentDate.toISOString().split('T')[0];
            if (availableSessions[dateKey] && availableSessions[dateKey].length > 0) {
                dayElement.classList.add('has-sessions');
            }
        }
        
        // Highlight today but don't select it
        if (currentDate.getTime() === today.getTime()) {
            dayElement.classList.add('today');
        }
        
        calendarGrid.appendChild(dayElement);
    }
}

// Load available sessions for the month
async function loadMonthSessions() {
    try {
        const response = await apiService.classSessions.getAvailable({
            month: currentMonth + 1,
            year: currentYear
        });
        availableSessions = response.data.sessionsByDate || {};
        updateCalendarAvailability();
    } catch (error) {
        console.error('Error loading month sessions:', error);
    }
}

// Update calendar to show availability
function updateCalendarAvailability() {
    const calendarDays = document.querySelectorAll('.calendar-day:not(.header)');
    calendarDays.forEach(dayElement => {
        const day = parseInt(dayElement.textContent);
        if (!day) return;
        const date = new Date(currentYear, currentMonth, day);
        const dateKey = date.toISOString().split('T')[0];
        if (availableSessions[dateKey] && availableSessions[dateKey].length > 0) {
            dayElement.classList.add('has-sessions');
        } else {
            dayElement.classList.remove('has-sessions');
        }
    });
}

// Select a date
async function selectDate(date) {
    selectedDate = date;
    selectedSession = null;
    
    document.querySelectorAll('.calendar-day').forEach(day => day.classList.remove('selected'));
    
    const dayNumber = date.getDate();
    const calendarDays = document.querySelectorAll('.calendar-day:not(.header)');
    calendarDays.forEach(dayElement => {
        if (parseInt(dayElement.textContent) === dayNumber) {
            dayElement.classList.add('selected');
        }
    });
    
    updateClassInfoDisplay(date);
    await loadTimeSlots(date);
}

// Update class info display
function updateClassInfoDisplay(date) {
    const classDate = document.querySelector('.class-date');
    if (classDate) {
        if (date) {
            const options = { day: 'numeric', month: 'long' };
            classDate.textContent = date.toLocaleDateString('es-MX', options);
        } else {
            classDate.textContent = 'Selecciona una fecha';
        }
    }
    
    // Update capacity to show default of 10 when no session selected
    const classCapacity = document.querySelector('.class-capacity');
    if (classCapacity && !selectedSession) {
        classCapacity.textContent = '--/10 👤';
    }
}

// Load time slots for selected date
async function loadTimeSlots(date) {
    const timeSlotsGrid = document.querySelector('.time-slots-grid');
    if (!timeSlotsGrid) return;
    
    const dateKey = date.toISOString().split('T')[0];
    const daySessions = availableSessions[dateKey] || [];
    
    if (daySessions.length === 0) {
        timeSlotsGrid.innerHTML = '<p style="color: #7d666698;">No hay clases disponibles este día</p>';
        return;
    }
    
    timeSlotsGrid.innerHTML = daySessions.map(session => {
        const isFull = session.availableSpots === 0;
        const timeStr = new Date(session.startsAt).toLocaleTimeString('es-MX', {
            hour: 'numeric', minute: '2-digit', hour12: true
        });
        
        return `
            <div class="time-slot-item ${isFull ? 'disabled' : ''}" 
                 data-session-id="${session._id}"
                 onclick="selectTimeSlot(this)">
                <div>${timeStr}</div>
                ${isFull ? '<small style="color: #ef4444;">Clase llena</small>' : ''}
            </div>
        `;
    }).join('');
}

// Select time slot
window.selectTimeSlot = function(element) {
    if(element.classList.contains('disabled')) return;

    document.querySelectorAll('.time-slot-item').forEach(slot => slot.classList.remove('selected'));
    
    element.classList.add('selected');
    const sessionId = element.dataset.sessionId;
    
    const dateKey = selectedDate.toISOString().split('T')[0];
    selectedSession = availableSessions[dateKey].find(s => s._id === sessionId);
    
    updateSessionDetails();
};

// Session details display
function updateSessionDetails() {
    if (!selectedSession) return;
    
    const classDetails = document.querySelector('.class-details');
    if (classDetails && selectedSession.instructor) {
        const instructorName = selectedSession.instructor?.name?.first || 'Instructor';
        classDetails.textContent = `50 minutos, ${instructorName}`;
    }
    
    const classCapacity = document.querySelector('.class-capacity');
    if (classCapacity) {
        // Default capacity is 10 for all classes
        const capacity = selectedSession.capacity || 10;
        const reservedCount = selectedSession.reservedCount || 0;
        classCapacity.textContent = `${reservedCount}/${capacity} 👤`;
    }
    
    const classDate = document.querySelector('.class-date');
    if (classDate) {
        const sessionDate = new Date(selectedSession.startsAt);
        const options = { day: 'numeric', month: 'long', hour: 'numeric', minute: '2-digit', hour12: true };
        classDate.textContent = sessionDate.toLocaleDateString('es-MX', options);
    }
}

// Setup event listeners
function setupEventListeners() {
    const reserveBtn = document.querySelector('.btn-reserve');
    if (reserveBtn) {
        reserveBtn.addEventListener('click', handleReservation);
    }
    
    addMonthNavigation();
}

// Add month navigation to calendar
function addMonthNavigation() {
    const calendarHeader = document.querySelector('.calendar-header');
    if (!calendarHeader || calendarHeader.querySelector('.calendar-nav-btn')) return;

    const navContainer = document.createElement('div');
    navContainer.style.display = 'flex';
    navContainer.style.alignItems = 'center';
    navContainer.style.justifyContent = 'space-between';
    navContainer.style.width = '100%';
    
    const prevBtn = document.createElement('button');
    prevBtn.innerHTML = '‹';
    prevBtn.className = 'calendar-nav-btn';
    prevBtn.onclick = () => changeMonth(-1);
    
    const monthText = document.createElement('span');
    monthText.textContent = calendarHeader.textContent;
    
    const nextBtn = document.createElement('button');
    nextBtn.innerHTML = '›';
    nextBtn.className = 'calendar-nav-btn';
    nextBtn.onclick = () => changeMonth(1);
    
    calendarHeader.innerHTML = '';
    navContainer.appendChild(prevBtn);
    navContainer.appendChild(monthText);
    navContainer.appendChild(nextBtn);
    calendarHeader.appendChild(navContainer);
}

// Change calendar month
async function changeMonth(direction) {
    currentMonth += direction;
    
    if (currentMonth > 11) {
        currentMonth = 0;
        currentYear++;
    } else if (currentMonth < 0) {
        currentMonth = 11;
        currentYear--;
    }
    
    const today = new Date();
    if (currentYear < today.getFullYear() || (currentYear === today.getFullYear() && currentMonth < today.getMonth())) {
        currentMonth = today.getMonth();
        currentYear = today.getFullYear();
        return;
    }
    
    // Clear selections when changing months
    selectedDate = null;
    selectedSession = null;
    
    await initializeCalendar();
}

// Updated handleReservation function with 8-hour check
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
        const eligibilityResponse = await fetch(`http://localhost:5000/api/reservations/eligibility/${selectedSession._id}`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        const eligibility = await eligibilityResponse.json();
        
        if (!eligibility.canBook) {
            showAlert(eligibility.message || 'No puedes reservar esta clase', 'error');
            return;
        }
        
        // Check if user has ANY credits available (from any package)
        if (totalUserCredits > 0 && userActivePackages.length > 0) {
            // Find the first package with available credits (oldest first)
            const packageToUse = userActivePackages.find(pkg => pkg.creditsLeft > 0);
            
            if (packageToUse) {
                // Package reservation flow - use credits from the selected package
                const reservationResponse = await apiService.reservations.create({
                    userId,
                    sessionId: selectedSession._id,
                    purchaseId: packageToUse._id,
                    paymentMethod: 'package'
                });

                if (reservationResponse.status === 'success') {
                    showAlert('¡Clase reservada con éxito!', 'success');
                    
                    // Update local credit counts
                    packageToUse.creditsLeft--;
                    totalUserCredits--;
                    
                    // Update UI
                    updateReservationUI();
                    selectedSession.reservedCount++;
                    updateSessionDetails();
                } else {
                    throw new Error(reservationResponse.message || 'Error al reservar');
                }
            }
        } else {
            // Single class payment flow - no credits available
            const confirmPayment = confirm(`Esta clase tiene un costo de $270 MXN. ¿Deseas continuar con el pago?`);
            if (confirmPayment) {
                await processSingleClassPayment(selectedSession._id, userId);
            }
        }
    } catch (error) {
        console.error('Error making reservation:', error);
        showAlert(error.message || 'Error al procesar la reserva', 'error');
    }
}

async function cancelReservation(reservationId) {
    try {
        // Get reservation details first
        const reservationResponse = await fetch(`http://localhost:5000/api/reservations/${reservationId}`, {
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
        const response = await fetch(`http://localhost:5000/api/reservations/${reservationId}`, {
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

// Update the reserve button UI
function updateReservationUI() {
    const reserveBtn = document.querySelector('.btn-reserve');
    if (!reserveBtn) return;
    
    if (totalUserCredits > 0) {
        // Show total credits from all packages
        const packageCount = userActivePackages.length;
        if (packageCount > 1) {
            reserveBtn.textContent = `Reservar (${totalUserCredits} créditos totales - ${packageCount} paquetes)`;
        } else {
            reserveBtn.textContent = `Reservar (${totalUserCredits} ${totalUserCredits === 1 ? 'crédito' : 'créditos'} restantes)`;
        }
    } else {
        reserveBtn.textContent = 'Reservar ($270 MXN)';
    }
}

// Show alert message
function showAlert(message, type = 'success') {
    const existingAlert = document.querySelector('.custom-alert');
    if (existingAlert) existingAlert.remove();

    const alertDiv = document.createElement('div');
    alertDiv.className = `custom-alert alert-${type}`;
    alertDiv.textContent = message;
    
    alertDiv.style.position = 'fixed';
    alertDiv.style.top = '20px';
    alertDiv.style.right = '20px';
    alertDiv.style.padding = '15px 25px';
    alertDiv.style.borderRadius = '8px';
    alertDiv.style.color = 'white';
    alertDiv.style.zIndex = '9999';
    alertDiv.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)';
    alertDiv.style.backgroundColor = type === 'error' ? '#ef4444' : '#10b981';
    
    document.body.appendChild(alertDiv);
    
    setTimeout(() => {
        alertDiv.style.opacity = '0';
        alertDiv.style.transition = 'opacity 0.5s ease';
        setTimeout(() => alertDiv.remove(), 500);
    }, 5000);
}

// Add styles for calendar
const style = document.createElement('style');
style.textContent = `
    .calendar-nav-btn { background: none; border: none; color: #D4B2A7; font-size: 1.5rem; cursor: pointer; padding: 0 10px; transition: color 0.3s ease; }
    .calendar-nav-btn:hover { color: #7D6666; }
    .calendar-day.has-sessions { background-color: rgba(212, 178, 167, 0.2); font-weight: 500; }
    .calendar-day.today { border: 2px solid #D4B2A7; }
    .calendar-day.disabled { color: #ccc; cursor: not-allowed; opacity: 0.5; }
    .calendar-day.selected { background-color: #D4B2A7 !important; color: white !important; border-radius: 50%; width: 30px; height: 30px; display: flex; align-items: center; justify-content: center; margin: 0 auto; }
    .time-slot-item.disabled { opacity: 0.5; cursor: not-allowed; background-color: #f3f3f3; }
    .time-slot-item.disabled:hover { background-color: #f3f3f3; }
`;
document.head.appendChild(style);

// Check if action is within 8 hours of class
function isWithin8Hours(classStartTime) {
    const now = new Date();
    const classStart = new Date(classStartTime);
    const hoursUntilClass = (classStart - now) / (1000 * 60 * 60);
    return hoursUntilClass < 8;
}

async function processSingleClassPayment(sessionId, userId) {
    try {
        const token = localStorage.getItem('token');
        
        // Get session details for the payment
        const sessionResponse = await fetch(`http://localhost:5000/api/class-sessions/${sessionId}`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        if (!sessionResponse.ok) {
            throw new Error('No se pudo obtener información de la clase');
        }
        
        const sessionData = await sessionResponse.json();
        const classSession = sessionData.data.classSession;
        
        // Prepare data for MercadoPago payment
        const singleClassPrice = 270; // Fixed price for single class
        const classSessionName = classSession.classTypeId?.name || 'Clase de Pilates';
        
        // Create MercadoPago preference for single class payment
        const paymentResponse = await fetch('http://localhost:5000/api/payments/create_single_class_preference', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                userId: userId,
                sessionId: sessionId,
                singleClassPrice: singleClassPrice,
                classSessionName: classSessionName
            })
        });
        
        if (!paymentResponse.ok) {
            const errorData = await paymentResponse.json();
            throw new Error(errorData.error || 'Error al crear la preferencia de pago');
        }
        
        const paymentData = await paymentResponse.json();
        
        // Redirect to MercadoPago checkout
        window.location.href = paymentData.init_point;
        
    } catch (error) {
        console.error('Error processing single class payment:', error);
        showAlert(error.message || 'Error al procesar el pago', 'error');
    }
}