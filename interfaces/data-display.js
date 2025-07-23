// Functions to fetch and display seeded data on the frontend

// ======================
// PACKAGES PAGE
// ======================
async function displayPackages() {
    // This function is not used anymore as packages.html has its own implementation
    // with MercadoPago integration
    return;
}

// ======================
// LANDING PAGE - TEAM
// ======================
async function displayInstructors() {
    const teamCarousel = document.getElementById('teamCarousel');
    if (!teamCarousel) return;

    try {
        const response = await apiService.instructors.getAll({ limit: 20 });
        const instructors = response.data.instructors;

        teamCarousel.innerHTML = instructors.map(instructor => {
            const fullName = `${instructor.name.first} ${instructor.name.last}`;
            const primaryCert = instructor.certifications[0] || 'Instructor Certificado';
            
            return `
                <div class="team-card">
                    <img src="${instructor.profilePictureUrl}" 
                         width="150" height="150" 
                         alt="${fullName}"
                         style="border-radius: 50%; object-fit: cover;">
                    <h6>${fullName}</h6>
                    <p class="small">${primaryCert}</p>
                </div>
            `;
        }).join('');

        // Reinitialize carousel after loading content
        if (typeof initCarousel === 'function') {
            setTimeout(() => {
                initCarousel('teamCarousel', 'teamPrevBtn', 'teamNextBtn');
            }, 100);
        }

    } catch (error) {
        console.error('Error loading instructors:', error);
        teamCarousel.innerHTML = '<p class="text-center">Error al cargar instructores</p>';
    }
}

// ======================
// CLASSES PAGE
// ======================
async function displayClassTypes() {
    const classesGrid = document.querySelector('.classes-grid');
    if (!classesGrid) return;

    try {
        const response = await apiService.classTypes.getAll();
        const classTypes = response.data.classTypes;

        // Map class types to background images
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

        // Group by base type for better display
        const groupedTypes = {};
        classTypes.forEach(type => {
            const baseType = type.name.replace(/ (Intermedio|Avanzado)$/, '');
            if (!groupedTypes[baseType]) {
                groupedTypes[baseType] = [];
            }
            groupedTypes[baseType].push(type);
        });

        // Display unique class types
        const displayTypes = Object.entries(groupedTypes).map(([baseType, types]) => {
            const mainType = types[0]; // Use first type for display
            return `
                <div class="class-card ${classImages[mainType._id] || 'reformer-bg'}" 
                     onclick="window.location.href='class-detail.html?classType=${mainType._id}'">
                    <div class="class-content">
                        <h3 class="class-title">${baseType}</h3>
                        <p class="class-description">${mainType.description.substring(0, 100)}...</p>
                        <a href="class-detail.html?classType=${mainType._id}" 
                           class="btn-schedule" 
                           onclick="event.stopPropagation()">Agendar</a>
                    </div>
                </div>
            `;
        });

        classesGrid.innerHTML = displayTypes.join('');

    } catch (error) {
        console.error('Error loading class types:', error);
        classesGrid.innerHTML = '<p class="text-center text-danger">Error al cargar las clases</p>';
    }
}

