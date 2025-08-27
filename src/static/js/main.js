// Global variables
let currentBookingData = {};
let roomsData = [];

// Initialize the application
document.addEventListener('DOMContentLoaded', function() {
    setMinDates();
    loadRooms();
    setupEventListeners();
    monitorConnection();
});

// Set minimum dates for check-in and check-out
function setMinDates() {
    const today = new Date().toISOString().split('T')[0];
    const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];
    
    document.getElementById('checkIn').min = today;
    document.getElementById('checkIn').value = today;
    document.getElementById('checkOut').min = tomorrow;
    document.getElementById('checkOut').value = tomorrow;
}

// Setup event listeners
function setupEventListeners() {
    // Search form submission
    document.getElementById('searchForm').addEventListener('submit', handleSearch);
    
    // Date change listeners
    document.getElementById('checkIn').addEventListener('change', function() {
        const checkInDate = new Date(this.value);
        const nextDay = new Date(checkInDate.getTime() + 86400000);
        document.getElementById('checkOut').min = nextDay.toISOString().split('T')[0];
        
        if (document.getElementById('checkOut').value <= this.value) {
            document.getElementById('checkOut').value = nextDay.toISOString().split('T')[0];
        }
    });
    
    // Booking form submission
    document.getElementById('bookingForm').addEventListener('submit', handleBooking);
    
    // Breakfast checkbox change
    document.getElementById('breakfast').addEventListener('change', updatePriceSummary);
    
    // Add event listeners for booking form date changes
    document.addEventListener('change', function(e) {
        if (e.target.id === 'bookingCheckIn' || e.target.id === 'bookingCheckOut' || e.target.id === 'bookingAdults') {
            // Validate dates first
            const checkIn = document.getElementById('bookingCheckIn').value;
            const checkOut = document.getElementById('bookingCheckOut').value;
            
            if (checkIn && checkOut) {
                if (new Date(checkIn) >= new Date(checkOut)) {
                    showNotification('Check-out date must be after check-in date', 'error');
                    return;
                }
                // Update pricing when booking dates change
                updatePriceSummary();
            }
        }
    });
}

// Load rooms data
async function loadRooms() {
    try {
        showLoading(true);
        const response = await fetch('/api/rooms');
        roomsData = await response.json();
        displayRooms(roomsData);
    } catch (error) {
        console.error('Error loading rooms:', error);
        showNotification('Error loading rooms data', 'error');
    } finally {
        showLoading(false);
    }
}

// Display rooms in the grid
function displayRooms(rooms, pricing = null, availability = null) {
    const roomsGrid = document.getElementById('roomsGrid');
    roomsGrid.innerHTML = '';
    
    rooms.forEach((room, index) => {
        const roomCard = createRoomCard(room, pricing, availability, index);
        roomsGrid.appendChild(roomCard);
    });
}

// Create individual room card
function createRoomCard(room, pricing = null, availability = null, index = 0) {
    const roomCard = document.createElement('div');
    roomCard.className = 'room-card';
    roomCard.style.animationDelay = `${index * 0.1}s`;
    
    const isAvailable = availability ? availability[room.Room_Type] > 0 : true;
    const currentPrice = pricing ? calculateRoomPrice(room.Room_Type, pricing) : room.Base_Price;
    
    // Use a placeholder image or gradient if image is not available
    const roomImage = room.Image_URL ? `/static/images/${room.Image_URL}` : '';
    let backgroundStyle;
    
    if (roomImage) {
        backgroundStyle = `background-image: url('${roomImage}');`;
    } else {
        // Apply room-type specific gradients
        switch(room.Room_Type.toLowerCase()) {
            case 'standard':
                backgroundStyle = 'background: linear-gradient(135deg, #4facfe 0%, #00f2fe 100%);';
                break;
            case 'deluxe':
                backgroundStyle = 'background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);';
                break;
            case 'suite':
                backgroundStyle = 'background: linear-gradient(135deg, #c9b037 0%, #f4d03f 100%);';
                break;
            default:
                backgroundStyle = 'background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);';
        }
    }
    
    roomCard.innerHTML = `
        <div class="room-image" style="${backgroundStyle}" onerror="this.style.background='linear-gradient(135deg, #667eea 0%, #764ba2 100%)'">
            <div class="room-badge">${room.Room_Type}</div>
        </div>
        <div class="room-content">
            <h3 class="room-title">${room.Room_Type} Room</h3>
            <div class="room-features">
                <span><i class="fas fa-users"></i> ${room.Max_Occupancy} Guests</span>
                <span><i class="fas fa-wifi"></i> Free WiFi</span>
                <span><i class="fas fa-tv"></i> Smart TV</span>
            </div>
            <p class="room-description">${room.Description}</p>
            <div class="room-price">
                ${currentPrice}<span>/night</span>
            </div>
            <button class="book-now-btn" 
                    ${!isAvailable ? 'disabled' : ''} 
                    onclick="openBookingModal('${room.Room_Type}', ${currentPrice})">
                <i class="fas fa-calendar-check"></i>
                ${isAvailable ? 'Book Now' : 'Not Available'}
            </button>
            ${availability && availability[room.Room_Type] <= 3 && availability[room.Room_Type] > 0 ? 
                `<p class="availability-warning">Only ${availability[room.Room_Type]} rooms left!</p>` : ''}
        </div>
    `;
    
    return roomCard;
}

