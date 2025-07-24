// Module for handling all API calls to the backend
// Dynamically determine API URL based on current location
function getApiBaseUrl() {
    const currentHost = window.location.hostname;
    const currentProtocol = window.location.protocol;
    
    /* If we're on ngrok, use ngrok URL
    if (currentHost.includes('ngrok')) {
        return `${currentProtocol}//${currentHost}/api`;
    }*/
    
    // If we're on localhost, use localhost
    if (currentHost === 'localhost' || currentHost === '127.0.0.1') {
        return 'http://localhost:5000/api';
    }
    
    // For production, render URL
    return 'https://pilates-studio-test.onrender.com/api';
}

const API_BASE_URL = getApiBaseUrl();

console.log('API Base URL:', API_BASE_URL);

// Helper function to get auth token
function getAuthToken() {
    return localStorage.getItem('token');
}

// Helper function for API calls
async function apiCall(endpoint, options = {}) {
    const token = getAuthToken();
    
    const defaultOptions = {
        headers: {
            'Content-Type': 'application/json',
            ...(token && { 'Authorization': `Bearer ${token}` })
        }
    };

    try {
        const response = await fetch(`${API_BASE_URL}${endpoint}`, {
            ...defaultOptions,
            ...options,
            headers: {
                ...defaultOptions.headers,
                ...options.headers
            }
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || `HTTP error! status: ${response.status}`);
        }

        return await response.json();
    } catch (error) {
        console.error('API call failed:', error);
        throw error;
    }
}

// API Service Object
const apiService = {
    // PACKAGES
    packages: {
        getAll: async (params = {}) => {
            const queryString = new URLSearchParams(params).toString();
            return apiCall(`/packages${queryString ? '?' + queryString : ''}`);
        },
        getById: async (id) => {
            return apiCall(`/packages/${id}`);
        }
    },

    // CLASS TYPES
    classTypes: {
        getAll: async (params = {}) => {
            const queryString = new URLSearchParams(params).toString();
            return apiCall(`/class-types${queryString ? '?' + queryString : ''}`);
        },
        getById: async (id) => {
            return apiCall(`/class-types/${id}`);
        },
        getByLevel: async (level) => {
            return apiCall(`/class-types/level/${level}`);
        }
    },

    // INSTRUCTORS
    instructors: {
        getAll: async (params = {}) => {
            const queryString = new URLSearchParams(params).toString();
            return apiCall(`/instructors${queryString ? '?' + queryString : ''}`);
        },
        getById: async (id) => {
            return apiCall(`/instructors/${id}`);
        }
    },

    // CLASS SESSIONS
    classSessions: {
        getAll: async (params = {}) => {
            const queryString = new URLSearchParams(params).toString();
            return apiCall(`/class-sessions${queryString ? '?' + queryString : ''}`);
        },
        getAvailable: async (params = {}) => {
            const queryString = new URLSearchParams(params).toString();
            return apiCall(`/class-sessions/available${queryString ? '?' + queryString : ''}`);
        },
        getById: async (id) => {
            return apiCall(`/class-sessions/${id}`);
        }
    },

    // USERS
    users: {
        login: async (email, password) => {
            return apiCall('/users/login', {
                method: 'POST',
                body: JSON.stringify({ email, password })
            });
        },
        register: async (userData) => {
            return apiCall('/users/register', {
                method: 'POST',
                body: JSON.stringify(userData)
            });
        },
        getProfile: async (userId) => {
            return apiCall(`/users/${userId}`);
        },
        getDashboard: async (userId) => {
            return apiCall(`/users/${userId}/dashboard`);
        }
    },

    // PURCHASES
    purchases: {
        create: async (purchaseData) => {
            return apiCall('/purchases', {
                method: 'POST',
                body: JSON.stringify(purchaseData)
            });
        },
        getUserPurchases: async (userId, params = {}) => {
            const queryString = new URLSearchParams(params).toString();
            return apiCall(`/purchases/user/${userId}${queryString ? '?' + queryString : ''}`);
        },
        getActivePackage: async (userId) => {
            return apiCall(`/purchases/user/${userId}/active`);
        }
    },

    // RESERVATIONS
    reservations: {
        create: async (reservationData) => {
            return apiCall('/reservations', {
                method: 'POST',
                body: JSON.stringify(reservationData)
            });
        },
        cancel: async (reservationId) => {
            return apiCall(`/reservations/${reservationId}`, {
                method: 'DELETE'
            });
        },
        getUserReservations: async (userId, params = {}) => {
            const queryString = new URLSearchParams(params).toString();
            return apiCall(`/reservations/user/${userId}${queryString ? '?' + queryString : ''}`);
        }
    }
};

