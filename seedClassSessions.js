/**
 * CLASS SESSIONS SEEDER SCRIPT
 * 
 * This script creates class sessions for the current and next month.
 * Since the database changes monthly and there are NO concurrent classes,
 * each time slot only has one class.
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
    
    // Time slots configuration (no concurrent classes!)
    const timeSlots = [
        { hour: 6, minute: 0 },  // 6:00 AM
        { hour: 7, minute: 0 },  // 7:00 AM
        { hour: 8, minute: 0 },  // 8:00 AM
        { hour: 9, minute: 0 },  // 9:00 AM
        { hour: 10, minute: 0 }, // 10:00 AM (only on Saturdays)
    ];
    
    // Days of operation (Monday = 1, Saturday = 6)
    const operatingDays = [1, 2, 3, 4, 5, 6]; // Monday to Saturday
    
    while (currentDate <= endDate) {
        const dayOfWeek = currentDate.getDay();
        
        // Only create sessions for operating days
        if (operatingDays.includes(dayOfWeek)) {
            // Determine which time slots to use
            const dailySlots = dayOfWeek === 6 ? timeSlots.slice(0, 3) : timeSlots.slice(0, 4); // Saturday only until 8 AM
            
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
                const capacity = classType.defaultCapacity || 10;
                
                // Create session
                sessions.push({
                    classTypeId: classType._id,
                    startsAt: sessionDate,
                    capacity: capacity,
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
        
        console.log(`${colors.blue}📅 Generating class sessions...${colors.reset}`);
        
        // Generate sessions for current month
        const now = new Date();
        const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
        const currentMonthSessions = await generateSessionsForMonth(currentMonthStart, classTypes, instructors);
        
        // Generate sessions for next month
        const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1);
        const nextMonthSessions = await generateSessionsForMonth(nextMonthStart, classTypes, instructors);
        
        // Combine and insert all sessions
        const allSessions = [...currentMonthSessions, ...nextMonthSessions];
        const insertedSessions = await ClassSession.insertMany(allSessions);
        
        console.log(`${colors.green}✅ Successfully created ${insertedSessions.length} class sessions${colors.reset}`);
        
        // Display summary
        const sessionsByMonth = {};
        insertedSessions.forEach(session => {
            const monthKey = new Date(session.startsAt).toLocaleString('es-MX', { month: 'long', year: 'numeric' });
            sessionsByMonth[monthKey] = (sessionsByMonth[monthKey] || 0) + 1;
        });
        
        console.log(`${colors.cyan}📊 Sessions by month:${colors.reset}`);
        Object.entries(sessionsByMonth).forEach(([month, count]) => {
            console.log(`   • ${month}: ${count} sessions`);
        });
        
        return insertedSessions;
    } catch (error) {
        console.error(`${colors.red}❌ Error seeding class sessions:${colors.reset}`, error.message);
        throw error;
    }
}

/**
 * Main seeding function
 */
async function main() {
    console.log(`${colors.magenta}🌱 Starting class sessions seeding process...${colors.reset}\n`);
    
    try {
        await connectDatabase();
        console.log();
        
        const sessions = await seedClassSessions();
        console.log();
        
        console.log(`${colors.green}🎉 Class sessions seeding completed successfully!${colors.reset}`);
        console.log(`${colors.yellow}💡 Note: This seeder should be run monthly to generate new sessions${colors.reset}`);
        
    } catch (error) {
        console.error(`${colors.red}💥 Seeding process failed:${colors.reset}`, error.message);
        process.exit(1);
    } finally {
        await mongoose.connection.close();
        console.log(`${colors.blue}🔌 Database connection closed${colors.reset}`);
    }
}

// Run the seeder
if (require.main === module) {
    main();
}

module.exports = { seedClassSessions };