// Handle search form submission
async function handleSearch(e) {
    e.preventDefault();
    
    const formData = new FormData(e.target);
    const searchData = {
        check_in: formData.get('checkIn'),
        check_out: formData.get('checkOut'),
        adults: formData.get('adults')
    };
    
    // Validate dates
    if (new Date(searchData.check_in) >= new Date(searchData.check_out)) {
        showNotification('Check-out date must be after check-in date', 'error');
        return;
    }
    
    try {
        showLoading(true);
        
        // Get pricing and availability
        const [pricingResponse, availabilityResponse] = await Promise.all([
            fetch('/api/pricing', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(searchData)
            }),
            fetch('/api/availability', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(searchData)
            })
        ]);
        
        // Check if responses are ok
        if (!pricingResponse.ok || !availabilityResponse.ok) {
            throw new Error('Failed to fetch pricing or availability data');
        }
        
        const pricing = await pricingResponse.json();
        const availability = await availabilityResponse.json();
        
        // Check for error responses
        if (pricing.error) {
            throw new Error(pricing.error);
        }
        if (availability.error) {
            throw new Error(availability.error);
        }
        
        // Update global search data
        currentBookingData = { ...searchData, pricing, availability };
        
        // Display updated rooms
        displayRooms(roomsData, pricing, availability);
        
        // Scroll to rooms section
        document.getElementById('rooms').scrollIntoView({ behavior: 'smooth' });
        
        showNotification('Search completed successfully!', 'success');
        
    } catch (error) {
        console.error('Search error:', error);
        
        // Show detailed error message
        let errorMessage = 'An unexpected error occurred while searching for rooms.';
        
        if (error.message.includes('Failed to fetch')) {
            errorMessage = 'Unable to connect to the server. Please check your internet connection and try again.';
        } else if (error.message.includes('pricing') || error.message.includes('availability')) {
            errorMessage = 'Error retrieving room data. This might be due to invalid dates or server issues.';
        } else if (error.message) {
            errorMessage = error.message;
        }
        
        showNotification(errorMessage, 'error');
        
        // Also display error in the results area
        const roomsGrid = document.getElementById('roomsGrid');
        if (roomsGrid) {
            roomsGrid.innerHTML = `
                <div class="error-display">
                    <div class="error-icon">⚠️</div>
                    <h3>Search Error</h3>
                    <p>${errorMessage}</p>
                    <button onclick="searchWithRetry()" class="btn btn-primary">Try Again</button>
                </div>
            `;
        }
        
    } finally {
        showLoading(false);
    }
}

// Calculate room price based on search criteria
function calculateRoomPrice(roomType, pricing) {
    if (!pricing || pricing.length === 0) return 0;
    
    const roomPricing = pricing.filter(p => p.Room_Type === roomType);
    if (roomPricing.length === 0) return 0;
    
    // Calculate average price for the stay period
    const totalPrice = roomPricing.reduce((sum, day) => {
        const adults = parseInt(currentBookingData.adults) || 1;
        let dayPrice = adults === 1 ? day.Single_Rate : day.Double_Rate;
        
        if (adults > 2) {
            dayPrice += (adults - 2) * day.Extra_Person;
        }
        
        return sum + dayPrice;
    }, 0);
    
    return Math.round(totalPrice / roomPricing.length);
}

// Open booking modal
async function openBookingModal(roomType, basePrice) {
    const modal = document.getElementById('bookingModal');
    
    // Populate booking details
    const checkIn = document.getElementById('checkIn').value;
    const checkOut = document.getElementById('checkOut').value;
    const adults = document.getElementById('adults').value;
    
    if (!checkIn || !checkOut) {
        showNotification('Please select check-in and check-out dates first', 'error');
        return;
    }
    
    // Calculate nights
    const nights = Math.ceil((new Date(checkOut) - new Date(checkIn)) / (1000 * 60 * 60 * 24));
    
    // Update global booking data
    currentBookingData = {
        ...currentBookingData,
        room_type: roomType,
        base_price: basePrice,
        nights: nights,
        check_in: checkIn,
        check_out: checkOut,
        adults: adults
    };
    
    // Populate the booking form fields with search data
    document.getElementById('bookingCheckIn').value = checkIn;
    document.getElementById('bookingCheckOut').value = checkOut;
    document.getElementById('bookingAdults').value = adults;
    
    // Set minimum dates for booking form
    const today = new Date().toISOString().split('T')[0];
    const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];
    document.getElementById('bookingCheckIn').min = today;
    document.getElementById('bookingCheckOut').min = tomorrow;
    
    // Populate booking details section
    const bookingDetails = document.getElementById('bookingDetails');
    bookingDetails.innerHTML = `
        <h3>Booking Summary</h3>
        <div class="booking-info">
            <p><strong>Room Type:</strong> ${roomType}</p>
            <p><strong>Check-in:</strong> ${formatDate(checkIn)}</p>
            <p><strong>Check-out:</strong> ${formatDate(checkOut)}</p>
            <p><strong>Duration:</strong> ${nights} night${nights > 1 ? 's' : ''}</p>
            <p><strong>Guests:</strong> ${adults} adult${adults > 1 ? 's' : ''}</p>
        </div>
    `;
    
    // Calculate and display initial price
    await updatePriceSummary();
    
    // Show modal with animation
    modal.style.display = 'block';
    setTimeout(() => modal.classList.add('show'), 10);
}

