// Direct port of lib/core/utils/validators.dart. Each returns undefined when
// valid, or an error message string when invalid.
const PHONE_RE = /^\+?\d{9,13}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const validators = {
  required(value: string, message = 'This field is required'): string | undefined {
    return value.trim().length === 0 ? message : undefined;
  },

  fullName(value: string, message = 'Enter your full name'): string | undefined {
    const words = value.trim().split(/\s+/).filter(Boolean);
    return words.length < 2 ? message : undefined;
  },

  phone(value: string, message = 'Enter a valid phone number'): string | undefined {
    return PHONE_RE.test(value.trim()) ? undefined : message;
  },

  email(value: string, message = 'Enter a valid email address'): string | undefined {
    return EMAIL_RE.test(value.trim()) ? undefined : message;
  },

  identifier(value: string, message = 'Enter a valid phone number or email'): string | undefined {
    const v = value.trim();
    return PHONE_RE.test(v) || EMAIL_RE.test(v) ? undefined : message;
  },

  password(value: string, message = 'At least 8 characters, letters and numbers'): string | undefined {
    if (value.length < 8) return message;
    if (!/[A-Za-z]/.test(value) || !/\d/.test(value)) return message;
    return undefined;
  },

  confirmPassword(value: string, original: string, message = 'Passwords do not match'): string | undefined {
    return value === original ? undefined : message;
  },
};
