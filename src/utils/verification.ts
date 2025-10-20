import crypto from 'crypto';

export const VERIFICATION_CODE_LENGTH = 6;
export const VERIFICATION_CODE_EXPIRY_MINUTES = parseInt(
  process.env.EMAIL_VERIFICATION_EXPIRY_MINUTES || '30',
  10
);

const VERIFICATION_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function generateVerificationCode(length = VERIFICATION_CODE_LENGTH): string {
  let code = '';
  for (let i = 0; i < length; i += 1) {
    const randomIndex = crypto.randomInt(0, VERIFICATION_ALPHABET.length);
    code += VERIFICATION_ALPHABET[randomIndex];
  }
  return code;
}

export function hashVerificationCode(code: string): string {
  return crypto.createHash('sha256').update(code).digest('hex');
}