// Update price summary
async function updatePriceSummary() {
    try {
        const breakfast = document.getElementById('breakfast').checked;
        
        // Use booking form values if available, otherwise fall back to search form values
        const checkIn = document.getElementById('bookingCheckIn').value || 
                       currentBookingData.check_in || 
                       document.getElementById('checkIn').value;
        const checkOut = document.getElementById('bookingCheckOut').value || 
                        currentBookingData.check_out || 
                        document.getElementById('checkOut').value;
        const adults = document.getElementById('bookingAdults').value || 
                      currentBookingData.adults || 
                      document.getElementById('adults').value;
        
        const response = await fetch('/api/calculate-price', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                check_in: checkIn,
                check_out: checkOut,
                room_type: currentBookingData.room_type,
                adults: adults,
                breakfast: breakfast
            })
        });
        
        const priceData = await response.json();
        
        const priceSummary = document.getElementById('priceSummary');
        priceSummary.innerHTML = `
            <h3>Price Breakdown</h3>
            <div class="price-item">
                <span>Room Rate (${priceData.nights} nights)</span>
                <span>$${(priceData.total_price - (breakfast ? priceData.nights * 25 : 0)).toFixed(2)}</span>
            </div>
            ${breakfast ? `
                <div class="price-item">
                    <span>Breakfast (${priceData.nights} nights)</span>
                    <span>$${(priceData.nights * 25).toFixed(2)}</span>
                </div>
            ` : ''}
            <div class="price-item total">
                <span><strong>Total Amount</strong></span>
                <span><strong>$${priceData.total_price.toFixed(2)}</strong></span>
            </div>
        `;
        
        currentBookingData.total_amount = priceData.total_price;
        
    } catch (error) {
        console.error('Error updating price:', error);
        showNotification('Error calculating price', 'error');
    }
}

// Handle booking form submission
async function handleBooking(e) {
    e.preventDefault();
    
    // Get the submit button and add loading state
    const submitButton = document.querySelector('.book-button');
    const originalContent = submitButton.innerHTML;
    
    submitButton.innerHTML = `
        <div class="button-loader">
            <div class="loader-spinner"></div>
        </div>
        Processing...
    `;
    submitButton.disabled = true;
    
    const formData = new FormData(e.target);
    const bookingData = {
        ...currentBookingData,
        check_in: document.getElementById('bookingCheckIn').value,
        check_out: document.getElementById('bookingCheckOut').value,
        adults: document.getElementById('bookingAdults').value,
        guest_name: formData.get('guestName') || document.getElementById('guestName').value,
        email: formData.get('guestEmail') || document.getElementById('guestEmail').value,
        phone: formData.get('guestPhone') || document.getElementById('guestPhone').value,
        breakfast: document.getElementById('breakfast').checked
    };
    
    // Validate required fields
    if (!bookingData.guest_name || !bookingData.email || !bookingData.phone) {
        showNotification('Please fill in all required fields', 'error');
        submitButton.innerHTML = originalContent;
        submitButton.disabled = false;
        return;
    }
    
    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(bookingData.email)) {
        showNotification('Please enter a valid email address', 'error');
        submitButton.innerHTML = originalContent;
        submitButton.disabled = false;
        return;
    }
    
    try {
        const response = await fetch('/api/book', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(bookingData)
        });
        
        const result = await response.json();
        
        if (result.success) {
            showNotification(`Booking confirmed! Your booking ID is: ${result.booking_id}`, 'success');
            closeModal();
            
            // Reset form
            document.getElementById('searchForm').reset();
            setMinDates();
            
            // Refresh rooms display
            displayRooms(roomsData);
            
            // Show confirmation details
            showBookingConfirmation(result.booking_id, bookingData);
        } else {
            throw new Error(result.message || 'Booking failed');
        }
        
    } catch (error) {
        console.error('Booking error:', error);
        
        // Show detailed error message
        let errorMessage = 'An unexpected error occurred while processing your booking.';
        
        if (error.message.includes('Failed to fetch')) {
            errorMessage = 'Unable to connect to the server. Please check your internet connection and try again.';
        } else if (error.message.includes('validation')) {
            errorMessage = 'Please check that all required fields are filled correctly.';
        } else if (error.message.includes('availability')) {
            errorMessage = 'This room is no longer available for the selected dates. Please choose different dates or another room.';
        } else if (error.message) {
            errorMessage = error.message;
        }
        
        showNotification(errorMessage, 'error');
        
    } finally {
        submitButton.innerHTML = originalContent;
        submitButton.disabled = false;
    }
}