// Export for use in other files
if (typeof module !== 'undefined' && module.exports) {
    module.exports = apiService;
}

// ======================
// DATA DISPLAY FUNCTIONS
// ======================

// Display packages on the packages page
async function displayPackages() {
    const packagesGrid = document.querySelector('.packages-grid');
    if (!packagesGrid) return;

    try {
        const response = await apiService.packages.getAll({ sortBy: 'creditCount', order: 'asc' });
        const packages = response.data.packages;

        packagesGrid.innerHTML = packages.map(pkg => `
            <div class="package-card">
                <h3 class="package-title">${pkg.name}</h3>
                <div class="package-price">${pkg.price}</div>
                <p class="package-validity">Válido por ${pkg.validDays} días*</p>
                <a href="#" class="btn-comprar" data-package-id="${pkg._id}">Comprar →</a>
            </div>
        `).join('');

        // Add click handlers for purchase buttons
        document.querySelectorAll('.btn-comprar').forEach(btn => {
            btn.addEventListener('click', handlePackagePurchase);
        });

    } catch (error) {
        console.error('Error loading packages:', error);
        packagesGrid.innerHTML = '<p>Error al cargar los paquetes. Por favor, intenta de nuevo.</p>';
    }
}

// Display instructors on landing page
async function displayInstructors() {
    const teamCarousel = document.getElementById('teamCarousel');
    if (!teamCarousel) return;

    try {
        const response = await apiService.instructors.getAll({ limit: 20 });
        const instructors = response.data.instructors;

        teamCarousel.innerHTML = instructors.map(instructor => `
            <div class="team-card">
                <img src="${instructor.profilePictureUrl || 'images/pancakes.png'}" 
                     width="150" height="150" 
                     alt="${instructor.name.first} ${instructor.name.last}"
                     style="border-radius: 50%; object-fit: cover;">
                <h6>${instructor.name.first} ${instructor.name.last}</h6>
                <p class="small">${instructor.certifications[0] || 'Instructor Certificado'}</p>
            </div>
        `).join('');

        // Reinitialize carousel after loading content
        initCarousel('teamCarousel', 'teamPrevBtn', 'teamNextBtn');

    } catch (error) {
        console.error('Error loading instructors:', error);
    }
}

// Display class types on classes page
async function displayClassTypes() {
    const classesGrid = document.querySelector('.classes-grid');
    if (!classesGrid) return;

    try {
        const response = await apiService.classTypes.getAll();
        const classTypes = response.data.classTypes;

        // Map class types to images
        const classImages = {
            'pilates-reformer-beg': 'reformer-bg',
            'pilates-reformer-int': 'reformer-bg',
            'pilates-reformer-adv': 'reformer-bg',
            'power-burn': 'power-burn-bg',
            'yoga-hatha': 'yoga-bg',
            'yoga-vinyasa': 'yoga-bg',
            'sculpt': 'sculpt-bg',
            'pilates-mat-beg': 'mat-bg',
            'pilates-mat-int': 'mat-bg',
            'barre-intensity': 'barre-bg'
        };

        classesGrid.innerHTML = classTypes.map(classType => `
            <div class="class-card ${classImages[classType._id] || 'reformer-bg'}" 
                 onclick="window.location.href='class-detail.html?classType=${classType._id}'">
                <div class="class-content">
                    <h3 class="class-title">${classType.name}</h3>
                    <p class="class-description">${classType.description.substring(0, 100)}...</p>
                    <a href="class-detail.html?classType=${classType._id}" 
                       class="btn-schedule" 
                       onclick="event.stopPropagation()">Agendar</a>
                </div>
            </div>
        `).join('');

    } catch (error) {
        console.error('Error loading class types:', error);
    }
}

