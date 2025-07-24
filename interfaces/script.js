// ======================
// DOM UTILITIES
// ======================

document.addEventListener('DOMContentLoaded', function() {
    // Initialize team carousel (only for landing page)
    initCarousel('teamCarousel', 'prevBtn', 'nextBtn');
    
    // Initialize practica carousel (only for class-detail page)
    initPracticaCarousel();
    
    // Initialize calendar (for calendar page)
    initCalendar();
    
    // Initialize fade-in animations
    initFadeAnimations();
    
    // Initialize form handlers
    initAuthForms();
});

// ======================
// TEAM CAROUSEL (Landing Page)
// ======================

function initCarousel(carouselId, prevBtnId, nextBtnId) {
    const carousel = document.getElementById(carouselId);
    const prevBtn = document.getElementById(prevBtnId);
    const nextBtn = document.getElementById(nextBtnId);
    
    if (!carousel || !prevBtn || !nextBtn) return;
    
    const cardWidth = 250 + 32; // card width + gap (2rem = 32px)
    let currentIndex = 0;
    let visibleCards = 3; // Default to showing 3 cards
    
    function calculateVisibleCards() {
        const containerWidth = carousel.parentElement.offsetWidth - 160; // Account for button padding
        visibleCards = Math.floor(containerWidth / cardWidth);
        if (visibleCards < 1) visibleCards = 1; // At least 1 card visible
    }
    
    function updateCarousel() {
        calculateVisibleCards();
        const totalCards = carousel.children.length;
        const maxIndex = Math.max(0, totalCards - visibleCards);
        
        // Ensure currentIndex is within bounds
        if (currentIndex > maxIndex) {
            currentIndex = maxIndex;
        }
        
        const translateX = -currentIndex * cardWidth;
        carousel.style.transform = `translateX(${translateX}px)`;
        
        // Update button states
        prevBtn.disabled = currentIndex === 0;
        nextBtn.disabled = currentIndex >= maxIndex;
        
        // Add visual feedback for disabled state
        prevBtn.style.opacity = currentIndex === 0 ? '0.5' : '1';
        nextBtn.style.opacity = currentIndex >= maxIndex ? '0.5' : '1';
    }
    
    function goNext() {
        const totalCards = carousel.children.length;
        const maxIndex = Math.max(0, totalCards - visibleCards);
        
        if (currentIndex < maxIndex) {
            currentIndex++;
            updateCarousel();
        }
    }
    
    function goPrev() {
        if (currentIndex > 0) {
            currentIndex--;
            updateCarousel();
        }
    }
    
    // Event listeners
    nextBtn.addEventListener('click', goNext);
    prevBtn.addEventListener('click', goPrev);
    
    // Handle window resize with debouncing
    let resizeTimeout;
    window.addEventListener('resize', function() {
        clearTimeout(resizeTimeout);
        resizeTimeout = setTimeout(updateCarousel, 250);
    });
    
    // Initialize after a small delay to ensure proper sizing
    setTimeout(updateCarousel, 100);
}

// ======================
// PRACTICA CAROUSEL (Class Detail Page)
// ======================

function initPracticaCarousel() {
    const carousel = document.getElementById('practicaCarousel');
    const prevBtn = document.getElementById('practicaPrevBtn');
    const nextBtn = document.getElementById('practicaNextBtn');
    
    if (!carousel || !prevBtn || !nextBtn) return;
    
    const cardWidth = 300 + 32; // card width + gap (2rem = 32px)
    let currentIndex = 0;
    
    function updateButtons() {
        prevBtn.disabled = currentIndex === 0;
        nextBtn.disabled = currentIndex >= carousel.children.length - 3; // Assuming 3 cards visible
        
        // Visual feedback for disabled state
        prevBtn.style.opacity = currentIndex === 0 ? '0.5' : '1';
        nextBtn.style.opacity = currentIndex >= carousel.children.length - 3 ? '0.5' : '1';
    }
    
    function scrollToIndex(index) {
        currentIndex = index;
        carousel.scrollTo({
            left: index * cardWidth,
            behavior: 'smooth'
        });
        updateButtons();
    }
    
    function goNext() {
        if (currentIndex < carousel.children.length - 3) {
            scrollToIndex(currentIndex + 1);
        }
    }
    
    function goPrev() {
        if (currentIndex > 0) {
            scrollToIndex(currentIndex - 1);
        }
    }
    
    // Event listeners
    nextBtn.addEventListener('click', goNext);
    prevBtn.addEventListener('click', goPrev);
    
    // Initialize button states
    updateButtons();
}

