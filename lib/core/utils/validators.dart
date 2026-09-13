import '../localization/app_localizations.dart';

/// Small validation helpers shared by auth and profile forms.
///
/// All functions return null when the value is valid, or an error message
/// otherwise — the layout Flutter's form validators expect.
class Validators {
  Validators._();

  static String? required(String? value, {String? message, AppLocalizations? l10n}) {
    final text = value?.trim() ?? '';
    if (text.isEmpty) {
      return message ?? l10n?.requiredField ?? 'This field is required';
    }
    return null;
  }

  static String? fullName(String? value, [AppLocalizations? l10n]) {
    final text = value?.trim() ?? '';
    if (text.isEmpty) return l10n?.fullNameRequired ?? 'Please enter your full name';
    if (text.split(RegExp(r'\s+')).length < 2) {
      return l10n?.fullNameInvalid ?? 'Enter your full name';
    }
    return null;
  }

  static String? phone(String? value, [AppLocalizations? l10n]) {
    final text = value?.trim() ?? '';
    if (text.isEmpty) return l10n?.phoneRequired ?? 'Please enter your phone number';
    if (!RegExp(r'^\+?\d{9,13}$').hasMatch(text.replaceAll(' ', ''))) {
      return l10n?.phoneInvalid ?? 'Enter a valid phone number';
    }
    return null;
  }

  static String? email(String? value, {bool required = false, AppLocalizations? l10n}) {
    final text = value?.trim() ?? '';
    if (text.isEmpty) {
      return required ? (l10n?.emailRequired ?? 'Please enter your email') : null;
    }
    if (!RegExp(r'^[^@\s]+@[^@\s]+\.[^@\s]+$').hasMatch(text)) {
      return l10n?.emailInvalid ?? 'Enter a valid email address';
    }
    return null;
  }

  static String? identifier(String? value, [AppLocalizations? l10n]) {
    final text = value?.trim() ?? '';
    if (text.isEmpty) return l10n?.identifierRequired ?? 'Enter your phone number or email';
    final isEmail = email(text, l10n: l10n) == null;
    final isValidPhone = phone(text, l10n) == null;
    if (!isEmail && !isValidPhone) {
      return l10n?.invalidIdentifier ?? 'Enter a valid phone number or email';
    }
    return null;
  }

  static String? password(String? value, [AppLocalizations? l10n]) {
    final text = value ?? '';
    if (text.isEmpty) return l10n?.passwordRequired ?? 'Please enter a password';
    if (text.length < 8) return l10n?.passwordShort ?? 'Password must be at least 8 characters';
    if (!RegExp(r'[A-Za-z]').hasMatch(text)) {
      return l10n?.passwordLetter ?? 'Password must contain a letter';
    }
    if (!RegExp(r'\d').hasMatch(text)) {
      return l10n?.passwordNumber ?? 'Password must contain a number';
    }
    return null;
  }

  static String? confirmPassword(String? value, {String? original, AppLocalizations? l10n}) {
    final text = value ?? '';
    if (text.isEmpty) return l10n?.confirmPasswordRequired ?? 'Please confirm your password';
    if (text != original) return l10n?.passwordMismatch ?? 'Passwords do not match';
    return null;
  }
}