/**
 * CLASS SESSIONS SEEDER SCRIPT
 * 
 * This script creates class sessions for the current and next month.
 * Since the database changes monthly and there are NO concurrent classes,
 * each time slot only has one class.
 * 
 * Updated Schedule:
 * - Monday to Friday: 6am-10am AND 4pm-8pm (1 hour intervals)
 * - Saturday: 8am-10am only (1 hour intervals)
 * 
 * To run: node seedClassSessions.js
 */

require('dotenv').config();
const mongoose = require('mongoose');
const ClassSession = require('./schemas/classSessions.model');
const ClassType = require('./schemas/classTypes.model');
const Instructor = require('./schemas/instructors.model');

// ANSI color codes for console output
const colors = {
    reset: '\x1b[0m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    magenta: '\x1b[35m',
    cyan: '\x1b[36m'
};

/**
 * Connects to MongoDB database
 */
async function connectDatabase() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log(`${colors.green}✅ Connected to MongoDB successfully${colors.reset}`);
    } catch (error) {
        console.error(`${colors.red}❌ Error connecting to MongoDB:${colors.reset}`, error.message);
        process.exit(1);
    }
}

/**
 * Generate class sessions for a given month
 * @param {Date} startDate - First day of the month
 * @param {Array} classTypes - Available class types
 * @param {Array} instructors - Available instructors
 */
async function generateSessionsForMonth(startDate, classTypes, instructors) {
    const sessions = [];
    const currentDate = new Date(startDate);
    const endDate = new Date(startDate.getFullYear(), startDate.getMonth() + 1, 0); // Last day of month
    
    // Morning time slots
    const morningSlots = [
        { hour: 6, minute: 0 },  // 6:00 AM
        { hour: 7, minute: 0 },  // 7:00 AM
        { hour: 8, minute: 0 },  // 8:00 AM
        { hour: 9, minute: 0 },  // 9:00 AM
    ];
    
    // Afternoon/Evening time slots
    const afternoonSlots = [
        { hour: 16, minute: 0 }, // 4:00 PM
        { hour: 17, minute: 0 }, // 5:00 PM
        { hour: 18, minute: 0 }, // 6:00 PM
        { hour: 19, minute: 0 }, // 7:00 PM
    ];
    
    // Saturday morning slots (8am-10am only)
    const saturdaySlots = [
        { hour: 8, minute: 0 },  // 8:00 AM
        { hour: 9, minute: 0 },  // 9:00 AM
    ];
    
    // Days of operation (Monday = 1, Saturday = 6)
    const operatingDays = [1, 2, 3, 4, 5, 6]; // Monday to Saturday
    
    while (currentDate <= endDate) {
        const dayOfWeek = currentDate.getDay();
        
        // Only create sessions for operating days
        if (operatingDays.includes(dayOfWeek)) {
            let dailySlots = [];
            
            if (dayOfWeek === 6) {
                // Saturday: 8am-10am only (NO afternoon slots)
                dailySlots = saturdaySlots;
            } else if (dayOfWeek === 0) {
                // Sunday: No classes
                dailySlots = [];
            } else {
                // Monday to Friday: 6am-10am AND 4pm-8pm
                dailySlots = [...morningSlots, ...afternoonSlots];
            }
            
            for (const slot of dailySlots) {
                // Create session datetime
                const sessionDate = new Date(currentDate);
                sessionDate.setHours(slot.hour, slot.minute, 0, 0);
                
                // Skip if session is in the past
                if (sessionDate < new Date()) continue;
                
                // Randomly select class type and instructor
                const classType = classTypes[Math.floor(Math.random() * classTypes.length)];
                const instructor = instructors[Math.floor(Math.random() * instructors.length)];
                
                // Set capacity based on class type
                const capacity = classType.defaultCapacity || 5;
                
                // Create session
                sessions.push({
                    classTypeId: classType._id,
                    startsAt: sessionDate,
                    capacity: 5,
                    reservedCount: 0, // Start with no reservations
                    instructorId: instructor._id
                });
            }
        }
        
        // Move to next day
        currentDate.setDate(currentDate.getDate() + 1);
    }
    
    return sessions;
}

/**
 * Seeds class sessions for current and next month
 */
async function seedClassSessions() {
    try {
        console.log(`${colors.yellow}🗑️  Clearing existing class sessions...${colors.reset}`);
        await ClassSession.deleteMany({});
        
        // Get all class types and instructors
        const classTypes = await ClassType.find({});
        const instructors = await Instructor.find({});
        
        if (classTypes.length === 0 || instructors.length === 0) {
            throw new Error('No class types or instructors found. Please run seedDatabase.js first.');
        }
        
        console.log(`${colors.cyan}📅 Creating sessions for current and next month...${colors.reset}`);
        
        // Generate for current month
        const currentMonth = new Date();
        currentMonth.setDate(1);
        currentMonth.setHours(0, 0, 0, 0);
        
        const currentMonthSessions = await generateSessionsForMonth(currentMonth, classTypes, instructors);
        
        // Generate for next month
        const nextMonth = new Date(currentMonth);
        nextMonth.setMonth(nextMonth.getMonth() + 1);
        
        const nextMonthSessions = await generateSessionsForMonth(nextMonth, classTypes, instructors);
        
        // Combine all sessions
        const allSessions = [...currentMonthSessions, ...nextMonthSessions];
        
        // Bulk insert
        if (allSessions.length > 0) {
            await ClassSession.insertMany(allSessions);
            console.log(`${colors.green}✅ Created ${allSessions.length} class sessions${colors.reset}`);
            
            // Display schedule summary
            console.log(`\n${colors.magenta}📊 Schedule Summary:${colors.reset}`);
            console.log(`- Monday to Friday: 6:00 AM - 10:00 AM & 4:00 PM - 8:00 PM`);
            console.log(`- Saturday: 8:00 AM - 10:00 AM`);
            console.log(`- Total sessions created: ${allSessions.length}`);
        }
        
    } catch (error) {
        console.error(`${colors.red}❌ Error seeding class sessions:${colors.reset}`, error.message);
        throw error;
    }
}

/**
 * Main execution
 */
async function main() {
    try {
        await connectDatabase();
        await seedClassSessions();
        console.log(`\n${colors.green}🎉 Class sessions seeding completed successfully!${colors.reset}`);
    } catch (error) {
        console.error(`${colors.red}❌ Seeding failed:${colors.reset}`, error.message);
    } finally {
        await mongoose.disconnect();
        console.log(`${colors.yellow}🔌 Disconnected from MongoDB${colors.reset}`);
    }
}

// Run the script
main();