// ======================
// CALENDAR PAGE
// ======================
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
        // Get current week's Monday
        const today = new Date();
        const currentDay = today.getDay();
        const diff = today.getDate() - currentDay + (currentDay === 0 ? -6 : 1);
        const monday = new Date(today.setDate(diff));

        // Generate sample sessions for demo (since DB might not have future sessions)
        const classTypes = await apiService.classTypes.getAll();
        const instructors = await apiService.instructors.getAll();
        
        for (const [dayName, dayIndex] of Object.entries(daysMap)) {
            const dayContent = document.getElementById(dayName);
            if (!dayContent) continue;

            const scheduleGrid = dayContent.querySelector('.schedule-grid');
            if (scheduleGrid) {
                // For demo purposes, create sample schedule
                const timeSlots = ['6:00 AM', '7:00 AM', '8:00 AM', '9:00 AM'];
                
                scheduleGrid.innerHTML = timeSlots.map((time, index) => {
                    // Random class type and instructor
                    const classType = classTypes.data.classTypes[Math.floor(Math.random() * classTypes.data.classTypes.length)];
                    const instructor = instructors.data.instructors[Math.floor(Math.random() * instructors.data.instructors.length)];
                    const reserved = Math.floor(Math.random() * 8) + 1;
                    
                    return `
                        <div class="time-slot">
                            <div class="class-type">${classType.name}</div>
                            <div class="class-name">${reserved}/10</div>
                            <div class="class-time">${time} - ${parseInt(time) + 1}:00 ${time.includes('AM') ? 'AM' : 'PM'}</div>
                            <div class="capacity-info">${instructor.name.first}</div>
                        </div>
                    `;
                }).join('');
            }
        }
    } catch (error) {
        console.error('Error loading calendar sessions:', error);
    }
}

// ======================
// CLASS DETAIL PAGE
// ======================
async function displayClassDetail() {
    // Get class type from URL params
    const urlParams = new URLSearchParams(window.location.search);
    const classTypeId = urlParams.get('classType');
    
    if (!classTypeId) return;

    try {
        // Load class type details
        const classType = await apiService.classTypes.getById(classTypeId);
        
        // Update page with class details
        const titleElement = document.querySelector('.hero-title-detail');
        const subtitleElement = document.querySelector('.hero-subtitle');
        
        if (titleElement) titleElement.textContent = classType.data.classType.name;
        if (subtitleElement) subtitleElement.textContent = classType.data.classType.description;

        // Load available sessions for this class type
        const sessions = await apiService.classSessions.getAvailable({ classTypeId });
        
        // Update calendar and time slots with real data
        displayAvailableSessions(sessions.data.availableSessions);

    } catch (error) {
        console.error('Error loading class details:', error);
    }
}

// ======================
// HELPER FUNCTIONS
// ======================

async function handlePackagePurchase(event) {
    event.preventDefault();
    
    const packageId = event.target.dataset.packageId;
    const token = getAuthToken();
    
    if (!token) {
        // Save intended action and redirect to login
        sessionStorage.setItem('intendedAction', JSON.stringify({
            action: 'purchasePackage',
            packageId: packageId
        }));
        window.location.href = 'login.html';
        return;
    }

    try {
        // Decode token to get user ID
        const tokenPayload = JSON.parse(atob(token.split('.')[1]));
        const userId = tokenPayload.id;

        // Check if user already has an active package
        const activePackage = await apiService.purchases.getActivePackage(userId);
        
        if (activePackage.data.activePackage) {
            showAlert('Ya tienes un paquete activo. Debes usarlo antes de comprar otro.', 'error');
            return;
        }

        // Create purchase
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

function displayAvailableSessions(sessions) {
    // Group sessions by date
    const sessionsByDate = {};
    
    sessions.forEach(session => {
        const date = new Date(session.startsAt).toDateString();
        if (!sessionsByDate[date]) {
            sessionsByDate[date] = [];
        }
        sessionsByDate[date].push(session);
    });

    // Update calendar to show available dates
    // Update time slots for selected date
    // This would need to be integrated with your existing calendar UI
}

// ======================
// PAGE INITIALIZATION
// ======================

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
            // Also load class types for the carousel if needed
            break;
        case 'classes.html':
            displayClassTypes();
            break;
        case 'calendar.html':
            displayCalendarSessions();
            break;
        case 'class-detail.html':
            displayClassDetail();
            break;
    }

    // Check for intended actions after login
    const intendedAction = sessionStorage.getItem('intendedAction');
    if (intendedAction && getAuthToken()) {
        const action = JSON.parse(intendedAction);
        sessionStorage.removeItem('intendedAction');
        
        if (action.action === 'purchasePackage') {
            // Trigger package purchase
            const purchaseBtn = document.querySelector(`[data-package-id="${action.packageId}"]`);
            if (purchaseBtn) purchaseBtn.click();
        }
    }
});