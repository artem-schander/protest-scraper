import { Router, Request, Response } from 'express';
import { rateLimit } from 'express-rate-limit';
import { createHash } from 'crypto';
import { sendContactFormEmails, isEmailConfigured } from '@/services/email.js';

const router = Router();

/**
 * Verify proof-of-work challenge
 * Client must find a nonce where SHA-256(challenge + nonce) starts with '000'
 */
function verifyProofOfWork(pow: ProofOfWork): boolean {
  if (!pow || !pow.challenge || typeof pow.nonce !== 'number' || !pow.hash) {
    return false;
  }

  // Recreate the hash
  const text = pow.challenge + pow.nonce;
  const hash = createHash('sha256').update(text).digest('hex');

  // Verify hash matches and starts with required difficulty
  return hash === pow.hash && hash.startsWith('000');
}

// Rate limiter for contact form (prevent spam)
const contactLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 3, // 3 submissions per 15 minutes
  message: { error: 'Too many contact form submissions, please try again after 15 minutes' },
  standardHeaders: true,
  legacyHeaders: false,
});

interface ProofOfWork {
  challenge: string;
  nonce: number;
  hash: string;
}

interface ContactFormInput {
  name: string;
  email: string;
  topic: string;
  customTopic?: string;
  message: string;
  proofOfWork?: ProofOfWork;
}

// Valid topic options
const VALID_TOPICS = [
  'General Inquiry',
  'Suggest Data Source',
  'Technical Support',
  'Report Event Issue',
  'Partnership Inquiry',
  'Press & Media',
  'Privacy Concerns',
  'Legal Question',
  'Other'
];

// POST /api/contact - Submit contact form
router.post('/', contactLimiter, async (req: Request, res: Response): Promise<void> => {
  try {
    if (!isEmailConfigured()) {
      res.status(503).json({ error: 'Contact form is temporarily unavailable' });
      return;
    }

    const { name, email, topic, customTopic, message, proofOfWork }: ContactFormInput = req.body;

    // Validation
    if (!name || !email || !topic || !message) {
      res.status(400).json({ error: 'Name, email, topic, and message are required' });
      return;
    }

    // Validate proof-of-work (anti-spam)
    if (!proofOfWork || !verifyProofOfWork(proofOfWork)) {
      res.status(400).json({ error: 'Invalid security verification. Please reload the page and try again.' });
      return;
    }

    // Validate name
    if (typeof name !== 'string' || name.trim().length < 2 || name.trim().length > 100) {
      res.status(400).json({ error: 'Name must be between 2 and 100 characters' });
      return;
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      res.status(400).json({ error: 'Invalid email address' });
      return;
    }

    // Validate topic
    if (!VALID_TOPICS.includes(topic)) {
      res.status(400).json({ error: 'Invalid topic selected' });
      return;
    }

    // Validate custom topic if "Other" is selected
    if (topic === 'Other') {
      if (!customTopic || typeof customTopic !== 'string' || customTopic.trim().length < 3) {
        res.status(400).json({ error: 'Please specify a custom topic (minimum 3 characters)' });
        return;
      }
      if (customTopic.trim().length > 100) {
        res.status(400).json({ error: 'Custom topic must be less than 100 characters' });
        return;
      }
    }

    // Validate message
    if (typeof message !== 'string' || message.trim().length < 10) {
      res.status(400).json({ error: 'Message must be at least 10 characters long' });
      return;
    }

    if (message.trim().length > 5000) {
      res.status(400).json({ error: 'Message must be less than 5000 characters' });
      return;
    }

    // Send emails
    await sendContactFormEmails(
      name.trim(),
      email.trim(),
      topic,
      customTopic?.trim(),
      message.trim()
    );

    res.status(200).json({
      success: true,
      message: 'Your message has been sent successfully. We will get back to you soon.'
    });
  } catch (error) {
    console.error('Contact form error:', error);
    res.status(500).json({ error: 'Failed to send your message. Please try again later.' });
  }
});

export default router;