// ======================
// CALENDAR FUNCTIONS
// ======================

function initCalendar() {
    const dayTabs = document.querySelectorAll('.day-tab');
    
    dayTabs.forEach(tab => {
        tab.addEventListener('click', function() {
            const day = this.getAttribute('data-day');
            showDay(day, this);
        });
    });
}

// Function to show the selected day and highlight the tab
function showDay(day, clickedTab = null) {
        // Hide all day contents
        document.querySelectorAll('.day-content').forEach(content => {
            content.classList.remove('active');
        });

        // Remove active class from all tabs
        document.querySelectorAll('.day-tab').forEach(tab => {
            tab.classList.remove('active');
        });

        // Show selected day content
        const selectedContent = document.getElementById(day);
        if (selectedContent) {
            selectedContent.classList.add('active');
        }

        // Highlight the correct tab
        if (clickedTab) {
            // If called from click event
            clickedTab.classList.add('active');
        } else {
            // If called from URL, find matching tab
            const matchingTab = document.querySelector(`.day-tab[data-day="${day}"]`);
            if (matchingTab) {
                matchingTab.classList.add('active');
            }
        }
}

// ======================
// FADE IN ANIMATIONS
// ======================

function initFadeAnimations() {
    // Handle general fade-in-up elements
    const faders = document.querySelectorAll('.fade-in-up');
  
    const appearOptions = {
      threshold: 0.1,
      rootMargin: '0px 0px -50px 0px'
    };
  
    const appearOnScroll = new IntersectionObserver((entries, observer) => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('visible');
        observer.unobserve(entry.target);
      });
    }, appearOptions);
  
    faders.forEach(fader => {
      appearOnScroll.observe(fader);
    });

    // Handle login page sequential animations
    if (document.getElementById('loginForm')) {
        initLoginAnimations();
    }

    // Handle sign-up page animations
    if (document.getElementById('registroForm')) {
        initSignUpAnimations();
    }
}

function initLoginAnimations() {
    // Sequential animation for login page elements
    const loginElements = [
        '.title', 
        '.subtitle', 
        '.form-label', 
        '.form-control', 
        '.form-row', 
        '.btn-login', 
        '.bottom-link'
    ];

    loginElements.forEach((selector, index) => {
        setTimeout(() => {
            const elements = document.querySelectorAll(selector);
            elements.forEach(el => el.classList.add('visible'));
        }, index * 200);
    });

    // Add input focus effects for login page
    const formControls = document.querySelectorAll('.form-control');
    formControls.forEach(input => {
        input.addEventListener('focus', function() {
            const label = this.parentElement.querySelector('.form-label');
            if (label) {
                label.style.color = '#d4b2a7';
            }
        });
        
        input.addEventListener('blur', function() {
            const label = this.parentElement.querySelector('.form-label');
            if (label) {
                label.style.color = '#000';
            }
        });
    });
}

function initSignUpAnimations() {
    // Handle sign-up page animations
    const signUpElements = document.querySelectorAll('.fade-in-up, .fade-in-left, .fade-in-right, .title-animation');
    
    const appearOptions = {
        threshold: 0.1,
        rootMargin: '0px 0px -50px 0px'
    };

    const appearOnScroll = new IntersectionObserver((entries, observer) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('visible');
                observer.unobserve(entry.target);
            }
        });
    }, appearOptions);

    signUpElements.forEach(el => {
        appearOnScroll.observe(el);
    });
}

// ======================
// AUTHENTICATION FUNCTIONS
// ======================
function validateEmail(email) {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(email);
}

function isStrongPassword(password) {
    // Mínimo 8 caracteres, al menos una letra mayúscula y un número
    const re = /^(?=.*[A-Z])(?=.*\d).{8,}$/;
    return re.test(password);
}