// Show booking confirmation
function showBookingConfirmation(bookingId, bookingData) {
    // Create the confirmation modal HTML
    const confirmationHTML = `
        <div class="confirmation-modal" id="confirmationModal">
            <div class="confirmation-backdrop" onclick="closeConfirmation()"></div>
            <div class="confirmation-content">
                <div class="confirmation-header">
                    <div class="success-animation">
                        <div class="checkmark-circle">
                            <div class="checkmark"></div>
                        </div>
                    </div>
                    <h2>Booking Confirmed!</h2>
                    <p class="confirmation-subtitle">Thank you for choosing our hotel</p>
                </div>
                
                <div class="confirmation-body">
                    <div class="booking-ref-card">
                        <div class="ref-header">
                            <i class="fas fa-ticket-alt"></i>
                            <span>Booking Reference</span>
                        </div>
                        <div class="ref-number">#${bookingId.toString().padStart(6, '0')}</div>
                    </div>
                    
                    <div class="confirmation-details">
                        <h3><i class="fas fa-info-circle"></i> Booking Details</h3>
                        <div class="detail-grid">
                            <div class="detail-item">
                                <span class="detail-label">Guest Name:</span>
                                <span class="detail-value">${bookingData.guest_name}</span>
                            </div>
                            <div class="detail-item">
                                <span class="detail-label">Email:</span>
                                <span class="detail-value">${bookingData.email}</span>
                            </div>
                            <div class="detail-item">
                                <span class="detail-label">Phone:</span>
                                <span class="detail-value">${bookingData.phone}</span>
                            </div>
                            <div class="detail-item">
                                <span class="detail-label">Room Type:</span>
                                <span class="detail-value">${bookingData.room_type}</span>
                            </div>
                            <div class="detail-item">
                                <span class="detail-label">Check-in:</span>
                                <span class="detail-value">${formatDate(bookingData.check_in)}</span>
                            </div>
                            <div class="detail-item">
                                <span class="detail-label">Check-out:</span>
                                <span class="detail-value">${formatDate(bookingData.check_out)}</span>
                            </div>
                            <div class="detail-item">
                                <span class="detail-label">Guests:</span>
                                <span class="detail-value">${bookingData.adults} Adult${bookingData.adults > 1 ? 's' : ''}</span>
                            </div>
                            ${bookingData.breakfast ? `
                                <div class="detail-item">
                                    <span class="detail-label">Breakfast:</span>
                                    <span class="detail-value">Included <i class="fas fa-coffee text-gold"></i></span>
                                </div>
                            ` : ''}
                        </div>
                        
                        <div class="total-amount">
                            <span>Total Amount:</span>
                            <span class="amount">$${bookingData.total_amount.toFixed(2)}</span>
                        </div>
                    </div>
                    
                    <div class="confirmation-message">
                        <div class="message-icon">
                            <i class="fas fa-envelope"></i>
                        </div>
                        <div class="message-text">
                            <p><strong>Confirmation email sent!</strong></p>
                            <p>A detailed confirmation has been sent to <strong>${bookingData.email}</strong></p>
                        </div>
                    </div>
                </div>
                
                <div class="confirmation-actions">
                    <button class="print-btn" onclick="printConfirmation()">
                        <i class="fas fa-print"></i>
                        Print Confirmation
                    </button>
                    <button class="close-confirmation-btn" onclick="closeConfirmation()">
                        <i class="fas fa-check"></i>
                        Got it, Thanks!
                    </button>
                </div>
            </div>
        </div>
    `;
    
    // Remove any existing confirmation modal
    const existingModal = document.getElementById('confirmationModal');
    if (existingModal) {
        existingModal.remove();
    }
    
    // Add the modal to the page
    document.body.insertAdjacentHTML('beforeend', confirmationHTML);
    
    // Show the modal with animation
    setTimeout(() => {
        document.getElementById('confirmationModal').classList.add('show');
    }, 100);
    
    // Auto-scroll to top when modal opens
    document.body.style.overflow = 'hidden';
}

// Close booking confirmation
function closeConfirmation() {
    const confirmation = document.getElementById('confirmationModal');
    if (confirmation) {
        confirmation.classList.remove('show');
        setTimeout(() => {
            confirmation.remove();
            document.body.style.overflow = 'auto'; // Restore scrolling
        }, 300);
    }
}

