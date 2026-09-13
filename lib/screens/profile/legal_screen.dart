import 'package:flutter/material.dart';

import '../../core/constants/app_colors.dart';

/// Terms of Service (step 36).
///
/// Placeholder text to be finalised by the company before release and
/// replaced by hosted legal documents when the backend is connected.
class TermsScreen extends StatelessWidget {
  const TermsScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.lightBackground,
      appBar: AppBar(title: const Text('Terms of Service')),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.all(20),
          children: const [
            _Section(title: '1. Agreement', body: _agreement),
            _Section(title: '2. Using the app', body: _usage),
            _Section(title: '3. Rides and fares', body: _rides),
            _Section(title: '4. Payments', body: _payments),
            _Section(title: '5. Your account', body: _account),
            _Section(title: '6. Limitation of liability', body: _liability),
            _Section(title: '7. Changes to these terms', body: _changes),
          ],
        ),
      ),
    );
  }
}

/// Privacy Policy (step 36).
class PrivacyScreen extends StatelessWidget {
  const PrivacyScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.lightBackground,
      appBar: AppBar(title: const Text('Privacy Policy')),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.all(20),
          children: const [
            _Section(
                title: '1. What we collect', body: 'Your name, phone number, '
                    'email, precise location while requesting or taking a ride, '
                    'trip history and payment data.'),
            _Section(
                title: '2. How we use it',
                body: 'To create accounts, match you with drivers, track '
                    'active rides, handle payments and provide support. We do '
                    'not sell personal data.'),
            _Section(
                title: '3. Sharing',
                body: 'Necessary trip details (pickup, destination, route) are '
                    'shared with the driver who accepts your ride. Data is not '
                    'shared with third parties for advertising.'),
            _Section(
                title: '4. Location',
                body: 'Your precise location is used during an active ride or '
                    'when you are finding a pickup point. It is not tracked in '
                    'the background.'),
            _Section(
                title: '5. Data retention & your rights',
                body: 'Trip data is kept for [12 months] and you may request '
                    'access or deletion of your personal data at any time by '
                    'contacting support.'),
            _Section(
                title: '6. Security',
                body: 'Data is transmitted securely and stored with restricted '
                    'access. You are responsible for keeping your login '
                    'details safe.'),
            _Section(
                title: '7. Questions',
                body: 'Contact privacy inquiries by email. Our current '
                    'support email is shown under Help & support.'),
          ],
        ),
      ),
    );
  }
}

class _Section extends StatelessWidget {
  const _Section({required this.title, required this.body});

  final String title;
  final String body;

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: AppColors.white,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: AppColors.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            title,
            style: const TextStyle(
              color: AppColors.black,
              fontSize: 14,
              fontWeight: FontWeight.w700,
            ),
          ),
          const SizedBox(height: 4),
          Text(
            body,
            style: const TextStyle(
              color: AppColors.secondaryText,
              fontSize: 13,
              height: 1.5,
            ),
          ),
        ],
      ),
    );
  }
}

const _agreement =
    'By creating an account or using FEM C@BS you agree to these Terms of '
    'Service and our Privacy Policy. If you do not agree, do not use the '
    'app. These terms are in draft form until finalised before launch.';

const _usage =
    'FEM C@BS provides passenger ride-hailing services. A passenger is at '
    'least 18 years old. Accounts are personal, your details must be accurate, '
    'and you must not misuse the app or interfere with other users.';

const _rides =
    'Ride prices are shown before booking based on distance. Final fares may '
    'differ when the official price engine is connected. You may cancel '
    'before a driver accepts; cancellation policies will be shown when they '
    'become active.';

const _payments =
    'Payment is required for every completed ride. Accepted methods are '
    'displayed at booking. Unpaid balances may block new rides until settled.';

const _account =
    'You are responsible for activity on your account. If you suspect '
    'unauthorized use, contact support immediately. We may suspend accounts '
    'that violate these terms.';

const _liability =
    'To the maximum extent permitted by law, FEM C@BS is not liable for '
    'indirect or incidental damages. Rides are provided by independent '
    'drivers on the platform at the time of travel.';

const _changes =
    'We may update these terms from time to time. Updated terms will be '
    'available in the app and take effect when published.';