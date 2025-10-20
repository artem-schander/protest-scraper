#!/usr/bin/env node
import { Command } from 'commander';
import { connectToDatabase, closeConnection, getDatabase } from '../db/connection.js';
import { UserRole } from '../types/user.js';

const program = new Command();

// Only set up CLI if running as script (not when imported)
if (import.meta.url === `file://${process.argv[1]}`) {
  program
    .name('set-user-role')
    .description('Update user role (USER, MODERATOR, ADMIN)')
    .requiredOption('-e, --email <email>', 'User email address')
    .requiredOption('-r, --role <role>', 'Role to assign (USER, MODERATOR, ADMIN)')
    .parse(process.argv);
}

async function setUserRole(email: string, role: string) {
  try {
    // Validate role
    const validRoles = Object.values(UserRole);
    const roleUpper = role.toUpperCase() as UserRole;

    if (!validRoles.includes(roleUpper)) {
      console.error(`❌ Invalid role: ${role}`);
      console.error(`   Valid roles: ${validRoles.join(', ')}`);
      process.exit(1);
    }

    // Connect to database
    console.log('🔌 Connecting to MongoDB...');
    await connectToDatabase();
    const db = getDatabase();

    // Find user
    const users = db.collection('users');
    const user = await users.findOne({ email });

    if (!user) {
      console.error(`❌ User not found: ${email}`);
      await closeConnection();
      process.exit(1);
    }

    // Check if role is already set
    if (user.role === roleUpper) {
      console.log(`ℹ️  User ${email} already has role ${roleUpper}`);
      await closeConnection();
      return;
    }

    // Update role
    const result = await users.updateOne(
      { email },
      {
        $set: {
          role: roleUpper,
          updatedAt: new Date()
        }
      }
    );

    if (result.modifiedCount === 1) {
      console.log(`✅ Updated ${email} from ${user.role} to ${roleUpper}`);
    } else {
      console.error('❌ Failed to update user role');
      process.exit(1);
    }

    await closeConnection();
  } catch (error) {
    console.error('❌ Error:', error);
    await closeConnection();
    process.exit(1);
  }
}

// Run if called as script
if (import.meta.url === `file://${process.argv[1]}`) {
  const options = program.opts();
  await setUserRole(options.email, options.role);
}