// Print confirmation function
function printConfirmation() {
    // Create a printable version of the confirmation
    const confirmationContent = document.querySelector('.confirmation-content').cloneNode(true);
    
    // Remove the action buttons from print version
    const actions = confirmationContent.querySelector('.confirmation-actions');
    if (actions) actions.remove();
    
    // Create print window
    const printWindow = window.open('', '_blank');
    printWindow.document.write(`
        <html>
        <head>
            <title>Booking Confirmation</title>
            <style>
                body { 
                    font-family: Arial, sans-serif; 
                    padding: 20px; 
                    max-width: 600px; 
                    margin: 0 auto;
                }
                .confirmation-content { 
                    background: white; 
                    padding: 20px; 
                    border-radius: 10px;
                    box-shadow: 0 0 10px rgba(0,0,0,0.1);
                }
                .confirmation-header { 
                    text-align: center; 
                    margin-bottom: 30px; 
                }
                .booking-ref-card {
                    background: #f8f9fa;
                    padding: 15px;
                    border-radius: 8px;
                    text-align: center;
                    margin: 20px 0;
                }
                .ref-number {
                    font-size: 24px;
                    font-weight: bold;
                    color: #28a745;
                }
                .detail-grid {
                    display: grid;
                    grid-template-columns: 1fr 1fr;
                    gap: 10px;
                    margin: 15px 0;
                }
                .detail-item {
                    padding: 8px 0;
                    border-bottom: 1px solid #eee;
                }
                .detail-label {
                    font-weight: bold;
                    color: #666;
                }
                .total-amount {
                    background: #f8f9fa;
                    padding: 15px;
                    border-radius: 8px;
                    display: flex;
                    justify-content: space-between;
                    font-size: 18px;
                    font-weight: bold;
                    margin: 20px 0;
                }
                .amount { color: #28a745; }
                @media print {
                    body { padding: 0; }
                }
            </style>
        </head>
        <body>
            ${confirmationContent.outerHTML}
        </body>
        </html>
    `);
    
    printWindow.document.close();
    printWindow.focus();
    
    setTimeout(() => {
        printWindow.print();
        printWindow.close();
    }, 250);
}

// Close booking modal
function closeModal() {
    const modal = document.getElementById('bookingModal');
    modal.style.display = 'none';
    modal.classList.remove('show');
    
    // Reset modal to first step
    resetModalToFirstStep();
    
    // Reset form
    document.getElementById('bookingForm').reset();
}

// Modal step navigation functions
function nextStep(stepNumber) {
    // Validate current step before proceeding
    const currentStep = document.querySelector('.booking-step.active').getAttribute('data-step');
    
    if (currentStep === '1') {
        // No validation needed for step 1, just proceed
    } else if (currentStep === '2') {
        // Validate booking dates and guest information
        const bookingCheckIn = document.getElementById('bookingCheckIn').value;
        const bookingCheckOut = document.getElementById('bookingCheckOut').value;
        const bookingAdults = document.getElementById('bookingAdults').value;
        const guestName = document.getElementById('guestName').value.trim();
        const guestEmail = document.getElementById('guestEmail').value.trim();
        const guestPhone = document.getElementById('guestPhone').value.trim();
        
        if (!bookingCheckIn || !bookingCheckOut || !bookingAdults) {
            showNotification('Please fill in all booking details (dates and number of guests)', 'error');
            return;
        }
        
        if (!guestName || !guestEmail || !guestPhone) {
            showNotification('Please fill in all required guest information fields', 'error');
            return;
        }
        
        // Validate dates
        if (new Date(bookingCheckIn) >= new Date(bookingCheckOut)) {
            showNotification('Check-out date must be after check-in date', 'error');
            return;
        }
        
        // Validate email format
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(guestEmail)) {
            showNotification('Please enter a valid email address', 'error');
            return;
        }
        
        // Update booking data with form values
        currentBookingData.check_in = bookingCheckIn;
        currentBookingData.check_out = bookingCheckOut;
        currentBookingData.adults = bookingAdults;
    }
    
    // Hide current step
    const currentStepElement = document.querySelector('.booking-step.active');
    currentStepElement.classList.remove('active');
    
    // Show next step
    const nextStepElement = document.querySelector(`.booking-step[data-step="${stepNumber}"]`);
    nextStepElement.classList.add('active');
    
    // Update progress indicators
    updateProgressIndicators(stepNumber);
    
    // If moving to step 3, update the final price summary
    if (stepNumber === 3) {
        updatePriceSummary();
    }
}

function prevStep(stepNumber) {
    // Hide current step
    const currentStepElement = document.querySelector('.booking-step.active');
    currentStepElement.classList.remove('active');
    
    // Show previous step
    const prevStepElement = document.querySelector(`.booking-step[data-step="${stepNumber}"]`);
    prevStepElement.classList.add('active');
    
    // Update progress indicators
    updateProgressIndicators(stepNumber);
}

function updateProgressIndicators(activeStep) {
    const progressSteps = document.querySelectorAll('.progress-step');
    progressSteps.forEach((step, index) => {
        const stepNumber = index + 1;
        if (stepNumber <= activeStep) {
            step.classList.add('active');
        } else {
            step.classList.remove('active');
        }
    });
}

function resetModalToFirstStep() {
    // Hide all steps
    const allSteps = document.querySelectorAll('.booking-step');
    allSteps.forEach(step => step.classList.remove('active'));
    
    // Show first step
    const firstStep = document.querySelector('.booking-step[data-step="1"]');
    firstStep.classList.add('active');
    
    // Reset progress indicators
    updateProgressIndicators(1);
    
    // Clear booking form fields
    document.getElementById('bookingCheckIn').value = '';
    document.getElementById('bookingCheckOut').value = '';
    document.getElementById('bookingAdults').value = '';
    document.getElementById('guestName').value = '';
    document.getElementById('guestEmail').value = '';
    document.getElementById('guestPhone').value = '';
    document.getElementById('specialRequests').value = '';
    document.getElementById('breakfast').checked = false;
}