// Display calendar with real sessions
async function displayCalendarSessions() {
    const dayContents = document.querySelectorAll('.day-content');
    if (dayContents.length === 0) return;

    const daysMap = {
        'lunes': 1,
        'martes': 2,
        'miercoles': 3,
        'jueves': 4,
        'viernes': 5,
        'sabado': 6
    };

    try {
        // Get sessions for the current week
        const today = new Date();
        const currentWeekStart = new Date(today);
        currentWeekStart.setDate(today.getDate() - today.getDay() + 1); // Monday

        for (const [dayName, dayIndex] of Object.entries(daysMap)) {
            const dayContent = document.getElementById(dayName);
            if (!dayContent) continue;

            const dayDate = new Date(currentWeekStart);
            dayDate.setDate(currentWeekStart.getDate() + dayIndex - 1);

            // Get sessions for this specific day
            const response = await apiService.classSessions.getAll({
                date: dayDate.toISOString().split('T')[0]
            });

            const sessions = response.data.classSessions;
            
            const scheduleGrid = dayContent.querySelector('.schedule-grid');
            if (scheduleGrid) {
                if (sessions.length > 0) {
                    scheduleGrid.innerHTML = sessions.map(session => {
                        const startTime = new Date(session.startsAt);
                        const endTime = new Date(startTime.getTime() + 60 * 60 * 1000); // 1 hour
                        const timeStr = `${startTime.getHours()}:${startTime.getMinutes().toString().padStart(2, '0')} - ${endTime.getHours()}:${endTime.getMinutes().toString().padStart(2, '0')}`;
                        
                        return `
                            <div class="time-slot">
                                <div class="class-type">${session.classTypeId?.name || 'Clase'}</div>
                                <div class="class-name">${session.reservedCount}/${session.capacity}</div>
                                <div class="class-time">${timeStr}</div>
                                ${session.instructorId ? `<div class="capacity-info">${session.instructorId.name.first}</div>` : ''}
                            </div>
                        `;
                    }).join('');
                } else {
                    scheduleGrid.innerHTML = '<p style="text-align: center; padding: 2rem;">No hay clases programadas</p>';
                }
            }
        }
    } catch (error) {
        console.error('Error loading calendar sessions:', error);
    }
}

// Handle package purchase
async function handlePackagePurchase(event) {
    event.preventDefault();
    
    const packageId = event.target.dataset.packageId;
    const token = getAuthToken();
    
    if (!token) {
        window.location.href = 'login.html';
        return;
    }

    // Get user ID from token (you might need to decode the JWT)
    try {
        const tokenPayload = JSON.parse(atob(token.split('.')[1]));
        const userId = tokenPayload.id;

        const purchase = await apiService.purchases.create({
            userId,
            packageId
        });

        showAlert('¡Paquete comprado exitosamente!', 'success');
        setTimeout(() => {
            window.location.href = 'dashboard.html';
        }, 1500);

    } catch (error) {
        showAlert(error.message || 'Error al comprar el paquete', 'error');
    }
}

// Initialize data loading based on current page
document.addEventListener('DOMContentLoaded', function() {
    const currentPage = window.location.pathname.split('/').pop();

    switch(currentPage) {
        case 'packages.html':
            displayPackages();
            break;
        case 'landing-page.html':
        case 'index.html':
        case '':
            displayInstructors();
            break;
        case 'classes.html':
            displayClassTypes();
            break;
        case 'calendar.html':
            displayCalendarSessions();
            break;
    }
});

if (typeof window !== 'undefined') {
    window.API_BASE_URL = API_BASE_URL;
}