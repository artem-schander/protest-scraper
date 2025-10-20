import { ObjectId } from 'mongodb';

export enum UserRole {
  USER = 'USER',
  MODERATOR = 'MODERATOR',
  ADMIN = 'ADMIN',
}

export interface User {
  _id?: ObjectId;
  email: string;
  password?: string; // hashed - optional for OAuth users
  role: UserRole;

  // Email verification
  emailVerified: boolean;
  verificationCodeHash?: string;
  verificationCodeExpires?: Date;
  verificationCodeAttempts?: number;

  // Account restrictions
  bannedUntil?: Date | null;
  bannedReason?: string;

  // OAuth
  oauthProvider?: 'google' | 'apple';
  oauthId?: string; // User ID from OAuth provider

  createdAt: Date;
  updatedAt: Date;
}

export interface UserRegistrationInput {
  email: string;
  password: string;
  role?: UserRole; // optional, defaults to USER
}

export interface UserLoginInput {
  email: string;
  password: string;
}

export interface UserResponse {
  id: string;
  email: string;
  role: UserRole;
  createdAt: Date;
  emailVerified?: boolean;
  bannedUntil?: Date | null;
  bannedReason?: string;
}

export interface JWTPayload {
  userId: string;
  email: string;
  role: UserRole;
  refreshUntil?: number; // Unix timestamp - token can be refreshed until this time
}