// Enhanced form validation
function validateBookingForm() {
    const form = document.getElementById('bookingModal');
    let isValid = true;
    const errors = [];
    
    // Clear previous errors
    document.querySelectorAll('.form-group.error').forEach(group => {
        group.classList.remove('error');
    });
    document.querySelectorAll('.field-error').forEach(error => {
        error.remove();
    });
    
    // Validate required fields
    const requiredFields = {
        'firstName': 'First Name',
        'lastName': 'Last Name',
        'email': 'Email',
        'phone': 'Phone Number',
        'checkIn': 'Check-in Date',
        'checkOut': 'Check-out Date',
        'guests': 'Number of Guests'
    };
    
    for (const [fieldId, fieldName] of Object.entries(requiredFields)) {
        const field = document.getElementById(fieldId);
        if (field && (!field.value || field.value.trim() === '')) {
            markFieldAsError(field, `${fieldName} is required`);
            errors.push(`${fieldName} is required`);
            isValid = false;
        }
    }
    
    // Validate email format
    const emailField = document.getElementById('email');
    if (emailField && emailField.value) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(emailField.value)) {
            markFieldAsError(emailField, 'Please enter a valid email address');
            errors.push('Please enter a valid email address');
            isValid = false;
        }
    }
    
    // Validate phone format
    const phoneField = document.getElementById('phone');
    if (phoneField && phoneField.value) {
        const phoneRegex = /^[\+]?[\d\s\-\(\)]{10,}$/;
        if (!phoneRegex.test(phoneField.value)) {
            markFieldAsError(phoneField, 'Please enter a valid phone number');
            errors.push('Please enter a valid phone number');
            isValid = false;
        }
    }
    
    // Validate dates
    const checkInField = document.getElementById('checkIn');
    const checkOutField = document.getElementById('checkOut');
    
    if (checkInField && checkOutField && checkInField.value && checkOutField.value) {
        const checkInDate = new Date(checkInField.value);
        const checkOutDate = new Date(checkOutField.value);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        if (checkInDate < today) {
            markFieldAsError(checkInField, 'Check-in date cannot be in the past');
            errors.push('Check-in date cannot be in the past');
            isValid = false;
        }
        
        if (checkOutDate <= checkInDate) {
            markFieldAsError(checkOutField, 'Check-out date must be after check-in date');
            errors.push('Check-out date must be after check-in date');
            isValid = false;
        }
    }
    
    // Validate number of guests
    const guestsField = document.getElementById('guests');
    if (guestsField && guestsField.value) {
        const guests = parseInt(guestsField.value);
        if (guests < 1 || guests > 10) {
            markFieldAsError(guestsField, 'Number of guests must be between 1 and 10');
            errors.push('Number of guests must be between 1 and 10');
            isValid = false;
        }
    }
    
    return { isValid, errors };
}

function markFieldAsError(field, message) {
    const formGroup = field.closest('.form-group');
    if (formGroup) {
        formGroup.classList.add('error');
        
        const errorDiv = document.createElement('div');
        errorDiv.className = 'field-error';
        errorDiv.textContent = message;
        formGroup.appendChild(errorDiv);
    }
}

// Add real-time validation
function setupRealTimeValidation() {
    const form = document.getElementById('bookingModal');
    if (!form) return;
    
    const fields = form.querySelectorAll('input, select');
    fields.forEach(field => {
        field.addEventListener('blur', () => {
            // Clear previous error for this field
            const formGroup = field.closest('.form-group');
            if (formGroup && formGroup.classList.contains('error')) {
                formGroup.classList.remove('error');
                const errorElement = formGroup.querySelector('.field-error');
                if (errorElement) {
                    errorElement.remove();
                }
                
                // Re-validate just this field
                validateSingleField(field);
            }
        });
        
        field.addEventListener('input', () => {
            // Clear error state on input
            const formGroup = field.closest('.form-group');
            if (formGroup && formGroup.classList.contains('error')) {
                formGroup.classList.remove('error');
                const errorElement = formGroup.querySelector('.field-error');
                if (errorElement) {
                    errorElement.remove();
                }
            }
        });
    });
}

function validateSingleField(field) {
    const fieldId = field.id;
    const value = field.value.trim();
    
    switch (fieldId) {
        case 'email':
            if (value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
                markFieldAsError(field, 'Please enter a valid email address');
            }
            break;
        case 'phone':
            if (value && !/^[\+]?[\d\s\-\(\)]{10,}$/.test(value)) {
                markFieldAsError(field, 'Please enter a valid phone number');
            }
            break;
        case 'checkIn':
            if (value) {
                const checkInDate = new Date(value);
                const today = new Date();
                today.setHours(0, 0, 0, 0);
                if (checkInDate < today) {
                    markFieldAsError(field, 'Check-in date cannot be in the past');
                }
            }
            break;
        case 'checkOut':
            if (value) {
                const checkInField = document.getElementById('checkIn');
                if (checkInField && checkInField.value) {
                    const checkInDate = new Date(checkInField.value);
                    const checkOutDate = new Date(value);
                    if (checkOutDate <= checkInDate) {
                        markFieldAsError(field, 'Check-out date must be after check-in date');
                    }
                }
            }
            break;
        case 'guests':
            if (value) {
                const guests = parseInt(value);
                if (guests < 1 || guests > 10) {
                    markFieldAsError(field, 'Number of guests must be between 1 and 10');
                }
            }
            break;
    }
}

