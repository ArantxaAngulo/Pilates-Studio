// Scroll
document.addEventListener('DOMContentLoaded', function() {
    // Initialize both carousels
    initCarousel('teamCarousel', 'prevBtn', 'nextBtn');
    //initCarousel('practicaCarousel', 'prevBtn', 'nextBtn');
});

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

// CHANGE
document.addEventListener('DOMContentLoaded', function() {
    const carousel = document.getElementById('practicaCarousel');
    const prevBtn = document.getElementById('prevBtn');
    const nextBtn = document.getElementById('nextBtn');
    
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
    
});

// FADE IN
document.addEventListener('DOMContentLoaded', () => {
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
});
