import 'package:flutter/material.dart';

import '../../../core/constants/app_colors.dart';
import '../../../core/localization/app_localizations.dart';
import '../../../widgets/empty_state.dart';
import '../../services/driver_api_client.dart';

/// Driver notifications screen.
class DriverNotificationsScreen extends StatefulWidget {
  const DriverNotificationsScreen({super.key});

  @override
  State<DriverNotificationsScreen> createState() => _DriverNotificationsScreenState();
}

class _DriverNotificationsScreenState extends State<DriverNotificationsScreen> {
  List<Map<String, dynamic>> _notifications = [];
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final data = await driverApiClient.get('driver/notifications');
      final notifs = (data['notifications'] as List<dynamic>? ?? [])
          .map((n) => Map<String, dynamic>.from(n as Map))
          .toList();
      if (mounted) setState(() { _notifications = notifs; _loading = false; });
    } catch (_) {
      if (mounted) setState(() { _loading = false; });
    }
  }

  Future<void> _markAsRead(String id) async {
    try {
      await driverApiClient.post('driver/notifications/$id/read');
      _load();
    } catch (_) {}
  }

  Future<void> _markAllRead() async {
    try {
      await driverApiClient.post('driver/notifications/read-all');
      _load();
    } catch (_) {}
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    return Scaffold(
      backgroundColor: AppColors.lightBackground,
      appBar: AppBar(
        title: Text(l10n.notifications),
        actions: [
          TextButton(
            onPressed: _markAllRead,
            child: Text(l10n.markAllRead),
          ),
        ],
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator(color: AppColors.primaryGreen))
          : _notifications.isEmpty
              ? EmptyState(
                  icon: Icons.notifications_outlined,
                  title: l10n.noNotifications,
                  subtitle: 'You\'ll see ride updates and earnings here.',
                )
              : RefreshIndicator(
                  onRefresh: _load,
                  child: ListView.builder(
                    padding: const EdgeInsets.fromLTRB(20, 8, 20, 24),
                    itemCount: _notifications.length,
                    itemBuilder: (context, i) {
                      final n = _notifications[i];
                      final isRead = n['read'] as bool? ?? false;
                      return Padding(
                        padding: const EdgeInsets.only(bottom: 8),
                        child: Material(
                          color: isRead ? AppColors.white : AppColors.primaryGreen.withValues(alpha: 0.03),
                          borderRadius: BorderRadius.circular(12),
                          child: InkWell(
                            onTap: () {
                              if (!isRead) _markAsRead(n['id'] as String);
                            },
                            borderRadius: BorderRadius.circular(12),
                            child: Container(
                              padding: const EdgeInsets.all(14),
                              decoration: BoxDecoration(
                                borderRadius: BorderRadius.circular(12),
                                border: Border.all(
                                  color: isRead ? AppColors.border : AppColors.primaryGreen.withValues(alpha: 0.3)),
                              ),
                              child: Row(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  if (!isRead)
                                    Container(
                                      width: 8, height: 8, margin: const EdgeInsets.only(top: 5),
                                      decoration: BoxDecoration(
                                        color: AppColors.primaryGreen, shape: BoxShape.circle),
                                    ),
                                  if (!isRead) const SizedBox(width: 10),
                                  Expanded(
                                    child: Column(
                                      crossAxisAlignment: CrossAxisAlignment.start,
                                      children: [
                                        Text(n['title'] as String? ?? '',
                                          style: TextStyle(
                                            color: AppColors.black,
                                            fontSize: 14,
                                            fontWeight: isRead ? FontWeight.w500 : FontWeight.w700)),
                                        const SizedBox(height: 3),
                                        Text(n['body'] as String? ?? '',
                                          style: const TextStyle(
                                            color: AppColors.secondaryText, fontSize: 13, height: 1.4)),
                                      ],
                                    ),
                                  ),
                                ],
                              ),
                            ),
                          ),
                        ),
                      );
                    },
                  ),
                ),
    );
  }
}