function initAuthForms() {
  // LOGIN FORM HANDLER
  if (document.getElementById('loginForm')) {
    document.getElementById('loginForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      
      const email = document.getElementById('email').value;
      const password = document.getElementById('password').value;
      
      if (!email || !password) {
        showAlert('Por favor completa todos los campos', 'error');
        return;
      }
      
      try {
        const response = await fetch('http://localhost:5000/api/users/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password })
        });

        const data = await response.json();
        
        if (response.ok) {
          localStorage.setItem('token', data.token);
          localStorage.setItem('refreshToken', data.refreshToken);
          localStorage.setItem('userName', data.user.name);
          showAlert('Inicio de sesión exitoso', 'success');
          setTimeout(() => window.location.href = 'dashboard.html', 1500);
        } else {
          showAlert(data.error || 'Error de autenticación', 'error');
        }
      } catch (err) {
        showAlert('Error de conexión con el servidor', 'error');
        console.error('Login error:', err);
      }
    });
  }

  // REGISTRATION FORM HANDLER
  if (document.getElementById('registroForm')) {
    const form = document.getElementById('registroForm');
    
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      
      // Get form data
      const formData = {
        name: `${form.querySelector('#nombre').value} ${form.querySelector('#apellido-paterno').value}`,
        email: form.querySelector('#email').value,
        password: form.querySelector('#password').value,
        dob: form.querySelector('#fecha-nac').value
      };

      // Client-side validation
      if (!validateRegistration(form, formData)) return;

      try {
        const response = await fetch('http://localhost:5000/api/users/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(formData)
        });

        const data = await response.json();
        
        if (response.ok) {
          localStorage.setItem('token', data.token);
          showAlert('¡Registro exitoso! Bienvenido a Shanti Pilates.', 'success');
          setTimeout(() => window.location.href = 'dashboard.html', 1500);
        } else {
          showAlert(data.error || 'Error en el registro', 'error');
        }
      } catch (err) {
        showAlert('Error de conexión con el servidor', 'error');
        console.error('Registration error:', err);
      }
    });

    // Real-time password validation
    const confirmPassword = document.getElementById('confirmar-password');
    if (confirmPassword) {
      confirmPassword.addEventListener('input', function() {
        const password = document.getElementById('password').value;
        const isMatching = password === this.value;
        
        this.style.borderColor = isMatching ? '#e6e6e6' : '#ef4444';
        this.style.backgroundColor = isMatching ? '#f8f9fa' : '#fef2f2';
      });
    }

    // Date picker enhancement
    const dobInput = document.getElementById('fecha-nac');
    if (dobInput) {
      dobInput.addEventListener('focus', function() {
        this.showPicker();
      });
    }
  }
}

function validateRegistration(form, formData) {
  // Check required fields
  if (!formData.name.trim() || !formData.email || !formData.password || !formData.dob) {
    showAlert('Por favor, completa todos los campos obligatorios.', 'error');
    return false;
  }

  // Check password match
  const confirmPassword = form.querySelector('#confirmar-password').value;
  if (formData.password !== confirmPassword) {
    showAlert('Las contraseñas no coinciden.', 'error');
    return false;
  }

  // Check password 
  if (formData.password.length < 8) {
    showAlert('La contraseña debe tener al menos 8 caracteres.', 'error');
    return false;
  }

  // Check password 
  if (!isStrongPassword(formData.password)) {
        showAlert('La contraseña debe tener al menos 8 caracteres, incluyendo una mayúscula y un número.', 'error');
        return false;
    }

  // Check email format
  if (!validateEmail(formData.email)) {
    showAlert('Por favor ingresa un email válido.', 'error');
    return false;
  }

  // Check age (minimum 16 years)
  const dob = new Date(formData.dob);
  const today = new Date();
  let age = today.getFullYear() - dob.getFullYear();
  const monthDiff = today.getMonth() - dob.getMonth();
  
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dob.getDate())) {
    age--;
  }
  
  if (age < 16) {
    showAlert('Debes tener al menos 16 años para registrarte.', 'error');
    return false;
  }

  return true;
}

// ======================
// UI UTILITIES
// ======================

function showAlert(message, type = 'success') {
  // Remove any existing alerts first
  const existingAlert = document.querySelector('.custom-alert');
  if (existingAlert) existingAlert.remove();

  // Create alert element
  const alertDiv = document.createElement('div');
  alertDiv.className = `custom-alert alert-${type}`;
  alertDiv.textContent = message;
  
  // Style the alert
  alertDiv.style.position = 'fixed';
  alertDiv.style.top = '20px';
  alertDiv.style.right = '20px';
  alertDiv.style.padding = '15px 25px';
  alertDiv.style.borderRadius = '8px';
  alertDiv.style.color = 'white';
  alertDiv.style.zIndex = '1000';
  alertDiv.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)';
  
  // Set color based on type
  if (type === 'error') {
    alertDiv.style.backgroundColor = '#ef4444';
  } else {
    alertDiv.style.backgroundColor = '#10b981';
  }
  
  document.body.appendChild(alertDiv);
  
  // Auto-remove after 5 seconds
  setTimeout(() => {
    alertDiv.style.opacity = '0';
    alertDiv.style.transition = 'opacity 0.5s ease';
    setTimeout(() => alertDiv.remove(), 500);
  }, 5000);
}