// Initialize validation on modal open
document.addEventListener('DOMContentLoaded', function() {
    // Setup real-time validation when modal is opened
    const observer = new MutationObserver(function(mutations) {
        mutations.forEach(function(mutation) {
            if (mutation.type === 'attributes' && mutation.attributeName === 'style') {
                const modal = document.getElementById('bookingModal');
                if (modal && modal.style.display !== 'none' && !modal.hasAttribute('data-validation-setup')) {
                    setupRealTimeValidation();
                    modal.setAttribute('data-validation-setup', 'true');
                }
            }
        });
    });
    
    const modal = document.getElementById('bookingModal');
    if (modal) {
        observer.observe(modal, { attributes: true });
    }
});

// Network retry utility
async function retryRequest(requestFn, maxRetries = 3, delay = 1000) {
    let lastError;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            const result = await requestFn();
            return result;
        } catch (error) {
            lastError = error;
            
            // Don't retry for certain types of errors
            if (error.message.includes('validation') || 
                error.message.includes('400') ||
                error.message.includes('401') ||
                error.message.includes('403') ||
                error.message.includes('404')) {
                throw error;
            }
            
            if (attempt < maxRetries) {
                showNotification(`Connection failed. Retrying... (${attempt}/${maxRetries})`, 'warning', 2000);
                await new Promise(resolve => setTimeout(resolve, delay * attempt));
            }
        }
    }
    
    throw lastError;
}

// Enhanced search with retry
async function searchWithRetry() {
    try {
        showLoading(true);
        
        const result = await retryRequest(async () => {
            const searchData = {
                check_in: document.getElementById('checkInDate').value,
                check_out: document.getElementById('checkOutDate').value,
                adults: document.getElementById('guestCount').value || 1
            };
            
            // Validate dates first
            if (!searchData.check_in || !searchData.check_out) {
                throw new Error('Please select both check-in and check-out dates');
            }
            
            const checkInDate = new Date(searchData.check_in);
            const checkOutDate = new Date(searchData.check_out);
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            
            if (checkInDate < today) {
                throw new Error('Check-in date cannot be in the past');
            }
            
            if (checkOutDate <= checkInDate) {
                throw new Error('Check-out date must be after check-in date');
            }
            
            // Get pricing and availability with error handling
            const [pricingResponse, availabilityResponse] = await Promise.all([
                fetch('/api/pricing', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(searchData)
                }),
                fetch('/api/availability', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(searchData)
                })
            ]);
            
            // Check if responses are ok
            if (!pricingResponse.ok) {
                throw new Error(`Failed to fetch pricing data: ${pricingResponse.status}`);
            }
            if (!availabilityResponse.ok) {
                throw new Error(`Failed to fetch availability data: ${availabilityResponse.status}`);
            }
            
            const pricing = await pricingResponse.json();
            const availability = await availabilityResponse.json();
            
            // Check for error responses
            if (pricing.error) {
                throw new Error(pricing.error);
            }
            if (availability.error) {
                throw new Error(availability.error);
            }
            
            return { pricing, availability };
        });
        
        // Display rooms with the fetched data
        displayRooms(roomsData, result.pricing, result.availability);
        showNotification('Search completed successfully!', 'success');
        
    } catch (error) {
        console.error('Search error:', error);
        
        // Show detailed error message
        let errorMessage = 'An unexpected error occurred while searching for rooms.';
        
        if (error.message.includes('Failed to fetch')) {
            errorMessage = 'Unable to connect to the server. Please check your internet connection and try again.';
        } else if (error.message.includes('pricing') || error.message.includes('availability')) {
            errorMessage = 'Error retrieving room data. This might be due to invalid dates or server issues.';
        } else if (error.message) {
            errorMessage = error.message;
        }
        
        showNotification(errorMessage, 'error');
        
        // Also display error in the results area
        const roomsGrid = document.getElementById('roomsGrid');
        if (roomsGrid) {
            roomsGrid.innerHTML = `
                <div class="error-display">
                    <div class="error-icon">⚠️</div>
                    <h3>Search Error</h3>
                    <p>${errorMessage}</p>
                    <button onclick="searchWithRetry()" class="btn btn-primary">Try Again</button>
                </div>
            `;
        }
        
    } finally {
        showLoading(false);
    }
}

// Connection status monitoring
function monitorConnection() {
    let isOnline = navigator.onLine;
    
    function updateConnectionStatus() {
        const wasOnline = isOnline;
        isOnline = navigator.onLine;
        
        if (!wasOnline && isOnline) {
            showNotification('Connection restored! You can continue using the app.', 'success');
        } else if (wasOnline && !isOnline) {
            showNotification('Connection lost. Some features may not work properly.', 'warning', 0);
        }
    }
    
    window.addEventListener('online', updateConnectionStatus);
    window.addEventListener('offline', updateConnectionStatus);
    
    // Initial check
    if (!isOnline) {
        showNotification('You appear to be offline. Some features may not work properly.', 'warning', 0);
    }
}

