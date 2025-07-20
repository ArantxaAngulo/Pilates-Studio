/**
 * DATABASE SEEDER SCRIPT
 * 
 * This script populates the database with initial static data that the application
 * needs to function properly. It should be run ONCE when setting up the application.
 * 
 * To run: node seedDatabase.js
 * 
 * What this script does:
 * 1. Connects to MongoDB
 * 2. Clears existing static data (packages, classTypes, instructors)
 * 3. Inserts fresh seed data
 * 4. Provides feedback on the process
 * 5. Closes database connection
 */

require('dotenv').config();
const mongoose = require('mongoose');

// Import models
const Package = require('./schemas/packages.model');
const ClassType = require('./schemas/classTypes.model');
const Instructor = require('./schemas/instructors.model');

// Import seed data
const packagesData = require('./seed/packages.json');
const classTypesData = require('./seed/classTypes.json');
const instructorsData = require('./seed/instructors.json');

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
 * Uses the same connection string as the main application
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
 * Seeds the packages collection
 * Packages define the pricing structure and credit system for the business
 */
async function seedPackages() {
    try {
        console.log(`${colors.yellow}🗑️  Clearing existing packages...${colors.reset}`);
        await Package.deleteMany({});
        
        console.log(`${colors.blue}📦 Seeding packages...${colors.reset}`);
        const packages = await Package.insertMany(packagesData);
        
        console.log(`${colors.green}✅ Successfully seeded ${packages.length} packages${colors.reset}`);
        
        // Display what was created
        packages.forEach(pkg => {
            console.log(`   • ${pkg.name} - ${pkg.creditCount} credits - $${pkg.price} - Valid ${pkg.validDays} days`);
        });
        
        return packages;
    } catch (error) {
        console.error(`${colors.red}❌ Error seeding packages:${colors.reset}`, error.message);
        throw error;
    }
}

/**
 * Seeds the class types collection
 * Class types define what kinds of classes the studio offers
 * These are needed before creating class sessions
 */
async function seedClassTypes() {
    try {
        console.log(`${colors.yellow}🗑️  Clearing existing class types...${colors.reset}`);
        await ClassType.deleteMany({});
        
        console.log(`${colors.blue}🧘‍♀️ Seeding class types...${colors.reset}`);
        const classTypes = await ClassType.insertMany(classTypesData);
        
        console.log(`${colors.green}✅ Successfully seeded ${classTypes.length} class types${colors.reset}`);
        
        // Display what was created grouped by level
        const byLevel = classTypes.reduce((acc, type) => {
            if (!acc[type.level]) acc[type.level] = [];
            acc[type.level].push(type);
            return acc;
        }, {});
        
        Object.keys(byLevel).forEach(level => {
            console.log(`   ${colors.cyan}${level}:${colors.reset}`);
            byLevel[level].forEach(type => {
                console.log(`     • ${type.name} (Cap: ${type.defaultCapacity})`);
            });
        });
        
        return classTypes;
    } catch (error) {
        console.error(`${colors.red}❌ Error seeding class types:${colors.reset}`, error.message);
        throw error;
    }
}

/**
 * Seeds the instructors collection
 * Instructors are needed before creating class sessions
 * They also appear on the website's team page
 */
async function seedInstructors() {
    try {
        console.log(`${colors.yellow}🗑️  Clearing existing instructors...${colors.reset}`);
        await Instructor.deleteMany({});
        
        console.log(`${colors.blue}👨‍🏫 Seeding instructors...${colors.reset}`);
        const instructors = await Instructor.insertMany(instructorsData);
        
        console.log(`${colors.green}✅ Successfully seeded ${instructors.length} instructors${colors.reset}`);
        
        // Display what was created
        instructors.forEach(instructor => {
            const fullName = `${instructor.name.first} ${instructor.name.last}`;
            const certCount = instructor.certifications.length;
            console.log(`   • ${fullName} (${certCount} certifications)`);
        });
        
        return instructors;
    } catch (error) {
        console.error(`${colors.red}❌ Error seeding instructors:${colors.reset}`, error.message);
        throw error;
    }
}

/**
 * Main seeding function
 * Orchestrates the entire seeding process
 */
async function seedDatabase() {
    console.log(`${colors.magenta}🌱 Starting database seeding process...${colors.reset}\n`);
    
    try {
        // Connect to database
        await connectDatabase();
        
        console.log(); // Empty line for better readability
        
        // Seed all collections
        const packages = await seedPackages();
        console.log(); // Empty line
        
        const classTypes = await seedClassTypes();
        console.log(); // Empty line
        
        const instructors = await seedInstructors();
        console.log(); // Empty line
        
        // Summary
        console.log(`${colors.green}🎉 Database seeding completed successfully!${colors.reset}`);
        console.log(`${colors.cyan}📊 Summary:${colors.reset}`);
        console.log(`   • ${packages.length} packages created`);
        console.log(`   • ${classTypes.length} class types created`);
        console.log(`   • ${instructors.length} instructors created`);
        console.log();
        console.log(`${colors.yellow}💡 Next steps:${colors.reset}`);
        console.log(`   1. Start server: npm start or node server.js`);
        
    } catch (error) {
        console.error(`${colors.red}💥 Seeding process failed:${colors.reset}`, error.message);
        process.exit(1);
    } finally {
        // Always close the database connection
        await mongoose.connection.close();
        console.log(`${colors.blue}🔌 Database connection closed${colors.reset}`);
    }
}

/**
 * Handle script execution
 * Run the seeding process when this file is executed directly
 */
if (require.main === module) {
    seedDatabase();
}

module.exports = {
    seedDatabase,
    seedPackages,
    seedClassTypes,
    seedInstructors
};