// Utility functions
function formatDate(dateString) {
    const options = { 
        weekday: 'short', 
        year: 'numeric', 
        month: 'short', 
        day: 'numeric' 
    };
    return new Date(dateString).toLocaleDateString('en-US', options);
}

function showLoading(show) {
    const spinner = document.getElementById('loadingSpinner');
    spinner.style.display = show ? 'flex' : 'none';
}

function showNotification(message, type = 'info', duration = 5000) {
    // Remove existing notifications
    const existingNotifications = document.querySelectorAll('.notification');
    existingNotifications.forEach(n => n.remove());
    
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.innerHTML = `
        <div class="notification-content">
            <i class="fas fa-${type === 'success' ? 'check-circle' : type === 'error' ? 'exclamation-circle' : 'info-circle'}"></i>
            <span>${message}</span>
            <button onclick="this.parentElement.parentElement.remove()">
                <i class="fas fa-times"></i>
            </button>
        </div>
    `;
    
    document.body.appendChild(notification);
    
    // Auto remove after specified duration
    setTimeout(() => {
        if (notification.parentElement) {
            notification.remove();
        }
    }, duration);
}

function scrollToBooking() {
    document.getElementById('booking').scrollIntoView({ 
        behavior: 'smooth' 
    });
}

// Smooth scrolling for navigation links
document.addEventListener('DOMContentLoaded', function() {
    const navLinks = document.querySelectorAll('.nav-menu a[href^="#"]');
    navLinks.forEach(link => {
        link.addEventListener('click', function(e) {
            e.preventDefault();
            const targetId = this.getAttribute('href').substring(1);
            const targetElement = document.getElementById(targetId);
            if (targetElement) {
                targetElement.scrollIntoView({ behavior: 'smooth' });
            }
        });
    });
});

// Handle window resize
window.addEventListener('resize', function() {
    // Adjust modal position if open
    const modal = document.getElementById('bookingModal');
    if (modal.style.display === 'block') {
        // Recalculate modal position
        const modalContent = modal.querySelector('.modal-content');
        modalContent.style.marginTop = Math.max(window.innerHeight * 0.05, 20) + 'px';
    }
});

// Add CSS for notifications and confirmations
const additionalCSS = `
.notification {
    position: fixed;
    top: 20px;
    right: 20px;
    z-index: 4000;
    background: white;
    border-radius: 10px;
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.2);
    animation: slideInRight 0.3s ease;
    max-width: 400px;
}

.notification-content {
    padding: 1rem 1.5rem;
    display: flex;
    align-items: center;
    gap: 1rem;
}

.notification-success { border-left: 4px solid #28a745; }
.notification-error { border-left: 4px solid #dc3545; }
.notification-info { border-left: 4px solid #17a2b8; }

.notification-success i { color: #28a745; }
.notification-error i { color: #dc3545; }
.notification-info i { color: #17a2b8; }

.notification button {
    background: none;
    border: none;
    color: #999;
    cursor: pointer;
    margin-left: auto;
}

.confirmation-modal {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 5000;
    opacity: 0;
    transition: opacity 0.3s ease;
}

.confirmation-modal.show {
    opacity: 1;
}

.confirmation-content {
    background: white;
    padding: 3rem;
    border-radius: 20px;
    text-align: center;
    max-width: 500px;
    width: 90%;
    transform: translateY(-20px);
    transition: transform 0.3s ease;
}

.confirmation-modal.show .confirmation-content {
    transform: translateY(0);
}

.success-icon {
    font-size: 4rem;
    color: #28a745;
    margin-bottom: 1rem;
}

.confirmation-btn {
    background: linear-gradient(45deg, #28a745, #20c997);
    color: white;
    border: none;
    padding: 1rem 2rem;
    border-radius: 10px;
    font-size: 1rem;
    cursor: pointer;
    margin-top: 2rem;
}

.availability-warning {
    color: #dc3545;
    font-size: 0.9rem;
    margin-top: 0.5rem;
    font-weight: bold;
}

.price-item {
    display: flex;
    justify-content: space-between;
    margin-bottom: 0.5rem;
    padding: 0.5rem 0;
}

.price-item.total {
    border-top: 2px solid #e9ecef;
    margin-top: 1rem;
    padding-top: 1rem;
    font-size: 1.2rem;
}

.booking-info p {
    margin-bottom: 0.5rem;
    padding: 0.25rem 0;
}

@keyframes slideInRight {
    from {
        transform: translateX(100%);
        opacity: 0;
    }
    to {
        transform: translateX(0);
        opacity: 1;
    }
}

/* Mobile responsiveness for notifications */
@media (max-width: 768px) {
    .notification {
        top: 10px;
        right: 10px;
        left: 10px;
        max-width: none;
    }
    
    .confirmation-content {
        margin: 1rem;
        padding: 2rem;
    }
}
`;